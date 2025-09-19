"""
Workflow CRUD routes - refactored to use WorkflowService
"""

from fastapi import APIRouter, Depends, status, Query, HTTPException
from typing import Dict, Any, Optional
from pydantic import BaseModel
from datetime import datetime

from ..utils.auth import verify_token_middleware
from ..services.workflow_service_persistent import WorkflowServicePersistent
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
    
    result = await WorkflowServicePersistent.run_workflow(
        workflow_id, 
        initial_data, 
        user
    )
    return result


@router.get("/workflows/health")
async def workflow_health_check():
    """Health check for workflow service"""
    return {"status": "healthy", "service": "workflow"}


@router.get("/workflows/{workflow_id}/incomplete")
async def get_incomplete_workflows(
    workflow_id: str,
    user: dict = Depends(verify_token_middleware)
):
    """Get incomplete workflow instances for a specific workflow ID"""
    try:
        incomplete_workflows = await WorkflowServicePersistent.list_incomplete_workflows(workflow_id)
        response_data = {
            "success": True,
            "data": incomplete_workflows,
            "count": len(incomplete_workflows)
        }
        logger.debug(f"[WORKFLOW] Returning response: {response_data}")
        return response_data
    except Exception as e:
        logger.error(f"Error getting incomplete workflows: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get incomplete workflows: {str(e)}"
        )


@router.get("/workflows/{workflow_id}/instances/{instance_id}")
async def get_workflow_instance(
    workflow_id: str,
    instance_id: str,
    user: dict = Depends(verify_token_middleware)
):
    """Get specific workflow instance data"""
    try:
        tenant_id = await WorkflowServicePersistent.validate_tenant_access(user)
        instance = await WorkflowServicePersistent.get_workflow_instance(
            workflow_id, instance_id, tenant_id
        )
        return {"success": True, "data": instance}
    except Exception as e:
        logger.error(f"Error getting workflow instance: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get workflow instance: {str(e)}"
        )


@router.post("/workflows/{workflow_id}/instances/{instance_id}/submit-task")
async def submit_user_task(
    workflow_id: str,
    instance_id: str,
    request: CompleteTaskRequest,
    user: dict = Depends(verify_token_middleware)
):
    """Submit user task data and continue workflow"""
    try:
        tenant_id = await WorkflowServicePersistent.validate_tenant_access(user)
        result = await WorkflowServicePersistent.submit_user_task_and_continue(
            workflow_id, instance_id, request.data or {}, tenant_id
        )
        return {"success": True, "data": result}
    except Exception as e:
        logger.error(f"Error submitting user task: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to submit user task: {str(e)}"
        )


@router.put("/workflows/{workflow_id}/instances/{instance_id}/tasks/{task_id}/data")
async def update_task_data(
    workflow_id: str,
    instance_id: str,
    task_id: str,
    new_data: Dict[str, Any],
    user: dict = Depends(verify_token_middleware)
):
    """Update task data"""
    result = await WorkflowServicePersistent.update_serialized_task_data(
        workflow_id, instance_id, task_id, new_data
    )
    return {"success": result}


