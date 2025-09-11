"""
Workflow Configuration Service

This service handles all workflow configuration business logic including
workflow management, BPMN file storage, and workflow-related operations.
"""

import os
from datetime import datetime
from typing import List, Optional, Dict, Any
from fastapi import HTTPException, status, UploadFile

from ..utils.log import logger
from ..utils.mongo_storage import MongoStorageService
from .file_service import FileService


class WorkflowConfigService:
    """Service for managing workflow configurations"""
    
    # Allowed BPMN file extensions
    ALLOWED_BPMN_EXTENSIONS = {".bpmn", ".xml"}
    MAX_BPMN_FILE_SIZE = 50 * 1024 * 1024  # 50MB
    
    @staticmethod
    async def validate_tenant_access(user: dict) -> str:
        """Validate tenant access and return tenant_id"""
        logger.debug(f"[WORKFLOW] Validating tenant access for user: {user.get('id')}")
        tenant_id = user.get("tenantId")
        if not tenant_id:
            logger.warning(f"[WORKFLOW] Missing tenant information for user: {user.get('id')}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User tenant information missing. Please re-login."
            )
        logger.debug(f"[WORKFLOW] Tenant access validated: {tenant_id}")
        return tenant_id
    
    @staticmethod
    def validate_bpmn_file(file: UploadFile) -> None:
        """Validate uploaded BPMN file"""
        logger.info(f"[WORKFLOW] Validating BPMN file: {file.filename}")

        if not file.filename:
            logger.warning("[WORKFLOW] Upload rejected - No filename provided")
            raise HTTPException(status_code=400, detail="No filename provided")

        # Check file extension
        file_extension = os.path.splitext(file.filename.lower())[1]
        logger.debug(f"[WORKFLOW] File extension: {file_extension}")

        if file_extension not in WorkflowConfigService.ALLOWED_BPMN_EXTENSIONS:
            logger.warning(
                f"[WORKFLOW] Upload rejected - Invalid file type: {file_extension}"
            )
            raise HTTPException(
                status_code=400,
                detail=f"File type {file_extension} not allowed. Supported: {', '.join(WorkflowConfigService.ALLOWED_BPMN_EXTENSIONS)}",
            )

        # Check file size
        if file.size and file.size > WorkflowConfigService.MAX_BPMN_FILE_SIZE:
            raise HTTPException(
                status_code=400,
                detail=f"File size exceeds maximum allowed size of {WorkflowConfigService.MAX_BPMN_FILE_SIZE // (1024*1024)}MB",
            )
    
    @classmethod
    async def list_workflow_configs_paginated(
        cls,
        user: dict,
        page: int = 1,
        page_size: int = 8,
        category: Optional[str] = None,
        search: Optional[str] = None,
        sort_by: str = "name",
        sort_order: str = "asc"
    ) -> Dict[str, Any]:
        """List workflow configurations with pagination"""
        tenant_id = await cls.validate_tenant_access(user)
        logger.info(f"[WORKFLOW] Listing paginated workflow configs for tenant: {tenant_id}")
        
        try:
            # Build query
            query = {}
            if category:
                query["category"] = category
            if search:
                query["$or"] = [
                    {"name": {"$regex": search, "$options": "i"}},
                    {"description": {"$regex": search, "$options": "i"}}
                ]
            
            # Calculate pagination
            skip = (page - 1) * page_size
            sort_direction = 1 if sort_order == "asc" else -1
            
            logger.debug(f"[WORKFLOW] Query: {query}, Skip: {skip}, Limit: {page_size}")
            
            # Get total count
            total_count = await MongoStorageService.count_documents("workflowConfig", query, tenant_id=tenant_id)
            logger.debug(f"[WORKFLOW] Total count: {total_count}")
            
            # Get documents
            docs = await MongoStorageService.find_many(
                "workflowConfig", 
                query, 
                tenant_id=tenant_id, 
                sort_field=sort_by, 
                sort_order=sort_direction,
                skip=skip,
                limit=page_size
            )
            logger.debug(f"[WORKFLOW] Found {len(docs)} workflow configs for tenant: {tenant_id}")
            
            configs = []
            for doc in docs:
                config = {
                    "id": str(doc["_id"]),
                    "name": doc.get("name"),
                    "category": doc.get("category", ""),
                    "description": doc.get("description", ""),
                    "bpmn_filename": doc.get("bpmn_filename"),
                    "bpmn_file_path": doc.get("bpmn_file_path"),
                    "created_at": doc.get("createdAt"),
                    "updated_at": doc.get("updatedAt"),
                    "is_active": doc.get("is_active", True)
                }
                configs.append(config)
            
            # Calculate pagination info
            total_pages = (total_count + page_size - 1) // page_size
            
            result = {
                "configurations": configs,
                "pagination": {
                    "page": page,
                    "page_size": page_size,
                    "total": total_count,
                    "total_pages": total_pages,
                    "has_next": page < total_pages,
                    "has_prev": page > 1
                }
            }
            
            logger.info(f"[WORKFLOW] Successfully listed {len(configs)} workflow configs")
            return result
            
        except Exception as e:
            logger.error(f"[WORKFLOW] Failed to list workflow configs: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to list workflow configurations: {str(e)}"
            )
    
    @classmethod
    async def get_workflow_config_by_id(cls, config_id: str, user: dict) -> Dict[str, Any]:
        """Get workflow configuration by ID"""
        tenant_id = await cls.validate_tenant_access(user)
        logger.info(f"[WORKFLOW] Getting workflow config: {config_id} for tenant: {tenant_id}")
        
        try:
            doc = await MongoStorageService.find_one("workflowConfig", {"_id": config_id}, tenant_id=tenant_id)
            
            if not doc:
                logger.warning(f"[WORKFLOW] Workflow config not found: {config_id}")
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Workflow configuration not found"
                )
            
            config = {
                "id": str(doc["_id"]),
                "name": doc.get("name"),
                "category": doc.get("category", ""),
                "description": doc.get("description", ""),
                "bpmn_filename": doc.get("bpmn_filename"),
                "bpmn_file_path": doc.get("bpmn_file_path"),
                "created_at": doc.get("createdAt"),
                "updated_at": doc.get("updatedAt"),
                "is_active": doc.get("is_active", True)
            }
            
            logger.info(f"[WORKFLOW] Successfully retrieved workflow config: {config_id}")
            return config
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"[WORKFLOW] Failed to get workflow config {config_id}: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to get workflow configuration: {str(e)}"
            )
    
    @classmethod
    async def create_workflow_config(cls, config_data: dict, bpmn_file: UploadFile, user: dict) -> Dict[str, Any]:
        """Create new workflow configuration with BPMN file"""
        tenant_id = await cls.validate_tenant_access(user)
        user_id = user.get("id")
        logger.info(f"[WORKFLOW] Creating workflow config '{config_data.get('name')}' for tenant: {tenant_id}")
        
        try:
            # Validate BPMN file
            if bpmn_file:
                cls.validate_bpmn_file(bpmn_file)
            
            # Check if name already exists
            existing = await MongoStorageService.find_one(
                "workflowConfig", 
                {"name": config_data.get("name")}, 
                tenant_id=tenant_id
            )
            
            if existing:
                logger.warning(f"[WORKFLOW] Workflow config name already exists: {config_data.get('name')}")
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Workflow configuration with this name already exists"
                )
            
            # Upload BPMN file to MinIO if provided
            bpmn_filename = None
            bpmn_file_path = None
            
            if bpmn_file and bpmn_file.filename:
                # Create file path: uploads/bpmn/{user_id}/{filename}
                bpmn_filename = bpmn_file.filename
                bpmn_file_path = f"uploads/bpmn/{user_id}/{bpmn_filename}"
                
                # Read file content
                content = await bpmn_file.read()
                
                # Upload to MinIO
                success = await FileService._upload_to_minio(bpmn_file_path, content)
                
                if not success:
                    raise HTTPException(
                        status_code=500, 
                        detail="Failed to upload BPMN file to storage"
                    )
                
                logger.info(f"[WORKFLOW] BPMN file uploaded to: {bpmn_file_path}")
            
            # Prepare document
            doc = {
                "name": config_data.get("name"),
                "category": config_data.get("category", ""),
                "description": config_data.get("description", ""),
                "bpmn_filename": bpmn_filename,
                "bpmn_file_path": bpmn_file_path,
                "type": "workflowConfig",
                "is_active": config_data.get("is_active", True),
                "createdAt": datetime.utcnow(),
                "updatedAt": datetime.utcnow(),
                "createdBy": user_id,
                "tenantId": tenant_id
            }
            
            # Save to database
            result = await MongoStorageService.insert_one("workflowConfig", doc, tenant_id=tenant_id)
            
            if not result:
                logger.error(f"[WORKFLOW] Failed to insert workflow config - database insert returned None")
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to save workflow configuration to database"
                )
            
            response = {
                "id": result,
                "name": doc["name"],
                "category": doc["category"],
                "description": doc["description"],
                "bpmn_filename": bpmn_filename,
                "message": "Workflow configuration created successfully"
            }
            
            logger.info(f"[WORKFLOW] Successfully created workflow config: {doc['name']}")
            return response
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"[WORKFLOW] Failed to create workflow config: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to create workflow configuration: {str(e)}"
            )
    
    @classmethod
    async def update_workflow_config_by_id(
        cls, 
        config_id: str, 
        config_data: dict, 
        bpmn_file: Optional[UploadFile], 
        user: dict
    ) -> Dict[str, Any]:
        """Update workflow configuration by ID"""
        tenant_id = await cls.validate_tenant_access(user)
        user_id = user.get("id")
        logger.info(f"[WORKFLOW] Updating workflow config: {config_id} for tenant: {tenant_id}")
        
        try:
            # Check if config exists
            existing = await MongoStorageService.find_one("workflowConfig", {"_id": config_id}, tenant_id=tenant_id)
            
            if not existing:
                logger.warning(f"[WORKFLOW] Workflow config not found for update: {config_id}")
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Workflow configuration not found"
                )
            
            # Validate BPMN file if provided
            bpmn_filename = existing.get("bpmn_filename")
            bpmn_file_path = existing.get("bpmn_file_path")
            
            if bpmn_file and bpmn_file.filename:
                cls.validate_bpmn_file(bpmn_file)
                
                # Delete old BPMN file if it exists
                if bpmn_file_path:
                    await FileService._delete_from_minio(bpmn_file_path)
                
                # Upload new BPMN file
                bpmn_filename = bpmn_file.filename
                bpmn_file_path = f"uploads/bpmn/{user_id}/{bpmn_filename}"
                
                # Read file content
                content = await bpmn_file.read()
                
                # Upload to MinIO
                success = await FileService._upload_to_minio(bpmn_file_path, content)
                
                if not success:
                    raise HTTPException(
                        status_code=500, 
                        detail="Failed to upload BPMN file to storage"
                    )
                
                logger.info(f"[WORKFLOW] BPMN file updated at: {bpmn_file_path}")
            
            # Prepare update data
            update_data = {
                "updatedAt": datetime.utcnow()
            }
            
            # Update fields if provided
            if "name" in config_data and config_data["name"]:
                update_data["name"] = config_data["name"]
            if "category" in config_data:
                update_data["category"] = config_data["category"]
            if "description" in config_data:
                update_data["description"] = config_data["description"]
            if "is_active" in config_data:
                update_data["is_active"] = config_data["is_active"]
            
            # Update BPMN file info if file was uploaded
            if bpmn_file and bpmn_file.filename:
                update_data["bpmn_filename"] = bpmn_filename
                update_data["bpmn_file_path"] = bpmn_file_path
            
            # Update in database
            result = await MongoStorageService.update_one(
                "workflowConfig", 
                {"_id": config_id}, 
                {"$set": update_data}, 
                tenant_id=tenant_id
            )
            
            if result.modified_count == 0:
                logger.warning(f"[WORKFLOW] No changes made to workflow config: {config_id}")
                return {"message": "No changes made", "id": config_id}
            
            response = {
                "id": config_id,
                "message": "Workflow configuration updated successfully"
            }
            
            logger.info(f"[WORKFLOW] Successfully updated workflow config: {config_id}")
            return response
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"[WORKFLOW] Failed to update workflow config {config_id}: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to update workflow configuration: {str(e)}"
            )
    
    @classmethod
    async def delete_workflow_config_by_id(cls, config_id: str, user: dict) -> Dict[str, Any]:
        """Delete workflow configuration by ID"""
        tenant_id = await cls.validate_tenant_access(user)
        logger.info(f"[WORKFLOW] Deleting workflow config: {config_id} for tenant: {tenant_id}")
        
        try:
            # Check if config exists
            existing = await MongoStorageService.find_one("workflowConfig", {"_id": config_id}, tenant_id=tenant_id)
            
            if not existing:
                logger.warning(f"[WORKFLOW] Workflow config not found for deletion: {config_id}")
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Workflow configuration not found"
                )
            
            # Delete BPMN file from MinIO if it exists
            bpmn_file_path = existing.get("bpmn_file_path")
            if bpmn_file_path:
                await FileService._delete_from_minio(bpmn_file_path)
                logger.info(f"[WORKFLOW] Deleted BPMN file: {bpmn_file_path}")
            
            # Delete from database
            result = await MongoStorageService.delete_one("workflowConfig", {"_id": config_id}, tenant_id=tenant_id)
            
            if result.deleted_count == 0:
                logger.warning(f"[WORKFLOW] Failed to delete workflow config from database: {config_id}")
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to delete workflow configuration"
                )
            
            response = {
                "id": config_id,
                "message": "Workflow configuration deleted successfully"
            }
            
            logger.info(f"[WORKFLOW] Successfully deleted workflow config: {config_id}")
            return response
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"[WORKFLOW] Failed to delete workflow config {config_id}: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to delete workflow configuration: {str(e)}"
            )
    
    @classmethod
    async def get_workflow_categories(cls, user: dict) -> List[str]:
        """Get all unique categories for workflow configurations"""
        tenant_id = await cls.validate_tenant_access(user)
        logger.info(f"[WORKFLOW] Getting workflow categories for tenant: {tenant_id}")
        
        try:
            # Get distinct categories
            categories = await MongoStorageService.distinct(
                "workflowConfig", 
                "category", 
                tenant_id=tenant_id
            )
            
            # Filter out empty strings and None values
            categories = [cat for cat in categories if cat and cat.strip()]
            categories.sort()
            
            logger.info(f"[WORKFLOW] Found {len(categories)} workflow categories")
            return categories
            
        except Exception as e:
            logger.error(f"[WORKFLOW] Failed to get workflow categories: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to get workflow categories: {str(e)}"
            )
    
    @classmethod
    async def get_bpmn_file_content(cls, config_id: str, user: dict) -> bytes:
        """Get BPMN file content for download"""
        tenant_id = await cls.validate_tenant_access(user)
        logger.info(f"[WORKFLOW] Getting BPMN file for config: {config_id}")
        
        try:
            # Get config
            config = await MongoStorageService.find_one("workflowConfig", {"_id": config_id}, tenant_id=tenant_id)
            
            if not config:
                logger.warning(f"[WORKFLOW] Workflow config not found: {config_id}")
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Workflow configuration not found"
                )
            
            bpmn_file_path = config.get("bpmn_file_path")
            if not bpmn_file_path:
                logger.warning(f"[WORKFLOW] No BPMN file found for config: {config_id}")
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="No BPMN file found for this configuration"
                )
            
            # Get file content from MinIO
            content = await FileService._get_file_from_minio(bpmn_file_path)
            
            if not content:
                logger.warning(f"[WORKFLOW] BPMN file content not found: {bpmn_file_path}")
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="BPMN file content not found"
                )
            
            logger.info(f"[WORKFLOW] Successfully retrieved BPMN file content")
            return content
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"[WORKFLOW] Failed to get BPMN file content: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to get BPMN file content: {str(e)}"
            )
