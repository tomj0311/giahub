"""
Knowledge Configuration and Upload routes (HTTP only)

Features:
- List available chunking components via filesystem discovery
- Introspect a chunking module to get constructor parameters
- CRUD knowledge prefix configurations stored in MongoDB collection 'knowledgeConfig'
- Upload files to MinIO at uploads/{tenant_id}/{user_id}/{prefix}/
"""

from __future__ import annotations

import os
import sys
import logging
from datetime import datetime
from io import BytesIO
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, status
from fastapi.responses import JSONResponse

from ..db import get_collections
from ..utils.auth import verify_token_middleware
from ..utils.rbac_middleware import RBACMiddleware
from src.utils.component_discovery import discover_components, get_detailed_class_info

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"]) 


# ---------------------- Component discovery & introspection -------------------
@router.get("/components")
async def get_components(folder: Optional[str] = None, user: dict = Depends(verify_token_middleware)):
    """Discover components in a specific folder. Example: folder=chunking"""
    if not folder:
        raise HTTPException(status_code=400, detail="folder parameter is required")
    try:
        comps = discover_components(folder=folder)
        return {"components": comps}
    except Exception as e:
        logger.error("Discovery failed: %s", e)
        raise HTTPException(status_code=500, detail="Failed to discover components")


@router.post("/introspect")
async def introspect(request: dict, user: dict = Depends(verify_token_middleware)):
    """Introspect a module path to extract class params. kind can be 'chunk'"""
    module_path = request.get("module_path")
    kind = request.get("kind", "chunk")
    if not module_path:
        raise HTTPException(status_code=400, detail="module_path is required")
    try:
        detailed = get_detailed_class_info(module_path, kind)
        if not detailed or not detailed.get("classes"):
            raise HTTPException(status_code=404, detail=f"No classes found for {module_path}")
        main_class = list(detailed["classes"].values())[0]
        return {
            "module_path": detailed["module_path"],
            "class_name": main_class["class_name"],
            "formatted_params": main_class.get("formatted_params", [])
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Introspection failed: %s", e)
        raise HTTPException(status_code=500, detail="Failed to introspect module")


# ---------------------- Mongo helpers ----------------------------------------
def _knowledge_col():
    return get_collections()["knowledgeConfig"]


async def _ensure_collection_indexes():
    col = _knowledge_col()
    try:
        await col.create_index("name", unique=True)
        await col.create_index("category")
        await col.create_index("tenantId")
        await col.create_index("created_at")
    except Exception as e:
        logger.warning("Index ensure for knowledgeConfig failed or already exists: %s", e)


# ---------------------- Categories -------------------------------------------
@router.get("/categories")
async def list_categories(user: dict = Depends(verify_token_middleware)):
    await _ensure_collection_indexes()
    cats = await _knowledge_col().distinct("category")
    cats = [c for c in cats if c and str(c).strip()]
    cats.sort()
    return {"categories": cats}


# ---------------------- Prefix CRUD ------------------------------------------
@router.get("/prefixes")
async def list_prefixes(user: dict = Depends(verify_token_middleware)):
    await _ensure_collection_indexes()
    cursor = _knowledge_col().find({}, {"name": 1, "_id": 0})
    names = [doc.get("name") async for doc in cursor]
    names.sort()
    return {"prefixes": names}


@router.get("/prefixes/{name}")
async def get_prefix(name: str, user: dict = Depends(verify_token_middleware)):
    await _ensure_collection_indexes()
    doc = await _knowledge_col().find_one({"name": name})
    if not doc:
        raise HTTPException(status_code=404, detail="Prefix not found")
    doc["id"] = str(doc.pop("_id"))
    return doc


@router.post("/prefixes")
async def upsert_prefix(payload: dict, user: dict = Depends(verify_token_middleware)):
    """Create or update a knowledge prefix configuration.

    Expected payload fields: name, category, chunk_strategy, chunk_strategy_params, chunk_size,
    chunk_overlap, add_context, search_knowledge, files (optional list of filenames)
    """
    await _ensure_collection_indexes()
    name = (payload.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")

    user_id = user.get("id") or user.get("userId") or "unknown"
    tenant_id = user.get("tenantId") or os.getenv("DEFAULT_TENANT_ID", "default")

    record = {
        "name": name,
        "category": payload.get("category", ""),
        "chunk_strategy": payload.get("chunk_strategy", ""),
        "chunk_strategy_params": payload.get("chunk_strategy_params", {}),
        "chunk_size": payload.get("chunk_size", 5000),
        "chunk_overlap": payload.get("chunk_overlap", 0),
        "add_context": payload.get("add_context", True),
        "search_knowledge": payload.get("search_knowledge", True),
        "files": payload.get("files", []),
        "tenantId": tenant_id,
        "userId": user_id,
        "updated_at": datetime.utcnow(),
    }

    # Create vs update
    existing = await _knowledge_col().find_one({"name": name})
    if existing:
        await _knowledge_col().update_one({"_id": existing["_id"]}, {"$set": record})
        action = "updated"
    else:
        record["created_at"] = datetime.utcnow()
        await _knowledge_col().insert_one(record)
        action = "created"

    return {"message": f"Prefix {action}", "name": name}


@router.delete("/prefixes/{name}")
async def delete_prefix(name: str, user: dict = Depends(verify_token_middleware)):
    await _ensure_collection_indexes()
    res = await _knowledge_col().delete_one({"name": name})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Prefix not found")
    return {"message": f"Prefix '{name}' deleted"}


# ---------------------- MinIO Uploads ----------------------------------------
try:
    from minio import Minio  # type: ignore
    _MINIO_IMPORT_ERROR: str | None = None
except Exception as _e:
    Minio = None  # type: ignore
    _MINIO_IMPORT_ERROR = repr(_e)


def _get_minio_client():
    global Minio, _MINIO_IMPORT_ERROR
    if Minio is None:
        try:
            from minio import Minio as _Minio  # type: ignore
            Minio = _Minio  # type: ignore
            _MINIO_IMPORT_ERROR = None
        except Exception as e:
            _MINIO_IMPORT_ERROR = repr(e)
            logger.error("MinIO import failed: %s | python=%s", _MINIO_IMPORT_ERROR, sys.executable)
            raise HTTPException(status_code=500, detail="MinIO client unavailable")
    endpoint = os.getenv("MINIO_ENDPOINT", "127.0.0.1:8803")
    access_key = os.getenv("MINIO_ACCESS_KEY", "minio")
    secret_key = os.getenv("MINIO_SECRET_KEY", "minio8888")
    secure = os.getenv("MINIO_SECURE", "false").lower() == "true"
    return Minio(endpoint, access_key=access_key, secret_key=secret_key, secure=secure)  # type: ignore


def _get_bucket_name() -> str:
    return os.getenv("MINIO_BUCKET", "hcp")


ALLOWED_TYPES = {
    'application/pdf',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain', 'text/csv', 'application/json',
    'application/javascript', 'text/javascript', 'text/x-python', 'application/x-python-code'
}


@router.post("/upload")
async def upload_knowledge_files(
    prefix: str,
    files: List[UploadFile] = File(...),
    user: dict = Depends(verify_token_middleware)
):
    """Upload files to MinIO under uploads/{tenant_id}/{user_id}/{prefix}/ and track in Mongo."""
    if not prefix:
        raise HTTPException(status_code=400, detail="prefix is required")
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded")

    user_id = user.get("id") or user.get("userId") or "unknown"
    tenant_id = user.get("tenantId") or os.getenv("DEFAULT_TENANT_ID", "default")

    # Basic RBAC check (collection-level write)
    ok = await RBACMiddleware.verify_collection_access(user_id=user_id, collection_name="uploads", operation="write")
    if not ok:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    try:
        client = _get_minio_client()
        bucket = _get_bucket_name()
        # ensure bucket
        try:
            if hasattr(client, "bucket_exists") and not client.bucket_exists(bucket):  # type: ignore
                client.make_bucket(bucket)  # type: ignore
        except Exception:
            pass

        uploaded = []
        for f in files:
            if f.content_type and f.content_type not in ALLOWED_TYPES:
                raise HTTPException(status_code=400, detail=f"File type not allowed: {f.filename}")
            content = await f.read()
            ts = int(datetime.utcnow().timestamp() * 1000)
            rand = os.urandom(4).hex()
            safe_name = f"{ts}-{rand}-{f.filename}"
            object_name = f"uploads/{tenant_id}/{user_id}/{prefix}/{safe_name}"
            stream = BytesIO(content)
            size = len(content)
            ctype = f.content_type or "application/octet-stream"
            client.put_object(bucket, object_name, stream, size, content_type=ctype)  # type: ignore
            uploaded.append({
                "filename": safe_name,
                "originalName": f.filename,
                "size": size,
                "mimetype": ctype,
                "key": object_name,
            })

        # Update prefix doc with uploaded filenames
        await _knowledge_col().update_one(
            {"name": prefix},
            {"$addToSet": {"files": {"$each": [u["filename"] for u in uploaded]}}, "$set": {"updated_at": datetime.utcnow()}},
            upsert=True,
        )

        return {"message": "Files uploaded", "files": uploaded, "bucket": bucket}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Upload failed: %s", e)
        raise HTTPException(status_code=500, detail="Upload failed")
import os
import sys
import logging
from datetime import datetime
from io import BytesIO
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status, Query
from fastapi.responses import JSONResponse

from ..db import get_collections
from ..utils.auth import verify_token_middleware

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])


