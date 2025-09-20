"""
Workflow CRUD routes - refactored to use WorkflowService
"""

from fastapi import APIRouter, Depends, status, Query, HTTPException
from typing import Dict, Any, Optional
from pydantic import BaseModel
from datetime import datetime
import time
import os

from ..utils.auth import verify_token_middleware
from ..services.workflow_service_persistent import WorkflowServicePersistent
from ..utils.log import logger

router = APIRouter(tags=["workflows"])

# Lightweight in-memory cache to coalesce near-simultaneous requests
_INCOMPLETE_CACHE = {}
_INCOMPLETE_CACHE_TTL = float(os.getenv("INCOMPLETE_CACHE_TTL", "0.5"))  # seconds


@router.post("/workflows/{workflow_id}/start")
async def start_workflow_by_workflow_id(
    workflow_id: str,
    request: dict,
    user: dict = Depends(verify_token_middleware)
):
    """Start a new workflow instance using workflow configuration ID"""
    # Add tenant info to initial data
    initial_data = request.get('initial_data', {})
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
        now = time.time()
        cached = _INCOMPLETE_CACHE.get(workflow_id)
        if cached and (now - cached["ts"]) < _INCOMPLETE_CACHE_TTL:
            logger.debug(f"[WORKFLOW] Returning cached response for incomplete list: workflow_id={workflow_id}")
            return cached["data"]

        incomplete_workflows = await WorkflowServicePersistent.list_incomplete_workflows(workflow_id)
        response_data = {
            "success": True,
            "data": incomplete_workflows,
            "count": len(incomplete_workflows)
        }
        _INCOMPLETE_CACHE[workflow_id] = {"ts": now, "data": response_data}
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
    request: dict,
    user: dict = Depends(verify_token_middleware)
):
    """Submit user task data and continue workflow"""
    try:
        tenant_id = await WorkflowServicePersistent.validate_tenant_access(user)
        
        # Extract task_id and task_data from request
        task_id = request.get("task_id")
        task_data = request.get("data", {})
        
        if not task_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="task_id is required in request body"
            )
        
        result = await WorkflowServicePersistent.submit_user_task_and_continue(
            workflow_id, instance_id, task_id, task_data, user
        )
        return {"success": True, "data": result}
    except Exception as e:
        logger.error(f"Error executing task: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to submit user task: {str(e)}"
        )


@router.delete("/workflows/{workflow_id}/instances/{instance_id}")
async def delete_workflow_instance(
    workflow_id: str,
    instance_id: str,
    user: dict = Depends(verify_token_middleware)
):
    """Delete a workflow instance from MongoDB"""
    try:
        tenant_id = await WorkflowServicePersistent.validate_tenant_access(user)
        result = await WorkflowServicePersistent.delete_workflow_instance(
            workflow_id, instance_id, tenant_id
        )
        
        # Clear cache to force refresh
        if workflow_id in _INCOMPLETE_CACHE:
            del _INCOMPLETE_CACHE[workflow_id]
            
        return {"success": True, "message": "Workflow instance deleted successfully"}
    except Exception as e:
        logger.error(f"Error deleting workflow instance: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete workflow instance: {str(e)}"
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


