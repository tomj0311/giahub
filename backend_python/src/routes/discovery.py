from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, List, Any, Optional
import logging

from src.utils.component_discovery import (
    discover_components,
    get_required_params_for_single_module,
    get_param_defaults,
    clear_caches
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/discovery", tags=["discovery"])


class IntrospectRequest(BaseModel):
    module_path: str
    kind: str = "model"


class IntrospectResponse(BaseModel):
    class_name: str
    required: List[str]
    defaults: Dict[str, Any]


class ModelConfigRequest(BaseModel):
    name: str
    category: Optional[str] = ""
    model: str
    model_params: Dict[str, Any] = {}
    type: str = "model_config"


# In-memory storage for demo purposes - replace with database in production
_model_configs: List[Dict[str, Any]] = []
_categories: List[str] = ["general", "conversation", "analysis", "generation"]
_defaults = {
    "category": "general",
    "model_params": {}
}


@router.get("/components")
async def get_components(
    folder: Optional[str] = None
):
    """Discovery API routes for component discovery and introspection."""
from typing import Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel

# Remove auth dependency for now to make it simpler
from ..utils.component_discovery import (
    discover_components,
    get_required_params_for_single_module,
    get_param_defaults,
    clear_caches
)
import logging

logger = logging.getLogger(__name__)

discovery_router = APIRouter(prefix="/api/discovery", tags=["discovery"])


class IntrospectRequest(BaseModel):
    module_path: str
    kind: str = "model"


class IntrospectResponse(BaseModel):
    class_name: str
    required: list[str]
    defaults: Dict[str, Any]


@discovery_router.get("/components")
async def get_components(
    folder: Optional[str] = Query(None, description="Folder name to discover (e.g., 'models', 'functions')")
):
    """
    Discover components in the specified folder.
    Folder parameter is required for discovery.
    """
    try:
        if not folder:
            raise HTTPException(status_code=400, detail="folder parameter is required for component discovery")
        
        logger.info(f"Discovering components for folder: {folder}")
        components = discover_components(folder=folder)
        
        return {
            "components": components,
            "message": f"Discovered {sum(len(v) for v in components.values())} components"
        }
    except Exception as e:
        logger.error(f"Error discovering components: {e}")
        raise HTTPException(status_code=500, detail=f"Component discovery failed: {str(e)}")


@discovery_router.post("/introspect")
async def introspect_module(
    request: IntrospectRequest
) -> IntrospectResponse:
    """
    Introspect a specific module to get its parameters and defaults.
    """
    try:
        if not request.module_path:
            raise HTTPException(status_code=400, detail="module_path is required")
        
        logger.info(f"Introspecting module: {request.module_path} (kind: {request.kind})")
        
        # Get required parameters and class name
        class_name, required_params = get_required_params_for_single_module(
            request.module_path, 
            request.kind
        )
        
        # Get parameter defaults
        defaults = get_param_defaults(request.module_path, request.kind)
        
        if not class_name:
            raise HTTPException(
                status_code=404, 
                detail=f"No valid class found in module: {request.module_path}"
            )
        
        return IntrospectResponse(
            class_name=class_name,
            required=required_params,
            defaults=defaults
        )
        
    except Exception as e:
        logger.error(f"Error introspecting module {request.module_path}: {e}")
        raise HTTPException(status_code=500, detail=f"Module introspection failed: {str(e)}")


@discovery_router.get("/defaults")
async def get_global_defaults():
    """
    Get global default values for configurations.
    """
    try:
        # Return empty defaults for now - can be extended later
        defaults = {}
        return {"defaults": defaults}
    except Exception as e:
        logger.error(f"Error getting global defaults: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get defaults: {str(e)}")


@discovery_router.get("/categories")
async def get_categories(
    action: str = Query("list_categories", description="Action to perform")
):
    """
    Get available categories for configurations.
    """
    try:
        # Return empty categories for now - can be extended later
        categories = []
        return {"categories": categories}
    except Exception as e:
        logger.error(f"Error getting categories: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get categories: {str(e)}")


@discovery_router.get("/configs")
async def get_configurations():
    """
    Get existing configurations.
    """
    try:
        # Return empty configurations for now - can be extended later
        configurations = []
        return {"configurations": configurations}
    except Exception as e:
        logger.error(f"Error getting configurations: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get configurations: {str(e)}")


@discovery_router.post("/configs")
async def save_configuration(
    config: Dict[str, Any]
):
    """
    Save a new configuration.
    """
    try:
        # For now, just return success - can be extended to actually save
        logger.info(f"Saving configuration: {config.get('name', 'unnamed')}")
        return {"message": "Configuration saved successfully", "config": config}
    except Exception as e:
        logger.error(f"Error saving configuration: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save configuration: {str(e)}")


@discovery_router.post("/clear-cache")
async def clear_discovery_cache():
    """
    Clear all discovery and introspection caches.
    """
    try:
        clear_caches()
        return {"message": "All caches cleared successfully"}
    except Exception as e:
        logger.error(f"Error clearing caches: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to clear caches: {str(e)}")
    try:
        logger.info(f"Discovering components for folder: {folder}")
        components = discover_components(folder)
        logger.info(f"Discovered components: {components}")
        return {"components": components}
    except Exception as e:
        logger.error(f"Failed to discover components: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to discover components: {str(e)}")


@router.post("/introspect")
async def introspect_module(
    request: IntrospectRequest
) -> IntrospectResponse:
    """Introspect a specific module to get its parameters."""
    try:
        logger.info(f"Introspecting module: {request.module_path} (kind: {request.kind})")
        
        class_name, required_params = get_required_params_for_single_module(
            request.module_path, 
            request.kind
        )
        
        defaults = get_param_defaults(request.module_path, request.kind)
        
        logger.info(f"Introspection result - class: {class_name}, required: {required_params}")
        
        return IntrospectResponse(
            class_name=class_name,
            required=required_params,
            defaults=defaults
        )
    except Exception as e:
        logger.error(f"Failed to introspect module {request.module_path}: {e}")
        raise HTTPException(
            status_code=500, 
            detail=f"Failed to introspect module: {str(e)}"
        )


@router.get("/defaults")
async def get_defaults():
    """Get global default values."""
    return {"defaults": _defaults}


@router.get("/categories")
async def get_categories(
    action: str = "list_categories"
):
    """Get available categories."""
    return {"categories": _categories}


@router.get("/configs")
async def get_configs():
    """Get all model configurations."""
    return {"configurations": _model_configs}


@router.post("/configs")
async def save_config(
    config: ModelConfigRequest
):
    """Save or update a model configuration."""
    try:
        # Check if config with this name already exists
        existing_index = None
        for i, existing_config in enumerate(_model_configs):
            if existing_config.get("name") == config.name:
                existing_index = i
                break
        
        config_dict = config.dict()
        
        if existing_index is not None:
            # Update existing config
            _model_configs[existing_index] = config_dict
            logger.info(f"Updated existing config: {config.name}")
        else:
            # Add new config
            _model_configs.append(config_dict)
            logger.info(f"Added new config: {config.name}")
        
        # Add category to categories list if it's new
        if config.category and config.category not in _categories:
            _categories.append(config.category)
        
        return {"message": "Configuration saved successfully", "name": config.name}
    except Exception as e:
        logger.error(f"Failed to save config: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save config: {str(e)}")


@router.post("/clear-cache")
async def clear_discovery_cache():
    """Clear all discovery caches."""
    try:
        clear_caches()
        logger.info("Discovery caches cleared")
        return {"message": "Caches cleared successfully"}
    except Exception as e:
        logger.error(f"Failed to clear caches: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to clear caches: {str(e)}")