# ---- MinIO helpers (mirrors uploads.py with different pathing) ----------------
try:
    from minio import Minio  # type: ignore
    _MINIO_IMPORT_ERROR: Optional[str] = None
except Exception as _e:  # pragma: no cover
    Minio = None  # type: ignore
    _MINIO_IMPORT_ERROR = repr(_e)


def get_minio_client():
    global Minio, _MINIO_IMPORT_ERROR
    if Minio is None:
        try:
            from minio import Minio as _Minio  # type: ignore
            Minio = _Minio  # type: ignore
            _MINIO_IMPORT_ERROR = None
        except Exception as e:  # pragma: no cover
            _MINIO_IMPORT_ERROR = repr(e)
            logger.error("MinIO import failed: %s | python=%s", _MINIO_IMPORT_ERROR, sys.executable)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="MinIO client unavailable: install 'minio' package on backend."
            )
    endpoint = os.getenv("MINIO_ENDPOINT", "127.0.0.1:8803")
    access_key = os.getenv("MINIO_ACCESS_KEY", "minio")
    secret_key = os.getenv("MINIO_SECRET_KEY", "minio8888")
    secure = os.getenv("MINIO_SECURE", "false").lower() == "true"
    return Minio(endpoint, access_key=access_key, secret_key=secret_key, secure=secure)  # type: ignore


