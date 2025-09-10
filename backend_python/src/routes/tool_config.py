"""
Tool Configuration CRUD routes for MongoDB operations
Handles tool configurations stored in MongoDB with categories
All operations are tenant-isolated
"""

from fastapi import APIRouter, HTTPException, Depends, status, Query
from typing import Optional
from datetime import datetime

from ..utils.auth import verify_token_middleware
from ..utils.mongo_storage import MongoStorageService
from src.utils.component_discovery import discover_components, get_detailed_class_info
from ..utils.log import logger
from ..services.tool_config_service import ToolConfigService

router = APIRouter(tags=["tool-config"]) 


@router.post("/configs", status_code=status.HTTP_201_CREATED)
async def create_tool_config(
    config: dict,
    user: dict = Depends(verify_token_middleware)
):
    """Create a new tool configuration"""
    try:
        result = await ToolConfigService.create_tool_config(config, user)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[TOOL_CONFIG] Failed to create configuration: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create tool configuration"
        )


@router.get("/configs")
async def get_tool_configs(
    user: dict = Depends(verify_token_middleware),
    page: int = Query(1, ge=1, description="Page number (1-based)"),
    page_size: int = Query(8, ge=1, le=100, description="Items per page"),
    category: Optional[str] = Query(None, description="Filter by category"),
    search: Optional[str] = Query(None, description="Search in name and description"),
    sort_by: str = Query("name", description="Sort field"),
    sort_order: str = Query("asc", regex="^(asc|desc)$", description="Sort order")
):
    """List tool configurations in user's tenant with pagination"""
    logger.info(f"[TOOL_CONFIG] Listing configs - page: {page}, size: {page_size}")
    try:
        result = await ToolConfigService.get_tool_configs_paginated(
            user=user,
            page=page,
            page_size=page_size,
            category=category,
            search=search,
            sort_by=sort_by,
            sort_order=sort_order
        )
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching tool configs: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch tool configurations")


@router.get("/configs/{config_name}")
async def get_tool_config(config_name: str, user: dict = Depends(verify_token_middleware)):
    """Get a specific tool configuration by name"""
    try:
        config = await ToolConfigService.get_tool_config_by_name(config_name, user)
        return config
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[TOOL_CONFIG] Failed to fetch configuration {config_name}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch tool configuration"
        )


@router.put("/configs/{config_id}")
async def update_tool_config(config_id: str, config_update: dict, user: dict = Depends(verify_token_middleware)):
    """Update a tool configuration"""
    try:
        result = await ToolConfigService.update_tool_config(config_id, config_update, user)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating tool config {config_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to update tool configuration")


@router.delete("/configs/{config_id}")
async def delete_tool_config(config_id: str, user: dict = Depends(verify_token_middleware)):
    """Delete a tool configuration"""
    try:
        result = await ToolConfigService.delete_tool_config(config_id, user)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting tool config {config_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete tool configuration")


@router.get("/categories")
async def get_tool_categories(user: dict = Depends(verify_token_middleware)):
    try:
        # Apply tenant filtering to get categories only from user's tenant - REQUIRED
        tenant_id = user.get("tenantId")
        if not tenant_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User tenant information missing. Please re-login."
            )
        cats = await MongoStorageService.distinct("toolConfig", "category", {}, tenant_id=tenant_id)
        cats = [c for c in cats if c and c.strip()]
        cats.sort()
        return {"categories": cats}
    except Exception as e:
        logger.error(f"Error fetching tool categories: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch categories")


@router.get("/components")
async def get_tool_components(folder: str = "functions", user: dict = Depends(verify_token_middleware)):
    """Discover available tool components from ai.functions"""
    try:
        components = discover_components(folder=folder)
        return {"components": components, "message": "OK"}
    except Exception as e:
        logger.error(f"Error discovering tool components: {e}")
        raise HTTPException(status_code=500, detail="Failed to discover tool components")


@router.post("/introspect")
async def introspect_tool_component(request: dict, user: dict = Depends(verify_token_middleware)):
    try:
        module_path = request.get("module_path")
        kind = request.get("kind", "tool")
        if not module_path:
            raise HTTPException(status_code=400, detail="module_path is required")
        info = get_detailed_class_info(module_path, kind)
        if not info or not info.get("classes"):
            raise HTTPException(status_code=404, detail=f"No valid class found in module: {module_path}")
        main_class = list(info["classes"].values())[0]
        return {
            "module_path": info["module_path"],
            "class_name": main_class["class_name"],
            "formatted_params": main_class["formatted_params"],
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error introspecting tool component: {e}")
        raise HTTPException(status_code=500, detail="Failed to introspect tool component")
