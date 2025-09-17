"""
Workflow CRUD routes - refactored to use WorkflowService
"""

from fastapi import APIRouter, Depends, status, Query, HTTPException
from typing import Dict, Any, Optional
from pydantic import BaseModel
from datetime import datetime

from ..utils.auth import verify_token_middleware
from ..services.workflow_service import WorkflowService
from ..utils.log import logger

router = APIRouter(tags=["workflows"])


class StartWorkflowRequest(BaseModel):
    initial_data: Optional[Dict[str, Any]] = None


class RunRequest(BaseModel):
    max_steps: Optional[int] = None


class CompleteTaskRequest(BaseModel):
    data: Optional[Dict[str, Any]] = None


@router.post("/workflows/{workflow_id}/start")
async def start_workflow_by_workflow_id(
    workflow_id: str,
    request: StartWorkflowRequest,
    user: dict = Depends(verify_token_middleware)
):
    """Start a new workflow instance using workflow configuration ID"""
    # Add tenant info to initial data
    initial_data = request.initial_data or {}
    tenant_id = user.get('tenantId') or user.get('tenant_id')
    initial_data.update({
        "workflow_id": workflow_id,
        "tenant_id": tenant_id,
        "started_by": user.get('username') or user.get('email', 'unknown'),
        "started_at": str(datetime.now())
    })
    
    result = await WorkflowService.run_workflow_from_id(
        workflow_id, 
        initial_data, 
        user
    )
    return result


@router.get("/workflows/health")
async def workflow_health_check():
    """Health check for workflow service"""
    return {"status": "healthy", "service": "workflow"}