def get_bucket_name() -> str:
    return os.getenv("MINIO_BUCKET", "hcp")


# ------------------------ HTTP endpoints --------------------------------------

@router.get("/defaults")
async def get_defaults(user: dict = Depends(verify_token_middleware)):
    """Return global defaults for knowledge chunking configuration."""
    defaults = {
        "chunk_size": int(os.getenv("KNOWLEDGE_CHUNK_SIZE", "5000")),
        "chunk_overlap": int(os.getenv("KNOWLEDGE_CHUNK_OVERLAP", "0")),
        "add_context": os.getenv("KNOWLEDGE_ADD_CONTEXT", "true").lower() == "true",
        "search_knowledge": os.getenv("KNOWLEDGE_SEARCH", "true").lower() == "true",
    }
    return {"defaults": defaults}


@router.get("/categories")
async def list_categories(user: dict = Depends(verify_token_middleware)):
    """Return distinct knowledge categories for the user's tenant."""
    collections = get_collections()
    tenant_id = user.get("tenantId") or "system"
    cats = await collections['knowledgeConfig'].distinct("category", {"tenantId": tenant_id})
    # filter out empty
    categories = [c for c in cats if c]
    return {"categories": categories}


@router.get("/prefixes")
async def list_prefixes(user: dict = Depends(verify_token_middleware)):
    collections = get_collections()
    tenant_id = user.get("tenantId") or "system"
    cursor = collections['knowledgeConfig'].find({"tenantId": tenant_id}, {"prefix": 1}).sort("prefix", 1)
    docs = await cursor.to_list(length=None)
    prefixes = sorted({d.get("prefix") for d in docs if d.get("prefix")})
    return {"prefixes": list(prefixes)}


@router.get("/prefix/{prefix}")
async def get_prefix(prefix: str, user: dict = Depends(verify_token_middleware)):
    collections = get_collections()
    tenant_id = user.get("tenantId") or "system"
    doc = await collections['knowledgeConfig'].find_one({"tenantId": tenant_id, "prefix": prefix})
    if not doc:
        raise HTTPException(status_code=404, detail="prefix not found")

    # Load files from MinIO under uploads/{tenantId}/{userId}/{prefix}
    try:
        client = get_minio_client()
        bucket_name = get_bucket_name()
        # If ownerId saved in doc use it, else current user
        owner_id = doc.get("ownerId") or user.get("id")
        path_prefix = f"uploads/{tenant_id}/{owner_id}/{prefix}/"
        objs = client.list_objects(bucket_name, prefix=path_prefix, recursive=True)  # type: ignore
        file_names: List[str] = []
        for obj in objs:
            name = getattr(obj, 'object_name', '')
            if name and name.startswith(path_prefix):
                file_names.append(name.split('/')[-1])
        doc["files"] = file_names
    except Exception as e:
        logger.warning("MinIO listing failed for prefix %s: %s", prefix, e)
        doc["files"] = []

    # shape compatible with UI
    return {
        "prefix": doc.get("prefix"),
        "category": doc.get("category", ""),
        "chunk": doc.get("chunk", {}),
        "created_at": doc.get("created_at"),
        "updated_at": doc.get("updated_at"),
        "files": [f"{doc.get('prefix')}/{fn}" for fn in doc.get("files", [])],
        "doc_counts": doc.get("doc_counts", {}),
        "files_by_type": doc.get("files_by_type", {}),
    }


