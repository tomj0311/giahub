"""
Embedder Configuration Service

This service handles all embedder         result_id = await MongoStorageService.insert_one("embedderConfig", doc, tenant_id=tenant_id)
        return {"id": str(result_id), "name": name}n related business logic.
"""

from datetime import datetime
from typing import List, Optional, Dict, Any
from fastapi import HTTPException, status

from ..utils.log import logger
from ..utils.mongo_storage import MongoStorageService
from src.utils.component_discovery import discover_components, get_detailed_class_info


class EmbedderConfigService:
    """Service for managing embedder configurations"""
    
    @staticmethod
    async def validate_tenant_access(user: dict) -> str:
        """Validate tenant access and return tenant_id"""
        logger.debug(f"[EMBEDDER] Validating tenant access for user: {user.get('id')}")
        tenant_id = user.get("tenantId")
        if not tenant_id:
            logger.warning(f"[EMBEDDER] Missing tenant information for user: {user.get('id')}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User tenant information missing. Please re-login."
            )
        logger.debug(f"[EMBEDDER] Tenant access validated: {tenant_id}")
        return tenant_id
    
    @classmethod
    async def create_embedder_config(cls, config: dict, user: dict) -> dict:
        """Create a new embedder configuration"""
        logger.info(f"[EMBEDDER] Creating embedder configuration: {config.get('name')}")
        logger.debug(f"[EMBEDDER] Embedder config data: {config}")
        
        tenant_id = await cls.validate_tenant_access(user)
        user_id = user.get("id")
        
        name = config.get("name")
        if not name:
            logger.warning("[EMBEDDER] Creation failed - name is required")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Name is required"
            )

        
        # Check for duplicate names within tenant
        existing = await MongoStorageService.find_one("embedderConfig", {
            "name": name
        }, tenant_id=tenant_id)
        
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Embedder configuration with this name already exists"
            )

        # Accept frontend structure as-is and only add required backend fields
        doc = dict(config)  # Preserve original structure
        doc.update({
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "tenantId": tenant_id,
            "userId": user_id
        })

        result_id = await MongoStorageService.insert_one("embedderConfig", doc, tenant_id=tenant_id)
        return {"id": str(result_id), "name": name}

    @classmethod
    async def get_embedder_configs_paginated(
        cls, 
        user: dict, 
        page: int = 1, 
        page_size: int = 8,
        category: Optional[str] = None,
        search: Optional[str] = None,
        sort_by: str = "name",
        sort_order: str = "asc"
    ) -> Dict[str, Any]:
        """Get embedder configurations with pagination, filtering, and sorting"""
        tenant_id = await cls.validate_tenant_access(user)
        logger.info(f"[EMBEDDER] Listing embedder configs with pagination for tenant: {tenant_id}")
        
        try:
            # Build filter query
            filter_query = {}
            
            if category:
                filter_query["category"] = category
            
            if search:
                filter_query["$or"] = [
                    {"name": {"$regex": search, "$options": "i"}},
                    {"description": {"$regex": search, "$options": "i"}}
                ]
            
            # Calculate pagination
            skip = (page - 1) * page_size
            
            # Get total count
            total_count = await MongoStorageService.count_documents("embedderConfig", filter_query, tenant_id=tenant_id)
            
            # Calculate pagination info
            total_pages = (total_count + page_size - 1) // page_size  # Ceiling division
            has_next = page < total_pages
            has_prev = page > 1
            
            # Determine sort order
            sort_direction = -1 if sort_order == "desc" else 1
            
            # Get paginated results
            docs = await MongoStorageService.find_many(
                "embedderConfig", 
                filter_query,
                tenant_id=tenant_id,
                sort_field=sort_by,
                sort_order=sort_direction,
                skip=skip,
                limit=page_size
            )
            
            logger.debug(f"[EMBEDDER] Found {len(docs)} embedder configs for tenant: {tenant_id}")
            
            configs = []
            for config in docs:
                # Convert ObjectId to string for the id field
                config_dict = dict(config)
                config_dict["id"] = str(config_dict.pop("_id"))
                configs.append(config_dict)
            
            # Build response with pagination metadata
            result = {
                "configurations": configs,
                "pagination": {
                    "page": page,
                    "page_size": page_size,
                    "total": total_count,
                    "total_pages": total_pages,
                    "has_next": has_next,
                    "has_prev": has_prev
                }
            }
            
            logger.info(f"[EMBEDDER] Returning {len(configs)} configs, page {page}/{total_pages}")
            return result
            
        except Exception as e:
            logger.error(f"[EMBEDDER] Failed to list embedder configs with pagination: {e}")
            raise HTTPException(status_code=500, detail="Failed to retrieve embedder configurations")

    @classmethod
    async def get_embedder_config_by_name(cls, name: str, user: dict) -> dict:
        """Get a specific embedder configuration by name"""
        tenant_id = await cls.validate_tenant_access(user)
        logger.info(f"[EMBEDDER] Fetching embedder config '{name}' for tenant: {tenant_id}")
        
        config = await MongoStorageService.find_one("embedderConfig",
            {"name": name},
            projection={"_id": 0},
            tenant_id=tenant_id
        )
        
        if not config:
            logger.warning(f"[EMBEDDER] Embedder config not found: name='{name}', tenant='{tenant_id}'")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Embedder configuration not found"
            )
        
        logger.info(f"[EMBEDDER] Found embedder config '{name}' for tenant: {tenant_id}")
        return config

    @classmethod
    async def update_embedder_config(cls, config_id: str, updates: dict, user: dict) -> dict:
        """Update an embedder configuration by ID"""
        from bson import ObjectId
        tenant_id = await cls.validate_tenant_access(user)
        logger.info(f"[EMBEDDER] Updating embedder config ID '{config_id}' for tenant: {tenant_id}")
        
        try:
            object_id = ObjectId(config_id)
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid configuration ID"
            )
        
        # Accept frontend structure as-is and only add/update backend fields
        update_data = dict(updates)  # Preserve original structure
        update_data["updated_at"] = datetime.utcnow()
        
        result = await MongoStorageService.update_one("embedderConfig",
            {"_id": object_id},
            {"$set": update_data},
            tenant_id=tenant_id
        )
        
        if not result:
            logger.warning(f"[EMBEDDER] Config not found: id='{config_id}', tenant='{tenant_id}'")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Embedder configuration not found"
            )
        
        logger.info(f"[EMBEDDER] Successfully updated embedder config '{config_id}' for tenant: {tenant_id}")
        return {"message": "Embedder configuration updated successfully"}

    @classmethod
    async def delete_embedder_config(cls, config_id: str, user: dict) -> dict:
        """Delete an embedder configuration by ID"""
        from bson import ObjectId
        tenant_id = await cls.validate_tenant_access(user)
        logger.info(f"[EMBEDDER] Deleting embedder config ID '{config_id}' for tenant: {tenant_id}")
        
        try:
            object_id = ObjectId(config_id)
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid configuration ID"
            )
        
        result = await MongoStorageService.delete_one("embedderConfig", {
            "_id": object_id
        }, tenant_id=tenant_id)
        
        if not result:
            logger.warning(f"[EMBEDDER] Config not found: id='{config_id}', tenant='{tenant_id}'")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Embedder configuration not found"
            )
        
        logger.info(f"[EMBEDDER] Successfully deleted embedder config '{config_id}' for tenant: {tenant_id}")
        return {"message": "Embedder configuration deleted successfully"}

    @classmethod
    async def get_embedder_categories(cls, user: dict) -> List[str]:
        """Get all unique categories for the user's tenant"""
        tenant_id = await cls.validate_tenant_access(user)
        logger.debug(f"[EMBEDDER] Fetching embedder categories for tenant: {tenant_id}")
        
        categories = await MongoStorageService.distinct("embedderConfig", "category", {}, tenant_id=tenant_id)
        
        # Filter out empty categories and sort
        categories = [cat for cat in categories if cat and cat.strip()]
        categories_sorted = sorted(categories)
        logger.info(f"[EMBEDDER] Found {len(categories_sorted)} categories for tenant: {tenant_id}")
        return categories_sorted
