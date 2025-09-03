"""
Tool Configuration Service

This service handles all tool configuration related business logic.
"""

from datetime import datetime
from typing import List, Optional, Dict, Any
from fastapi import HTTPException, status

from ..db import get_collections
from ..utils.log import logger
from src.utils.component_discovery import discover_components, get_detailed_class_info


class ToolConfigService:
    """Service for managing tool configurations"""
    
    @staticmethod
    def _get_tool_config_collection():
        """Get the tool config collection"""
        logger.debug("[TOOL] Accessing tool config collection")
        return get_collections()["toolConfig"]
    
    @staticmethod
    async def validate_tenant_access(user: dict) -> str:
        """Validate tenant access and return tenant_id"""
        logger.debug(f"[TOOL] Validating tenant access for user: {user.get('id')}")
        tenant_id = user.get("tenantId")
        if not tenant_id:
            logger.warning(f"[TOOL] Missing tenant information for user: {user.get('id')}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User tenant information missing. Please re-login."
            )
        logger.debug(f"[TOOL] Tenant access validated: {tenant_id}")
        return tenant_id
    
    @classmethod
    async def create_tool_config(cls, config: dict, user: dict) -> dict:
        """Create a new tool configuration"""
        logger.info(f"[TOOL] Creating tool configuration: {config.get('name')}")
        logger.debug(f"[TOOL] Tool config data: {config}")
        
        tenant_id = await cls.validate_tenant_access(user)
        user_id = user.get("id")
        
        if not config.get("name"):
            logger.warning("[TOOL] Creation failed - name is required")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Name is required"
            )

        if not config.get("tool") and not config.get("function"):
            logger.warning("[TOOL] Creation failed - tool/function is required")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Tool (module path) is required"
            )

        # Use unified key 'tool' (alias for function module path)
        tool_module = config.get("tool") or config.get("function")

        doc = {
            "name": config.get("name"),
            "category": config.get("category", ""),
            "tool": tool_module,
            "tool_params": config.get("tool_params", {}),
            "type": "toolConfig",
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "tenantId": tenant_id,
            "userId": user_id
        }

        collection = cls._get_tool_config_collection()
        
        # Check for duplicate names within tenant
        existing = await collection.find_one({
            "name": config.get("name"),
            "tenantId": tenant_id
        })
        
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Tool configuration with this name already exists"
            )

        result = await collection.insert_one(doc)
        return {"id": str(result.inserted_id), "name": config.get("name")}

    @classmethod
    async def get_tool_configs(cls, user: dict, category: Optional[str] = None) -> List[dict]:
        """Get all tool configurations for the user's tenant, optionally filtered by category"""
        tenant_id = await cls.validate_tenant_access(user)
        logger.info(f"[TOOL] Listing tool configs for tenant: {tenant_id}")
        
        # Build query filter
        query = {"tenantId": tenant_id}
        if category:
            query["category"] = category
        logger.debug(f"[TOOL] Query filter: {query}")
        
        collection = cls._get_tool_config_collection()
        configs_cursor = collection.find(query)
        configs = []
        
        async for config in configs_cursor:
            # Convert ObjectId to string for the id field
            config_dict = dict(config)
            config_dict["id"] = str(config_dict.pop("_id"))
            configs.append(config_dict)
        
        logger.info(f"[TOOL] Retrieved {len(configs)} tool configs for tenant: {tenant_id}")
        
        return configs

    @classmethod
    async def get_tool_config_by_name(cls, name: str, user: dict) -> dict:
        """Get a specific tool configuration by name"""
        tenant_id = await cls.validate_tenant_access(user)
        logger.info(f"[TOOL] Fetching tool config '{name}' for tenant: {tenant_id}")
        
        collection = cls._get_tool_config_collection()
        config = await collection.find_one(
            {"name": name, "tenantId": tenant_id},
            {"_id": 0}
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
    async def update_tool_config(cls, config_id: str, updates: dict, user: dict) -> dict:
        """Update a tool configuration by ID"""
        from bson import ObjectId
        tenant_id = await cls.validate_tenant_access(user)
        logger.info(f"[TOOL] Updating tool config ID '{config_id}' for tenant: {tenant_id}")
        logger.debug(f"[TOOL] Update payload: {updates}")
        
        try:
            object_id = ObjectId(config_id)
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid configuration ID"
            )
        
        # Add updated timestamp
        updates["updated_at"] = datetime.utcnow()
        
        collection = cls._get_tool_config_collection()
        result = await collection.update_one(
            {"_id": object_id, "tenantId": tenant_id},
            {"$set": updates}
        )
        
        if result.matched_count == 0:
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
        
        collection = cls._get_tool_config_collection()
        result = await collection.delete_one({
            "_id": object_id,
            "tenantId": tenant_id
        })
        
        if result.deleted_count == 0:
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
        logger.debug(f"[TOOL] Fetching tool categories for tenant: {tenant_id}")
        
        collection = cls._get_tool_config_collection()
        categories = await collection.distinct("category", {"tenantId": tenant_id})
        
        # Filter out empty categories and sort
        categories = [cat for cat in categories if cat and cat.strip()]
        categories_sorted = sorted(categories)
        logger.info(f"[TOOL] Found {len(categories_sorted)} categories for tenant: {tenant_id}")
        return categories_sorted
