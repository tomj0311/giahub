"""
Tool Configuration Service

This service handles all tool configuration related business logic.
"""

from datetime import datetime
from typing import List, Optional, Dict, Any
from fastapi import HTTPException, status

from ..utils.log import logger
from ..utils.mongo_storage import MongoStorageService
from src.utils.component_discovery import discover_components, get_detailed_class_info


class ToolConfigService:
    """Service for managing tool configurations"""
    
    @staticmethod
    async def validate_tenant_access(user: dict) -> str:
        """Validate tenant access and return tenant_id"""
        tenant_id = user.get("tenantId")
        if not tenant_id:
            logger.warning(f"[TOOL] Missing tenant information for user: {user.get('id')}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User tenant information missing. Please re-login."
            )
        return tenant_id
    
    @classmethod
    async def create_tool_config(cls, config: dict, user: dict) -> dict:
        """Create a new tool configuration"""
        logger.info(f"[TOOL] Creating tool configuration: {config.get('name')}")
        
        tenant_id = await cls.validate_tenant_access(user)
        user_id = user.get("id")
        
        name = (config.get("name") or "").strip()
        if not name:
            logger.warning("[TOOL] Creation failed - name is required")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Name is required"
            )

        
        # Check for duplicate names within tenant
        existing = await MongoStorageService.find_one("toolConfig", {
            "name": name
        }, tenant_id=tenant_id)
        
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Tool configuration with this name already exists"
            )

        # Accept frontend structure as-is and only add required backend fields
        doc = dict(config)  # Preserve original structure
        doc["name"] = name  # ensure trimmed name persisted
        doc.update({
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "tenantId": tenant_id,
            "userId": user_id
        })

        result_id = await MongoStorageService.insert_one("toolConfig", doc, tenant_id=tenant_id)
        return {"id": str(result_id), "name": name}

    @classmethod
    async def get_tool_configs(cls, user: dict, category: Optional[str] = None) -> List[dict]:
        """Get all tool configurations for the user's tenant, optionally filtered by category"""
        tenant_id = await cls.validate_tenant_access(user)
        
        # Build query filter
        query = {}
        if category:
            query["category"] = category
        
        configs_list = await MongoStorageService.find_many("toolConfig", query, tenant_id=tenant_id)
        configs = []
        
        for config in configs_list:
            # Convert ObjectId to string for the id field
            config_dict = dict(config)
            config_dict["id"] = str(config_dict.pop("_id"))
            configs.append(config_dict)
        
        logger.info(f"[TOOL] Retrieved {len(configs)} tool configs for tenant: {tenant_id}")
        
        return configs

    @classmethod
    async def get_tool_configs_paginated(
        cls, 
        user: dict, 
        page: int = 1, 
        page_size: int = 8,
        category: Optional[str] = None,
        search: Optional[str] = None,
        sort_by: str = "name",
        sort_order: str = "asc"
    ) -> Dict[str, Any]:
        """Get tool configurations with pagination, filtering, and sorting"""
        tenant_id = await cls.validate_tenant_access(user)
        
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
            total_count = await MongoStorageService.count_documents("toolConfig", filter_query, tenant_id=tenant_id)
            
            # Calculate pagination info
            total_pages = (total_count + page_size - 1) // page_size  # Ceiling division
            has_next = page < total_pages
            has_prev = page > 1
            
            # Determine sort order
            sort_direction = -1 if sort_order == "desc" else 1
            
            # Get paginated results
            docs = await MongoStorageService.find_many(
                "toolConfig", 
                filter_query,
                tenant_id=tenant_id,
                sort_field=sort_by,
                sort_order=sort_direction,
                skip=skip,
                limit=page_size
            )
            
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
            
            return result
            
        except Exception as e:
            logger.error(f"[TOOL] Failed to list tool configs with pagination: {e}")
            raise HTTPException(status_code=500, detail="Failed to retrieve tool configurations")

    @classmethod
    async def list_all_tool_configs_minimal(
        cls,
        user: dict,
        active_only: bool = True
    ) -> Dict[str, Any]:
        """Get all tool configs with minimal fields for dropdowns"""
        tenant_id = await cls.validate_tenant_access(user)
        
        try:
            # Build filter query
            filter_query = {}
            if active_only:
                filter_query["is_active"] = {"$ne": False}
            
            # Only project essential fields
            projection = {
                "_id": 1,
                "name": 1,
                "category": 1,
                "tool_name": 1,
                "description": 1
            }
            
            # Get all configs sorted by name
            docs = await MongoStorageService.find_many(
                "toolConfig",
                filter_query,
                tenant_id=tenant_id,
                sort_field="name",
                sort_order=1,
                projection=projection
            )
            
            configs = []
            for doc in docs:
                configs.append({
                    "id": str(doc["_id"]),
                    "name": doc.get("name", ""),
                    "category": doc.get("category", ""),
                    "tool_name": doc.get("tool_name", ""),
                    "description": doc.get("description", "")
                })
            
            return {
                "configurations": configs,
                "total": len(configs)
            }
        except Exception as e:
            logger.error(f"[TOOL] Failed to list all tool configs minimal: {e}")
            raise HTTPException(status_code=500, detail="Failed to retrieve tool configurations")

    @classmethod
    async def get_tool_config_by_name(cls, name: str, user: dict) -> dict:
        """Get a specific tool configuration by name"""
        tenant_id = await cls.validate_tenant_access(user)
        # Normalize name
        name = (name or "").strip()
        logger.info(f"[TOOL] Fetching tool config '{name}' for tenant: {tenant_id}")
        
        config = await MongoStorageService.find_one("toolConfig",
            {"name": name},
            projection={"_id": 0},
            tenant_id=tenant_id
        )
        
        if not config:
            logger.warning(f"[TOOL] Tool config not found: name='{name}', tenant='{tenant_id}'")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Tool configuration not found"
            )
        
        logger.info(f"[TOOL] Found tool config '{name}' for tenant: {tenant_id}")
        return config

    @classmethod
    async def get_tool_config_by_id(cls, config_id: str, user: dict) -> dict:
        """Get tool configuration by ID - returns raw record"""
        from bson import ObjectId
        tenant_id = await cls.validate_tenant_access(user)
        
        try:
            doc = await MongoStorageService.find_one("toolConfig", {
                "_id": ObjectId(config_id),
                "tenantId": tenant_id
            }, tenant_id=tenant_id)
            
            if not doc:
                raise HTTPException(status_code=404, detail="Tool configuration not found")
            
            return doc
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"[TOOL] Failed to get tool config {config_id}: {e}")
            raise HTTPException(status_code=500, detail="Failed to retrieve tool configuration")

    @classmethod
    async def update_tool_config(cls, config_id: str, updates: dict, user: dict) -> dict:
        """Update a tool configuration by ID"""
        from bson import ObjectId
        tenant_id = await cls.validate_tenant_access(user)
        logger.info(f"[TOOL] Updating tool config ID '{config_id}' for tenant: {tenant_id}")
        
        try:
            object_id = ObjectId(config_id)
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid configuration ID"
            )
        
        # Accept frontend structure as-is and only add/update backend fields
        update_data = dict(updates)  # Preserve original structure
        if "name" in update_data and isinstance(update_data["name"], str):
            update_data["name"] = update_data["name"].strip()
        update_data["updated_at"] = datetime.utcnow()
        
        result = await MongoStorageService.update_one("toolConfig",
            {"_id": object_id},
            {"$set": update_data},
            tenant_id=tenant_id
        )
        
        if not result:
            logger.warning(f"[TOOL] Config not found: id='{config_id}', tenant='{tenant_id}'")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Tool configuration not found"
            )
        
        logger.info(f"[TOOL] Successfully updated tool config '{config_id}' for tenant: {tenant_id}")
        return {"message": "Tool configuration updated successfully"}

    @classmethod
    async def delete_tool_config(cls, config_id: str, user: dict) -> dict:
        """Delete a tool configuration by ID"""
        from bson import ObjectId
        tenant_id = await cls.validate_tenant_access(user)
        logger.info(f"[TOOL] Deleting tool config ID '{config_id}' for tenant: {tenant_id}")
        
        try:
            object_id = ObjectId(config_id)
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid configuration ID"
            )
        
        result = await MongoStorageService.delete_one("toolConfig", {
            "_id": object_id
        }, tenant_id=tenant_id)
        
        if not result:
            logger.warning(f"[TOOL] Delete failed - config not found: id='{config_id}', tenant='{tenant_id}'")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Tool configuration not found"
            )
        
        logger.info(f"[TOOL] Successfully deleted tool config '{config_id}' for tenant: {tenant_id}")
        return {"message": "Tool configuration deleted successfully"}
        
        if result.deleted_count == 0:
            logger.warning(f"[TOOL] Tool config not found for deletion: name='{name}', tenant='{tenant_id}'")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Tool configuration not found"
            )
        
        logger.info(f"[TOOL] Successfully deleted tool config '{name}' for tenant: {tenant_id}")
        return {"message": "Tool configuration deleted successfully"}

    @classmethod
    async def discover_tool_components(cls, folder: str = "ai.functions") -> List[dict]:
        """Discover available tool components"""
        try:
            logger.info(f"[TOOL] Discovering tool components in folder: {folder}")
            components = discover_components(folder=folder)
            result = []
            
            for comp in components:
                try:
                    module_path = f"{folder}.{comp}"
                    class_info = get_detailed_class_info(module_path, comp)
                    
                    if class_info and class_info.get("classes"):
                        result.append({
                            "name": comp,
                            "module_path": module_path,
                            "class_info": class_info
                        })
                except Exception as e:
                    logger.warning(f"[TOOL_CONFIG] Failed to introspect {comp}: {e}")
                    result.append({
                        "name": comp,
                        "module_path": f"{folder}.{comp}",
                        "error": str(e)
                    })
            
            logger.info(f"[TOOL] Discovered {len(result)} tool components in {folder}")
            return result
            
        except Exception as e:
            logger.error(f"[TOOL_CONFIG] Failed to discover components: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to discover tool components"
            )

    @classmethod
    async def get_tool_categories(cls, user: dict) -> List[str]:
        """Get all unique categories for the user's tenant"""
        tenant_id = await cls.validate_tenant_access(user)
        
        categories = await MongoStorageService.distinct("toolConfig", "category", {}, tenant_id=tenant_id)
        
        # Filter out empty categories and sort
        categories = [cat for cat in categories if cat and cat.strip()]
        categories_sorted = sorted(categories)
        logger.info(f"[TOOL] Found {len(categories_sorted)} categories for tenant: {tenant_id}")
        return categories_sorted
