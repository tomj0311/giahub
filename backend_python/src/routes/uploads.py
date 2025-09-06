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
        # Use tenant-isolated path: uploads/tenant_id/user_id/uploads/filename
        file_path = f"uploads/{user_id}/{collection_name}/{filename}"
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
