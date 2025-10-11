"""
Model Configuration CRUD routes - refactored to use ModelConfigService
"""

from fastapi import APIRouter, Depends, status, Query, HTTPException
from typing import Dict, Any, Optional
from pydantic import BaseModel

from ..utils.auth import verify_token_middleware
from ..services.model_config_service import ModelConfigService
from ..utils.log import logger

router = APIRouter(tags=["models"])


class ModelConfigCreate(BaseModel):
    name: str
    provider: str
    model: str
    category: str = ""
    description: str = ""
    parameters: Dict[str, Any] = {}
    api_key: str = ""
    is_active: bool = True


class ModelConfigUpdate(BaseModel):
    provider: str = None
    model: str = None
    category: str = None
    description: str = None
    parameters: Dict[str, Any] = None
    api_key: str = None
    is_active: bool = None


@router.get("/providers")
async def get_available_providers():
    """Get list of available model providers and their models"""
    providers = await ModelConfigService.get_available_providers()
    return {"providers": providers}


@router.get("/configs")
async def list_model_configs(
    user: dict = Depends(verify_token_middleware),
    page: int = Query(1, ge=1, description="Page number (1-based)"),
    page_size: int = Query(8, ge=1, le=100, description="Items per page"),
    category: Optional[str] = Query(None, description="Filter by category"),
    search: Optional[str] = Query(None, description="Search in name and description"),
    sort_by: str = Query("name", description="Sort field"),
    sort_order: str = Query("asc", regex="^(asc|desc)$", description="Sort order")
):
    """List model configurations for current tenant with pagination"""
    result = await ModelConfigService.list_model_configs_paginated(
        user=user,
        page=page,
        page_size=page_size,
        category=category,
        search=search,
        sort_by=sort_by,
        sort_order=sort_order
    )
    return result


@router.get("/configs/{config_id}")
async def get_model_config(config_id: str, user: dict = Depends(verify_token_middleware)):
    """Get specific model configuration"""
    config = await ModelConfigService.get_model_config_by_id(config_id, user)
    return config


@router.post("/configs", status_code=status.HTTP_201_CREATED)
async def create_model_config(
    config_data: dict, 
    user: dict = Depends(verify_token_middleware)
):
    """Create new model configuration"""
    result = await ModelConfigService.create_model_config(config_data, user)
    return result


@router.put("/configs/{config_id}")
async def update_model_config(
    config_id: str,
    config_data: dict,
    user: dict = Depends(verify_token_middleware)
):
    """Update existing model configuration"""
    result = await ModelConfigService.update_model_config_by_id(
        config_id, 
        config_data, 
        user
    )
    return result


@router.delete("/configs/{config_id}")
async def delete_model_config(config_id: str, user: dict = Depends(verify_token_middleware)):
    """Delete model configuration"""
    result = await ModelConfigService.delete_model_config_by_id(config_id, user)
    return result


# New endpoints to match frontend expectations
@router.get("/components")
async def get_model_components(folder: str = "ai.models", user: dict = Depends(verify_token_middleware)):
    """Discover available model components"""
    try:
        from src.utils.component_discovery import discover_components
        
        components = discover_components(folder=folder)
        return {"components": components, "message": "OK"}
    except Exception as e:
        logger.error(f"Error discovering model components: {e}")
        raise HTTPException(status_code=500, detail="Failed to discover model components")


@router.post("/introspect")
async def introspect_model(
    request: Dict[str, Any],
    user: dict = Depends(verify_token_middleware)
):
    """Introspect a model to get its parameters"""
    try:
        module_path = request.get("module_path")
        kind = request.get("kind", "model")
        
        if not module_path:
            raise HTTPException(status_code=400, detail="module_path is required")
            
        result = await ModelConfigService.introspect_model(module_path, kind)
        return result
    except Exception as e:
        logger.error(f"Error introspecting model: {e}")
        raise HTTPException(status_code=500, detail="Failed to introspect model")


@router.get("/categories")
async def get_model_categories(user: dict = Depends(verify_token_middleware)):
    """Get all unique categories for model configurations"""
    try:
        categories = await ModelConfigService.get_model_categories(user)
        return {"categories": categories}
    except Exception as e:
        logger.error(f"Error getting model categories: {e}")
        raise HTTPException(status_code=500, detail="Failed to get model categories")

