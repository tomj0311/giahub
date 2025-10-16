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
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded")
    
    user_id = user.get("id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid user")
    
    try:
        clean_path = path.strip().strip('/')
        if not clean_path:
            raise HTTPException(status_code=400, detail="Path cannot be empty")
        
        uploaded_files = []
        errors = []
        
        for file in files:
            content = await file.read()
            object_name = f"{clean_path}/{file.filename}"
            
            success = await FileService.upload_file_content(object_name, content)
            
            if success:
                uploaded_files.append({"filename": file.filename, "path": object_name})
            else:
                errors.append({"filename": file.filename, "error": "Upload failed"})
        
        results = {"uploaded_files": uploaded_files, "errors": errors}
        
        return {
            "message": f"Files uploaded to {clean_path}",
            "path": clean_path,
            "files": results.get("uploaded_files", []),
            "errors": results.get("errors", [])
        }

    except Exception as e:
        logger.error(f"Upload failed: {e}")
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


@router.get("/download/{file_path:path}")
async def download_file_by_path(
    file_path: str,
    user: dict = Depends(verify_token_middleware)
):
    """Download a file from MinIO by its full path"""
    user_id = user.get("id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid user")
    
    try:
        content = await FileService.get_file_content(file_path)
        
        if not content:
            raise HTTPException(status_code=404, detail="File not found")
        
        filename = file_path.split('/')[-1]
        
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
        logger.error(f"Download failed: {e}")
        raise HTTPException(status_code=500, detail=f"Download failed: {str(e)}")


@router.get("/download/{path:path}")
async def download_file_by_path(
    path: str,
    user: dict = Depends(verify_token_middleware)
):
    """Download a file by its full path"""
    user_id = user.get("id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user"
        )
    
    try:
        # Get the file content
        content = await FileService.get_file_content(path)
        
        # Extract filename from path
        filename = path.split('/')[-1]

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
        logger.error(f"Download error for path {path}: {e}")
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
