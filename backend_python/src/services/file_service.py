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
        ".pdf",
        ".txt",
        ".doc",
        ".docx",
        ".md",
        ".csv",
        ".json",
        ".xml",
        ".html",
    }
    MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB

    @staticmethod
    async def validate_tenant_access(user: dict) -> str:
        """Validate tenant access and return tenant_id"""
        logger.debug(f"[FILE] Validating tenant access for user: {user.get('id')}")
        tenant_id = user.get("tenantId")
        if not tenant_id:
            logger.warning(
                f"[FILE] Missing tenant information for user: {user.get('id')}"
            )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User tenant information missing. Please re-login.",
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
            logger.warning(
                f"[FILE] Upload rejected - Invalid file type: {file_extension}"
            )
            raise HTTPException(
                status_code=400,
                detail=f"File type {file_extension} not allowed. Supported: {', '.join(cls.ALLOWED_EXTENSIONS)}",
            )

        # Check file size
        if file.size and file.size > cls.MAX_FILE_SIZE:
            raise HTTPException(
                status_code=400,
                detail=f"File size exceeds maximum allowed size of {cls.MAX_FILE_SIZE // (1024*1024)}MB",
            )

    @classmethod
    async def upload_file_to_minio(
        cls, file: UploadFile, tenant_id: str, user_id: str, collection: str
    ) -> Dict[str, Any]:
        """Upload file to MinIO storage"""
        logger.info(
            f"[FILE] Uploading file '{file.filename}' for tenant: {tenant_id}, collection: {collection}"
        )

        try:
            cls.validate_file(file)

            # Create file path: uploads/{tenant_id}/{user_id}/{collection}/
            file_path = f"uploads/{tenant_id}/{user_id}/{collection}/{file.filename}"

            # Check if file already exists
            file_exists = await cls.check_file_exists(file_path)
            warning_message = None
            if file_exists:
                warning_message = (
                    f"File '{file.filename}' already exists and will be overwritten"
                )
                logger.warning(
                    f"[FILE] File '{file.filename}' already exists at {file_path}. Overwriting existing file."
                )

            # Read file content
            content = await file.read()

            # Calculate file hash for deduplication
            file_hash = hashlib.md5(content).hexdigest()

            # Upload to MinIO
            success = await cls._upload_to_minio(file_path, content)

            if not success:
                raise HTTPException(
                    status_code=500, detail="Failed to upload file to storage"
                )

            file_info = {
                "filename": file.filename,
                "file_path": file_path,
                "file_size": len(content),
                "file_hash": file_hash,
                "content_type": file.content_type,
                "uploaded_at": datetime.utcnow(),
            }

            if warning_message:
                file_info["warning"] = warning_message

            logger.info(
                f"[FILE] Successfully uploaded file '{file.filename}' to {file_path}"
            )
            return file_info

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"[FILE] Failed to upload file '{file.filename}': {e}")
            raise HTTPException(status_code=500, detail="File upload failed")

    @classmethod
    async def upload_multiple_files(
        cls, files: List[UploadFile], tenant_id: str, user_id: str, collection: str
    ) -> List[Dict[str, Any]]:
        """Upload multiple files to MinIO storage"""
        if not files or all(not file.filename for file in files):
            raise HTTPException(status_code=400, detail="No files provided")

        results = []
        errors = []

        for file in files:
            if not file.filename:
                continue

            try:
                file_info = await cls.upload_file_to_minio(
                    file, tenant_id, user_id, collection
                )
                results.append(file_info)
            except Exception as e:
                error_info = {"filename": file.filename, "error": str(e)}
                errors.append(error_info)
                logger.error(f"[FILE] Failed to upload {file.filename}: {e}")

        if not results and errors:
            raise HTTPException(
                status_code=400, detail=f"All file uploads failed: {errors}"
            )

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
    async def list_files_in_collection(
        cls, tenant_id: str, user_id: str, collection: str
    ) -> List[str]:
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

        temp_file_path = os.path.join(
            temp_dir, f"{datetime.now().timestamp()}_{file.filename}"
        )

        try:
            async with aiofiles.open(temp_file_path, "wb") as f:
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

    @staticmethod
    async def check_file_exists(file_path: str) -> bool:
        """Check if file exists in MinIO"""
        try:
            minio_client = FileService._get_minio_client()
            bucket_name = "uploads"

            # Use stat_object to check if file exists
            minio_client.stat_object(bucket_name, file_path)
            return True

        except Exception:
            # File doesn't exist or other error
            return False

    @staticmethod
    async def upload_file_content(
        object_name: str, content: bytes, content_type: str = None
    ) -> bool:
        """Upload file content directly to MinIO with given object name"""
        try:
            logger.info(f"[FILE] Uploading content to object: {object_name}")

            # Use the internal MinIO upload method
            success = await FileService._upload_to_minio(object_name, content)

            if success:
                logger.info(f"[FILE] Successfully uploaded content to {object_name}")
                return True
            else:
                logger.error(f"[FILE] Failed to upload content to {object_name}")
                return False

        except Exception as e:
            logger.error(f"[FILE] Error uploading content to {object_name}: {e}")
            return False

    # Public MinIO operations for other services
    @staticmethod
    async def upload_file_content_to_path(file_path: str, content: bytes) -> bool:
        """Public method to upload content to a specific MinIO path"""
        return await FileService._upload_to_minio(file_path, content)

    @staticmethod
    async def delete_file_at_path(file_path: str) -> bool:
        """Public method to delete a file at a specific MinIO path"""
        return await FileService._delete_from_minio(file_path)

    @staticmethod
    async def list_files_at_path(path: str) -> List[str]:
        """Public method to list files at a specific MinIO path"""
        return await FileService._list_files_in_minio(path)

    @staticmethod
    async def get_file_content_from_path(file_path: str) -> bytes:
        """Public method to get file content from a specific MinIO path"""
        return await FileService._get_file_from_minio(file_path)

    @classmethod
    async def delete_all_files_from_collection(
        cls, tenant_id: str, user_id: str, collection: str
    ) -> Dict[str, Any]:
        """Delete all files from a specific collection in MinIO"""
        logger.info(
            f"[FILE] Deleting all files from collection '{collection}' for tenant: {tenant_id}, user: {user_id}"
        )
        
        try:
            # Create collection path
            collection_path = f"uploads/{tenant_id}/{user_id}/{collection}/"
            
            # List all files in the collection
            files = await cls._list_files_in_minio(collection_path)
            
            if not files:
                logger.info(f"[FILE] No files found in collection '{collection}' to delete")
                return {"deleted_files": [], "deleted_count": 0}
            
            deleted_files = []
            failed_files = []
            
            # Delete each file
            for file_path in files:
                try:
                    success = await cls._delete_from_minio(file_path)
                    if success:
                        deleted_files.append(file_path)
                        logger.debug(f"[FILE] Deleted file: {file_path}")
                    else:
                        failed_files.append(file_path)
                        logger.warning(f"[FILE] Failed to delete file: {file_path}")
                except Exception as e:
                    failed_files.append(file_path)
                    logger.error(f"[FILE] Error deleting file {file_path}: {e}")
            
            logger.info(
                f"[FILE] Collection cleanup completed. Deleted: {len(deleted_files)}, Failed: {len(failed_files)}"
            )
            
            return {
                "deleted_files": deleted_files,
                "failed_files": failed_files,
                "deleted_count": len(deleted_files),
                "failed_count": len(failed_files)
            }
            
        except Exception as e:
            logger.error(f"[FILE] Failed to delete files from collection {collection}: {e}")
            return {"deleted_files": [], "failed_files": [], "deleted_count": 0, "failed_count": 0, "error": str(e)}

    # MinIO client methods
    @staticmethod
    def _get_minio_client():
        """Get MinIO client for file storage"""
        from minio import Minio

        return Minio(
            f"{os.getenv('MINIO_HOST', 'localhost')}:{os.getenv('MINIO_PORT', '8803')}",
            access_key=os.getenv("MINIO_ACCESS_KEY", "minio"),
            secret_key=os.getenv("MINIO_SECRET_KEY", "minio8888"),
            secure=os.getenv("MINIO_SECURE", "false").lower() == "true",
        )

    @staticmethod
    async def _upload_to_minio(file_path: str, content: bytes) -> bool:
        """Upload content to MinIO"""
        try:
            minio_client = FileService._get_minio_client()
            bucket_name = "uploads"

            # Ensure bucket exists
            if not minio_client.bucket_exists(bucket_name):
                minio_client.make_bucket(bucket_name)

            # Upload file
            from io import BytesIO

            minio_client.put_object(
                bucket_name,
                file_path,
                BytesIO(content),
                length=len(content),
                content_type="application/octet-stream",
            )

            logger.info(f"[FILE] Successfully uploaded to MinIO: {file_path}")
            return True

        except Exception as e:
            logger.error(f"[FILE] MinIO upload failed for {file_path}: {e}")
            return False

    @staticmethod
    async def _delete_from_minio(file_path: str) -> bool:
        """Delete file from MinIO"""
        try:
            minio_client = FileService._get_minio_client()
            bucket_name = "uploads"

            minio_client.remove_object(bucket_name, file_path)
            logger.info(f"[FILE] Successfully deleted from MinIO: {file_path}")
            return True

        except Exception as e:
            logger.error(f"[FILE] MinIO delete failed for {file_path}: {e}")
            return False

    @staticmethod
    async def _list_files_in_minio(path: str) -> List[str]:
        """List files in MinIO path"""
        try:
            minio_client = FileService._get_minio_client()
            bucket_name = "uploads"

            if not minio_client.bucket_exists(bucket_name):
                return []

            objects = minio_client.list_objects(
                bucket_name, prefix=path, recursive=True
            )
            return [obj.object_name for obj in objects]

        except Exception as e:
            logger.error(f"[FILE] MinIO list failed for {path}: {e}")
            return []

    @staticmethod
    async def _get_file_from_minio(file_path: str) -> bytes:
        """Get file content from MinIO"""
        try:
            minio_client = FileService._get_minio_client()
            bucket_name = "uploads"

            response = minio_client.get_object(bucket_name, file_path)
            content = response.read()
            response.close()
            response.release_conn()

            logger.info(f"[FILE] Successfully retrieved from MinIO: {file_path}")
            return content

        except Exception as e:
            logger.error(f"[FILE] MinIO get failed for {file_path}: {e}")
            return b""
