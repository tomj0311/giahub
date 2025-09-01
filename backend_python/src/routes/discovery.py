from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, List, Any, Optional
import logging

from src.utils.component_discovery import (
    discover_components,
    get_detailed_class_info
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/discovery", tags=["discovery"])


class IntrospectRequest(BaseModel):
    module_path: str
    kind: str = "model"


class IntrospectResponse(BaseModel):
    module_path: str
    class_name: str
    formatted_params: List[str]


@router.get("/components")
async def get_components(folder: Optional[str] = None):
    """Discovery API routes for component discovery and introspection."""
    if not folder:
        raise HTTPException(status_code=400, detail="folder parameter is required for component discovery")
    
    logger.info(f"Discovering components for folder: {folder}")
    components = discover_components(folder=folder)
    
    return {
        "components": components,
        "message": f"Discovered {sum(len(v) for v in components.values())} components"
    }


@router.post("/introspect")
async def introspect_module(request: IntrospectRequest) -> IntrospectResponse:
    """Introspect a specific module to get its parameters and defaults."""
    if not request.module_path:
        raise HTTPException(status_code=400, detail="module_path is required")
    
    logger.info(f"Introspecting module: {request.module_path} (kind: {request.kind})")
    
    # Use the new detailed class info function
    detailed_info = get_detailed_class_info(request.module_path, request.kind)
    
    if not detailed_info or not detailed_info.get("classes"):
        raise HTTPException(
            status_code=404, 
            detail=f"No valid class found in module: {request.module_path}"
        )
    
    # Return only the formatted_params for the main class
    main_class = list(detailed_info["classes"].values())[0]
    return {
        "module_path": detailed_info["module_path"],
        "class_name": main_class["class_name"],
        "formatted_params": main_class["formatted_params"]
    }


# Alias for compatibility
discovery_router = router
