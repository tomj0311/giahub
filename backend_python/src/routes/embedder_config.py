"""
Embedder Configuration CRUD routes for MongoDB operations
Handles embedder configurations stored in MongoDB with categories
All operations are tenant-isolated
"""

from fastapi import APIRouter, HTTPException, Depends, status, Query
from typing import Optional
from datetime import datetime

from ..utils.auth import verify_token_middleware
from ..utils.mongo_storage import MongoStorageService
from src.utils.component_discovery import discover_components, get_detailed_class_info
from ..utils.log import logger
from ..services.embedder_config_service import EmbedderConfigService

router = APIRouter(tags=["embedders"]) 


@router.post("/configs", status_code=status.HTTP_201_CREATED)
async def create_embedder_config(
    config: dict,
    user: dict = Depends(verify_token_middleware)
):
    """Create a new embedder configuration"""
    try:
        result = await EmbedderConfigService.create_embedder_config(config, user)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[EMBEDDER_CONFIG] Failed to create configuration: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create embedder configuration"
        )


@router.get("/configs")
async def get_embedder_configs(
    user: dict = Depends(verify_token_middleware),
    page: int = Query(1, ge=1, description="Page number (1-based)"),
    page_size: int = Query(8, ge=1, le=100, description="Items per page"),
    category: Optional[str] = Query(None, description="Filter by category"),
    search: Optional[str] = Query(None, description="Search in name and description"),
    sort_by: str = Query("name", description="Sort field"),
    sort_order: str = Query("asc", regex="^(asc|desc)$", description="Sort order")
):
    """List embedder configurations in user's tenant with pagination"""
    logger.info(f"[EMBEDDER_CONFIG] Listing configs - page: {page}, size: {page_size}")
    try:
        result = await EmbedderConfigService.get_embedder_configs_paginated(
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
        logger.error(f"Error fetching embedder configs: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch embedder configurations")


@router.get("/configs/{config_name}")
async def get_embedder_config(config_name: str, user: dict = Depends(verify_token_middleware)):
    """Get a specific embedder configuration by name"""
    try:
        config = await EmbedderConfigService.get_embedder_config_by_name(config_name, user)
        return config
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[EMBEDDER_CONFIG] Failed to fetch configuration {config_name}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch embedder configuration"
        )


@router.put("/configs/{config_id}")
async def update_embedder_config(config_id: str, config_update: dict, user: dict = Depends(verify_token_middleware)):
    """Update an embedder configuration"""
    try:
        result = await EmbedderConfigService.update_embedder_config(config_id, config_update, user)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating embedder config {config_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to update embedder configuration")


@router.delete("/configs/{config_id}")
async def delete_embedder_config(config_id: str, user: dict = Depends(verify_token_middleware)):
    """Delete an embedder configuration"""
    try:
        result = await EmbedderConfigService.delete_embedder_config(config_id, user)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting embedder config {config_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete embedder configuration")


@router.get("/categories")
async def get_embedder_categories(user: dict = Depends(verify_token_middleware)):
    try:
        categories = await EmbedderConfigService.get_embedder_categories(user)
        return {"categories": categories}
    except Exception as e:
        logger.error(f"Error fetching embedder categories: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch categories")


@router.get("/components")
async def get_embedder_components(folder: str = "ai.embeddings", user: dict = Depends(verify_token_middleware)):
    """Discover available embedder components from ai.embeddings"""
    try:
        components = discover_components(folder=folder)
        return {"components": components, "message": "OK"}
    except Exception as e:
        logger.error(f"Error discovering embedder components: {e}")
        raise HTTPException(status_code=500, detail="Failed to discover embedder components")


@router.post("/introspect")
async def introspect_embedder_component(request: dict, user: dict = Depends(verify_token_middleware)):
    try:
        module_path = request.get("module_path")
        kind = request.get("kind", "embedder")
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
        logger.error(f"Error introspecting embedder component: {e}")
        raise HTTPException(status_code=500, detail="Failed to introspect embedder component")