@router.post("/prefix/save")
async def save_prefix(payload: dict, user: dict = Depends(verify_token_middleware)):
    """Create or update a knowledge prefix configuration in MongoDB."""
    collections = get_collections()
    tenant_id = user.get("tenantId") or "system"
    user_id = user.get("id") or "unknown"

    prefix = payload.get("prefix") or payload.get("name")
    if not prefix:
        raise HTTPException(status_code=400, detail="prefix is required")

    overwrite = bool(payload.get("overwrite"))
    now_ms = int(datetime.utcnow().timestamp() * 1000)

    doc = await collections['knowledgeConfig'].find_one({"tenantId": tenant_id, "prefix": prefix})
    if doc and not overwrite:
        return JSONResponse({"exists": True, "message": "prefix exists"}, status_code=200)

    record = {
        "tenantId": tenant_id,
        "ownerId": user_id,
        "prefix": prefix,
        "category": payload.get("category", ""),
        "chunk": payload.get("chunk", {
            "chunk_size": payload.get("chunk_size"),
            "chunk_overlap": payload.get("chunk_overlap"),
            "add_context": payload.get("add_context"),
            "search_knowledge": payload.get("search_knowledge"),
        }),
        "updated_at": now_ms,
    }
    if not doc:
        record["created_at"] = now_ms

    # Upsert
    await collections['knowledgeConfig'].update_one(
        {"tenantId": tenant_id, "prefix": prefix},
        {"$set": record},
        upsert=True
    )

    return {"ok": True, "prefix": prefix}


@router.delete("/prefix/{prefix}")
async def delete_prefix(prefix: str, user: dict = Depends(verify_token_middleware)):
    collections = get_collections()
    tenant_id = user.get("tenantId") or "system"
    res = await collections['knowledgeConfig'].delete_one({"tenantId": tenant_id, "prefix": prefix})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="prefix not found")
    return {"deleted": True, "prefix": prefix}


ALLOWED_TYPES = {
    'application/pdf',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain', 'text/csv', 'application/json',
    'text/x-python', 'application/javascript', 'text/javascript',
}

MAX_FILE_SIZE = 200 * 1024 * 1024


@router.post("/upload")
async def upload_knowledge_files(
    prefix: str = Query(..., description="Knowledge prefix name"),
    files: List[UploadFile] = File(...),
    user: dict = Depends(verify_token_middleware)
):
    """Upload files to MinIO under uploads/tenantId/userId/prefix/."""
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")

    tenant_id = user.get("tenantId") or "system"
    user_id = user.get("id") or "unknown"

    try:
        client = get_minio_client()
        bucket = get_bucket_name()

        # Ensure bucket exists (best-effort)
        try:
            if hasattr(client, "bucket_exists") and not client.bucket_exists(bucket):  # type: ignore
                client.make_bucket(bucket)  # type: ignore
        except Exception:
            pass

        results = []
        base_prefix = f"uploads/{tenant_id}/{user_id}/{prefix}"

        for f in files:
            if f.content_type and f.content_type not in ALLOWED_TYPES:
                raise HTTPException(status_code=400, detail=f"File type not allowed: {f.filename}")

            content = await f.read()
            if len(content) > MAX_FILE_SIZE:
                raise HTTPException(status_code=400, detail=f"File too large: {f.filename}")

            ts = int(datetime.utcnow().timestamp() * 1000)
            object_name = f"{base_prefix}/{ts}-{f.filename}"
            data_stream = BytesIO(content)
            content_type = f.content_type or "application/octet-stream"
            client.put_object(bucket, object_name, data_stream, len(content), content_type=content_type)  # type: ignore

            results.append({
                "filename": f.filename,
                "size": len(content),
                "key": object_name,
            })

        return {"uploaded": results, "bucket": bucket, "prefix": prefix}

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Knowledge upload failed: %s", e)
        raise HTTPException(status_code=500, detail="Upload failed")


@router.get("/diag")
async def diag():
    return {
        "minioImport": "ok" if Minio is not None else f"missing: {_MINIO_IMPORT_ERROR}",
        "endpoint": os.getenv("MINIO_ENDPOINT", "127.0.0.1:8803"),
        "bucket": get_bucket_name(),
    }
