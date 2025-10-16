"""
Workflow Configuration CRUD routes
"""

from fastapi import APIRouter, Depends, status, Query, HTTPException, File, UploadFile, Form
from fastapi.responses import StreamingResponse
from typing import Dict, Any, Optional
from io import BytesIO

from ..utils.auth import verify_token_middleware
from ..services.workflow_config_service import WorkflowConfigService
from ..utils.log import logger

router = APIRouter(tags=["workflows"])


@router.get("/configs")
async def list_workflow_configs(
    user: dict = Depends(verify_token_middleware),
    page: int = Query(1, ge=1, description="Page number (1-based)"),
    page_size: int = Query(8, ge=1, le=100, description="Items per page"),
    category: Optional[str] = Query(None, description="Filter by category"),
    search: Optional[str] = Query(None, description="Search in name and description"),
    sort_by: str = Query("name", description="Sort field"),
    sort_order: str = Query("asc", regex="^(asc|desc)$", description="Sort order")
):
    """List workflow configurations for current tenant with pagination"""
    result = await WorkflowConfigService.list_workflow_configs_paginated(
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
async def get_workflow_config(config_id: str, user: dict = Depends(verify_token_middleware)):
    """Get specific workflow configuration"""
    config = await WorkflowConfigService.get_workflow_config_by_id(config_id, user)
    return config


@router.post("/configs", status_code=status.HTTP_201_CREATED)
async def create_workflow_config(
    name: str = Form(...),
    category: str = Form(""),
    description: str = Form(""),
    type: str = Form("workflowConfig"),
    is_active: bool = Form(True),
    bpmn_file: UploadFile = File(...),
    user: dict = Depends(verify_token_middleware)
):
    """Create new workflow configuration with BPMN file upload"""
    config_data = {
        "name": name,
        "category": category,
        "description": description,
        "type": type,
        "is_active": is_active
    }
    
    result = await WorkflowConfigService.create_workflow_config(config_data, bpmn_file, user)
    return result


@router.put("/configs/{config_id}")
async def update_workflow_config(
    config_id: str,
    name: str = Form(None),
    category: str = Form(None),
    description: str = Form(None),
    is_active: bool = Form(None),
    bpmn_file: Optional[UploadFile] = File(None),
    user: dict = Depends(verify_token_middleware)
):
    """Update existing workflow configuration"""
    config_data = {}
    if name is not None:
        config_data["name"] = name
    if category is not None:
        config_data["category"] = category
    if description is not None:
        config_data["description"] = description
    if is_active is not None:
        config_data["is_active"] = is_active
    
    result = await WorkflowConfigService.update_workflow_config_by_id(
        config_id, 
        config_data, 
        bpmn_file,
        user
    )
    return result


@router.delete("/configs/{config_id}")
async def delete_workflow_config(config_id: str, user: dict = Depends(verify_token_middleware)):
    """Delete workflow configuration"""
    result = await WorkflowConfigService.delete_workflow_config_by_id(config_id, user)
    return result


@router.get("/categories")
async def get_workflow_categories(user: dict = Depends(verify_token_middleware)):
    """Get all unique categories for workflow configurations"""
    try:
        categories = await WorkflowConfigService.get_workflow_categories(user)
        return {"categories": categories}
    except Exception as e:
        logger.error(f"Error getting workflow categories: {e}")
        raise HTTPException(status_code=500, detail="Failed to get workflow categories")


@router.get("/configs/{config_id}/bpmn")
async def get_bpmn_file(config_id: str, user: dict = Depends(verify_token_middleware)):
    """Get BPMN file content as plain text"""
    try:
        # Get file content
        content = await WorkflowConfigService.get_bpmn_file_content(config_id, user)
        
        # Return raw XML content as plain text
        return content.decode('utf-8')
            
    except Exception as e:
        logger.error(f"Error getting BPMN file: {e}")
        raise HTTPException(status_code=500, detail="Failed to get BPMN file")


# Health check endpoint for workflow service
@router.get("/health")
async def workflow_health_check():
    """Health check for workflow configuration service"""
    from datetime import datetime
    return {
        "status": "healthy",
        "service": "workflow_config",
        "timestamp": datetime.utcnow().isoformat()
    }
