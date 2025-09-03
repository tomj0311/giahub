import os
import sys
from datetime import datetime
from typing import List
from fastapi import APIRouter, HTTPException, Depends, status, UploadFile, File
from fastapi.responses import StreamingResponse
from io import BytesIO

from ..utils.auth import verify_token_middleware
from ..utils.rbac_middleware import get_rbac_user, RBACMiddleware
from ..utils.log import logger

try:  # Prefer eager import, but keep details if it fails
    from minio import Minio  # type: ignore
    _MINIO_IMPORT_ERROR: str | None = None
except Exception as _e:  # pragma: no cover - tests patch client, import may be absent
    Minio = None  # type: ignore
    _MINIO_IMPORT_ERROR = repr(_e)

router = APIRouter()

# Allowed file types
ALLOWED_TYPES = {
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain', 'text/csv',
    'application/json'
}

# File size limit (200MB)
MAX_FILE_SIZE = 200 * 1024 * 1024


def validate_file(file: UploadFile) -> None:
    """Validate uploaded file"""
    if file.content_type not in ALLOWED_TYPES:
        logger.warning(f"[UPLOAD] Rejected file type: {file.content_type} for file: {file.filename}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File type not allowed"
        )
    
    # Note: FastAPI doesn't provide file size during upload
    # Size validation would need to be done during reading


# --- MinIO helpers -----------------------------------------------------------
def get_minio_client():
        """Create a MinIO client from environment variables.

        Defaults:
            - endpoint: 127.0.0.1:8803
            - access/secret: minioadmin/minioadmin
            - secure: False
        """
        # Lazy import in case the module was installed after process start
        global Minio, _MINIO_IMPORT_ERROR
        if Minio is None:
            try:
                from minio import Minio as _Minio  # type: ignore
                Minio = _Minio  # type: ignore
                _MINIO_IMPORT_ERROR = None
            except Exception as e:  # pragma: no cover
                _MINIO_IMPORT_ERROR = repr(e)
                # Log helpful diagnostics
                logger.error(f"[UPLOAD] MinIO import failed: {_MINIO_IMPORT_ERROR} | python={sys.executable}")
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="MinIO client unavailable: install the 'minio' package on the backend or configure storage."
                )
        endpoint = os.getenv("MINIO_ENDPOINT", "127.0.0.1:8803")
        access_key = os.getenv("MINIO_ACCESS_KEY", "minio")
        secret_key = os.getenv("MINIO_SECRET_KEY", "minio8888")
        secure = os.getenv("MINIO_SECURE", "false").lower() == "true"
        # The tests will monkeypatch this function to return a fake client
        return Minio(endpoint, access_key=access_key, secret_key=secret_key, secure=secure)  # type: ignore


def get_bucket_name() -> str:
    return os.getenv("MINIO_BUCKET", "hcp")


@router.post("/upload")
async def upload_files(
    files: List[UploadFile] = File(...),
    user: dict = Depends(get_rbac_user)
):
    """Upload files to MinIO S3 bucket with user email prefix and role-based access control."""
    if not files:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No files uploaded"
        )
    
    if len(files) > 10:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Too many files. Maximum is 10 files."
        )
    
    # Check if user has access to upload files
    user_id = user.get("id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user"
        )
    
    # Verify collection access for uploads
    has_access = await RBACMiddleware.verify_collection_access(
        user_id=user_id,
        collection_name="uploads",
        operation="write"
    )
    
    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to upload files"
        )
    
    try:
        client = get_minio_client()
        bucket_name = get_bucket_name()
        user_email = user.get("email") or "unknown"

        # Ensure bucket exists
        try:
            if hasattr(client, "bucket_exists") and not client.bucket_exists(bucket_name):  # type: ignore
                client.make_bucket(bucket_name)  # type: ignore
        except Exception:
            # If check fails, continue and let put_object surface errors
            pass

        results = []

        for file in files:
            validate_file(file)

            content = await file.read()
            if len(content) > MAX_FILE_SIZE:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"File {file.filename} too large. Maximum size is 200MB."
                )

            timestamp = int(datetime.now().timestamp() * 1000)
            random_part = os.urandom(4).hex()
            filename = f"{timestamp}-{random_part}-{file.filename}"
            object_name = f"{user_email}/{filename}"

            # Upload to MinIO
            data_stream = BytesIO(content)
            size = len(content)
            content_type = file.content_type or "application/octet-stream"
            client.put_object(bucket_name, object_name, data_stream, size, content_type=content_type)  # type: ignore

            results.append({
                "filename": filename,
                "originalName": file.filename,
                "size": size,
                "mimetype": content_type,
                "key": object_name,
            })

        return {
            "message": "Files uploaded successfully",
            "files": results,
            "userEmail": user_email,
            "bucket": bucket_name,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Upload error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Upload failed"
        )


@router.get("/files")
async def get_user_files(user: dict = Depends(verify_token_middleware)):
    """Get user's uploaded files"""
    try:
        client = get_minio_client()
        bucket_name = get_bucket_name()
        user_email = user.get("email") or "unknown"

        # List objects with user's prefix
        prefix = f"{user_email}/"
        objs = client.list_objects(bucket_name, prefix=prefix, recursive=True)  # type: ignore

        file_list = []
        for obj in objs:
            # obj.object_name like 'email/filename'
            name = obj.object_name.split("/", 1)[1] if "/" in obj.object_name else obj.object_name
            file_list.append({
                "filename": name,
                "size": getattr(obj, "size", None),
                "uploadDate": getattr(obj, "last_modified", None),
                "key": obj.object_name,
            })

        return {"files": file_list}

    except Exception as e:
        logger.error(f"Error fetching files: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch files"
        )


@router.get("/files/{filename}")
async def download_file(
    filename: str,
    user: dict = Depends(verify_token_middleware)
):
    """Download a file by filename"""
    try:
        client = get_minio_client()
        bucket_name = get_bucket_name()
        user_email = user.get("email") or "unknown"

        object_name = f"{user_email}/{filename}"
        try:
            obj = client.get_object(bucket_name, object_name)  # type: ignore
        except Exception:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

        # Read entire content
        try:
            content = obj.read()  # type: ignore
        except Exception:
            # Some clients return a stream-like object with read()
            content = obj.read() if hasattr(obj, "read") else bytes()

        def iterfile():
            yield content

        return StreamingResponse(
            iterfile(),
            media_type="application/octet-stream",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Download error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to download file"
        )


@router.get("/diag")
async def uploads_diagnostics():
    """Lightweight diagnostics to debug upload 500s without changing code."""
    return {
        "minioImport": "ok" if Minio is not None else f"missing: {_MINIO_IMPORT_ERROR}",
        "python": sys.executable,
        "env": {
            "MINIO_ENDPOINT": os.getenv("MINIO_ENDPOINT", "(unset)"),
            "MINIO_SECURE": os.getenv("MINIO_SECURE", "(unset)"),
            "MINIO_BUCKET": os.getenv("MINIO_BUCKET", "(unset)"),
        },
    }
