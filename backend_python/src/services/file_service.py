"""
File Service

This service handles all file-related business logic including file uploads,
MinIO operations, file validation, and file management.
"""

import os
import hashlib
from datetime import datetime
from typing import List, Optional, Dict, Any, BinaryIO
from fastapi import HTTPException, status, UploadFile
import aiofiles

from ..utils.log import logger


class FileService:
    """Service for managing file operations"""
    
    # Allowed file types and size limits
    ALLOWED_EXTENSIONS = {
        '.pdf', '.txt', '.doc', '.docx', '.md', '.csv', '.json', '.xml', '.html'
    }
    MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB
    
    @staticmethod
    async def validate_tenant_access(user: dict) -> str:
        """Validate tenant access and return tenant_id"""
        logger.debug(f"[FILE] Validating tenant access for user: {user.get('id')}")
        tenant_id = user.get("tenantId")
        if not tenant_id:
            logger.warning(f"[FILE] Missing tenant information for user: {user.get('id')}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User tenant information missing. Please re-login."
            )
        logger.debug(f"[FILE] Tenant access validated: {tenant_id}")
        return tenant_id
    
    @classmethod
    def validate_file(cls, file: UploadFile) -> None:
        """Validate uploaded file"""
        logger.info(f"[FILE] Validating file: {file.filename}")
        
        if not file.filename:
            logger.warning("[FILE] Upload rejected - No filename provided")
            raise HTTPException(status_code=400, detail="No filename provided")
        
        # Check file extension
        file_extension = os.path.splitext(file.filename.lower())[1]
        logger.debug(f"[FILE] File extension: {file_extension}")
        
        if file_extension not in cls.ALLOWED_EXTENSIONS:
            logger.warning(f"[FILE] Upload rejected - Invalid file type: {file_extension}")
            raise HTTPException(
                status_code=400, 
                detail=f"File type {file_extension} not allowed. Supported: {', '.join(cls.ALLOWED_EXTENSIONS)}"
            )
        
        # Check file size
        if file.size and file.size > cls.MAX_FILE_SIZE:
            raise HTTPException(
                status_code=400, 
                detail=f"File size exceeds maximum allowed size of {cls.MAX_FILE_SIZE // (1024*1024)}MB"
            )
    
    @classmethod
    async def upload_file_to_minio(cls, file: UploadFile, tenant_id: str, user_id: str, collection: str) -> Dict[str, Any]:
        """Upload file to MinIO storage"""
        logger.info(f"[FILE] Uploading file '{file.filename}' for tenant: {tenant_id}, collection: {collection}")
        
        try:
            cls.validate_file(file)
            
            # Create file path: uploads/{tenant_id}/{user_id}/{collection}/
            file_path = f"uploads/{tenant_id}/{user_id}/{collection}/{file.filename}"
            
            # Read file content
            content = await file.read()
            
            # Calculate file hash for deduplication
            file_hash = hashlib.md5(content).hexdigest()
            
            # Upload to MinIO (placeholder - implement actual MinIO client)
            success = await cls._upload_to_minio(file_path, content)
            
            if not success:
                raise HTTPException(status_code=500, detail="Failed to upload file to storage")
            
            file_info = {
                "filename": file.filename,
                "file_path": file_path,
                "file_size": len(content),
                "file_hash": file_hash,
                "content_type": file.content_type,
                "uploaded_at": datetime.utcnow()
            }
            
            logger.info(f"[FILE] Successfully uploaded file '{file.filename}' to {file_path}")
            return file_info
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"[FILE] Failed to upload file '{file.filename}': {e}")
            raise HTTPException(status_code=500, detail="File upload failed")
    
    @classmethod
    async def upload_multiple_files(cls, files: List[UploadFile], tenant_id: str, user_id: str, collection: str) -> List[Dict[str, Any]]:
        """Upload multiple files to MinIO storage"""
        if not files or all(not file.filename for file in files):
            raise HTTPException(status_code=400, detail="No files provided")
        
        results = []
        errors = []
        
        for file in files:
            if not file.filename:
                continue
                
            try:
                file_info = await cls.upload_file_to_minio(file, tenant_id, user_id, collection)
                results.append(file_info)
            except Exception as e:
                error_info = {
                    "filename": file.filename,
                    "error": str(e)
                }
                errors.append(error_info)
                logger.error(f"[FILE] Failed to upload {file.filename}: {e}")
        
        if not results and errors:
            raise HTTPException(status_code=400, detail=f"All file uploads failed: {errors}")
        
        response = {"uploaded_files": results}
        if errors:
            response["errors"] = errors
        
        return response
    
    @classmethod
    async def delete_file_from_minio(cls, file_path: str) -> bool:
        """Delete file from MinIO storage"""
        try:
            # Implement actual MinIO deletion
            success = await cls._delete_from_minio(file_path)
            
            if success:
                logger.info(f"[FILE] Successfully deleted file: {file_path}")
            else:
                logger.warning(f"[FILE] Failed to delete file: {file_path}")
                
            return success
            
        except Exception as e:
            logger.error(f"[FILE] Error deleting file {file_path}: {e}")
            return False
    
    @classmethod
    async def list_files_in_collection(cls, tenant_id: str, user_id: str, collection: str) -> List[str]:
        """List files in a specific collection"""
        try:
            # Create collection path
            collection_path = f"uploads/{tenant_id}/{user_id}/{collection}/"
            
            # List files from MinIO (placeholder)
            files = await cls._list_files_in_minio(collection_path)
            
            return files
            
        except Exception as e:
            logger.error(f"[FILE] Failed to list files in collection {collection}: {e}")
            return []
    
    @classmethod
    async def get_file_content(cls, file_path: str) -> bytes:
        """Get file content from MinIO"""
        try:
            content = await cls._get_file_from_minio(file_path)
            return content
            
        except Exception as e:
            logger.error(f"[FILE] Failed to get file content for {file_path}: {e}")
            raise HTTPException(status_code=404, detail="File not found")
    
    @staticmethod
    async def save_temp_file(file: UploadFile) -> str:
        """Save uploaded file temporarily for processing"""
        temp_dir = "/tmp/uploads"
        os.makedirs(temp_dir, exist_ok=True)
        
        temp_file_path = os.path.join(temp_dir, f"{datetime.now().timestamp()}_{file.filename}")
        
        try:
            async with aiofiles.open(temp_file_path, 'wb') as f:
                content = await file.read()
                await f.write(content)
            
            return temp_file_path
            
        except Exception as e:
            logger.error(f"[FILE] Failed to save temp file: {e}")
            raise HTTPException(status_code=500, detail="Failed to save temporary file")
    
    @staticmethod
    def cleanup_temp_file(file_path: str):
        """Clean up temporary file"""
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
                logger.debug(f"[FILE] Cleaned up temp file: {file_path}")
        except Exception as e:
            logger.warning(f"[FILE] Failed to cleanup temp file {file_path}: {e}")
    
    # MinIO client methods (placeholder implementations)
    @staticmethod
    async def _upload_to_minio(file_path: str, content: bytes) -> bool:
        """Upload content to MinIO (placeholder)"""
        # TODO: Implement actual MinIO client upload
        # For now, simulate successful upload
        logger.debug(f"[FILE] MinIO upload simulation for: {file_path}")
        return True
    
    @staticmethod
    async def _delete_from_minio(file_path: str) -> bool:
        """Delete file from MinIO (placeholder)"""
        # TODO: Implement actual MinIO client deletion
        logger.debug(f"[FILE] MinIO delete simulation for: {file_path}")
        return True
    
    @staticmethod
    async def _list_files_in_minio(path: str) -> List[str]:
        """List files in MinIO path (placeholder)"""
        # TODO: Implement actual MinIO client listing
        logger.debug(f"[FILE] MinIO list simulation for: {path}")
        return []
    
    @staticmethod
    async def _get_file_from_minio(file_path: str) -> bytes:
        """Get file content from MinIO (placeholder)"""
        # TODO: Implement actual MinIO client download
        logger.debug(f"[FILE] MinIO download simulation for: {file_path}")
        return b""
