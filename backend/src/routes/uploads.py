import os
import sys
from datetime import datetime
from typing import List
from fastapi import APIRouter, HTTPException, Depends, status, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from io import BytesIO

from ..utils.auth import verify_token_middleware
from ..utils.rbac_middleware import get_rbac_user, RBACMiddleware
from ..utils.log import logger
from ..services.file_service import FileService

try:  # Prefer eager import, but keep details if it fails
    from minio import Minio  # type: ignore
    _MINIO_IMPORT_ERROR: str | None = None
except Exception as _e:  # pragma: no cover - tests patch client, import may be absent
    Minio = None  # type: ignore
    _MINIO_IMPORT_ERROR = repr(_e)

router = APIRouter()


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
    tenant_id = user.get("tenantId")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user"
        )
    
    tenant_id = await FileService.validate_tenant_access(user)
    
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
        results = await FileService.upload_multiple_files(files, tenant_id, user_id, "uploads")
        
        return {
            "message": "Files uploaded successfully",
            "files": results.get("uploaded_files", []),
            "errors": results.get("errors", []),
            "userEmail": user.get("email", "unknown"),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Upload error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Upload failed"
        )


@router.post("/upload/{path:path}")
async def upload_files_to_path(
    path: str,
    files: List[UploadFile] = File(...),
    user: dict = Depends(verify_token_middleware)
):
    """Upload files directly to a specified MinIO path under uploads/{user_id}/{path}/"""
    logger.info(f"UPLOAD START: path={path}, files={len(files)}, user={user.get('id')}")
    
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded")
    
    user_id = user.get("id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid user")
    
    tenant_id = await FileService.validate_tenant_access(user)
    
    try:
        clean_path = path.strip().strip('/')
        if not clean_path:
            raise HTTPException(status_code=400, detail="Path cannot be empty")
        
        logger.info(f"UPLOAD CALLING FileService: clean_path={clean_path}")
        results = await FileService.upload_multiple_files(files, tenant_id, user_id, clean_path, path)
        logger.info(f"UPLOAD SUCCESS: {results}")
        
        return {
            "message": f"Files uploaded to {clean_path}",
            "path": clean_path,
            "files": results.get("uploaded_files", []),
            "errors": results.get("errors", [])
        }

    except Exception as e:
        logger.error(f"UPLOAD ERROR: {e}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@router.get("/files")
async def get_user_files(user: dict = Depends(verify_token_middleware)):
    """Get user's uploaded files"""
    user_id = user.get("id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user"
        )
    
    tenant_id = await FileService.validate_tenant_access(user)
    
    try:
        file_list = await FileService.list_files_in_collection(tenant_id, user_id, "uploads")
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
    user_id = user.get("id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user"
        )
    
    tenant_id = await FileService.validate_tenant_access(user)
    
    try:
        # Use tenant-isolated path: uploads/user_id/uploads/filename
        file_path = f"uploads/{user_id}/uploads/{filename}"
        content = await FileService.get_file_content(file_path)

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


@router.post("/simple-upload")
async def simple_upload_files(
    files: List[UploadFile] = File(...),
    collection: str = Form(""),
    task_id: str = Form(""),
    user: dict = Depends(verify_token_middleware)
):
    """Simple file upload to MinIO without vector indexing or knowledge processing.
    Just uploads files to storage with optional collection and task_id prefix."""
    
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded")
    
    if len(files) > 20:
        raise HTTPException(status_code=400, detail="Too many files. Maximum is 20 files.")
    
    user_id = user.get("id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid user")
    
    tenant_id = await FileService.validate_tenant_access(user)
    
    try:
        # Build path with collection and task_id: collection/task_id or just collection
        base_path = collection.strip() if collection.strip() else "simple-uploads"
        if task_id.strip():
            upload_path = f"{base_path}/{task_id.strip()}"
        else:
            upload_path = base_path
        
        logger.info(f"SIMPLE UPLOAD: path={upload_path}, files={len(files)}, user={user_id}, task_id={task_id}")
        
        results = await FileService.upload_multiple_files(files, tenant_id, user_id, upload_path)
        
        logger.info(f"SIMPLE UPLOAD SUCCESS: {results}")
        
        return {
            "message": "Files uploaded successfully to storage",
            "collection": base_path,
            "task_id": task_id,
            "full_path": upload_path,
            "files": results.get("uploaded_files", []),
            "errors": results.get("errors", []),
            "storage_only": True,
            "no_indexing": True
        }

    except Exception as e:
        logger.error(f"SIMPLE UPLOAD ERROR: {e}")
        raise HTTPException(status_code=500, detail=f"Simple upload failed: {str(e)}")


@router.get("/diag")
async def uploads_diagnostics():
    """Lightweight diagnostics to debug upload 500s without changing code."""
    return {
        "minioImport": "ok" if Minio is not None else f"missing: {_MINIO_IMPORT_ERROR}",
        "python": sys.executable,
        "fileService": "available",
        "maxFileSize": f"{FileService.MAX_FILE_SIZE // (1024*1024)}MB",
        "allowedExtensions": list(FileService.ALLOWED_EXTENSIONS),
        "env": {
            "MINIO_ENDPOINT": os.getenv("MINIO_ENDPOINT", "(unset)"),
            "MINIO_SECURE": os.getenv("MINIO_SECURE", "(unset)"),
            "MINIO_BUCKET": os.getenv("MINIO_BUCKET", "(unset)"),
        },
    }
