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
async def start_workflow(
    workflow_id: str,
    request: StartWorkflowRequest,
    user: dict = Depends(verify_token_middleware)
):
    """Start a new workflow instance"""
    result = await WorkflowService.start_workflow(workflow_id, request.initial_data)
    return result


@router.post("/workflows/config/{workflow_id}/start")
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
    
    result = await WorkflowService.start_workflow_by_workflow_id_for_user(
        workflow_id, 
        initial_data, 
        user
    )
    return result


@router.get("/workflows/{workflow_id}")
async def get_workflow_status(
    workflow_id: str, 
    user: dict = Depends(verify_token_middleware)
):
    """Get status of all instances for a given workflow ID"""
    result = await WorkflowService.get_workflow_status(workflow_id)
    return result


@router.post("/workflows/{instance_id}/run")
async def run_workflow(
    instance_id: str,
    request: RunRequest,
    user: dict = Depends(verify_token_middleware)
):
    """Run workflow synchronously"""
    result = await WorkflowService.run_workflow_sync(instance_id, request.max_steps, user)
    return result


@router.post("/workflows/{instance_id}/tasks/{task_id}/complete")
async def complete_task(
    instance_id: str,
    task_id: str,
    request: CompleteTaskRequest,
    user: dict = Depends(verify_token_middleware)
):
    """Complete a specific task in the workflow"""
    tenant_id = user.get('tenantId') or user.get('tenant_id')
    result = await WorkflowService.complete_user_task(
        instance_id, 
        task_id, 
        request.data, 
        tenant_id
    )
    return result


@router.get("/workflows/{instance_id}/tasks")
async def list_tasks(
    instance_id: str,
    user: dict = Depends(verify_token_middleware)
):
    """List all tasks in a workflow instance"""
    tasks = await WorkflowService.list_tasks(instance_id)
    return tasks


@router.delete("/workflows/{instance_id}")
async def stop_workflow(
    instance_id: str,
    user: dict = Depends(verify_token_middleware)
):
    """Stop and remove workflow instance"""
    result = await WorkflowService.stop_workflow(instance_id)
    return result


@router.get("/workflows/health")
async def workflow_health_check():
    """Health check for workflow service"""
    return {"status": "healthy", "service": "workflow"}


@router.get("/workflows/metrics")
async def get_workflow_metrics(user: dict = Depends(verify_token_middleware)):
    """Get workflow service metrics and storage information"""
    metrics = await WorkflowService.get_workflow_metrics()
    return metrics


@router.get("/workflows/{workflow_id}/instances")
async def list_workflow_instances(
    workflow_id: str,
    status: Optional[str] = None,
    limit: int = 20,
    skip: int = 0,
    user: dict = Depends(verify_token_middleware)
):
    """List workflow instances for a specific workflow configuration ID with pagination"""
    tenant_id = user.get('tenantId') or user.get('tenant_id')
    result = await WorkflowService.get_workflow_instances(workflow_id, tenant_id, status, limit, skip)
    return result