"""
Workflow routes for BPMN workflow management.
Handles workflow execution, task completion, and BPMN file uploads.
"""

from typing import Dict, Any, Optional, List
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from pydantic import BaseModel

from ..utils.auth import verify_token_middleware
from ..utils.log import logger
from ..utils.mongo_storage import MongoStorageService
from ..services.workflow_service import WorkflowService

router = APIRouter(tags=["workflows"])

# Pydantic models for requests and responses
class StartWorkflowRequest(BaseModel):
    initial_data: Optional[Dict[str, Any]] = None


class RunRequest(BaseModel):
    max_steps: Optional[int] = None


class CompleteTaskRequest(BaseModel):
    data: Optional[Dict[str, Any]] = None


class WorkflowResponse(BaseModel):
    instance_id: str
    status: str
    ready_tasks: List[Dict[str, Any]]
    data: Dict[str, Any]


class TaskResponse(BaseModel):
    success: bool
    is_completed: bool


class TaskInfo(BaseModel):
    task_id: str
    name: str
    type: str
    state: str


class BpmnUploadResponse(BaseModel):
    success: bool
    workflow_name: str


# Service dependency  
# REMOVED: No longer using dependency injection, following same pattern as other routes


@router.post("/workflows/{workflow_name}/start")
async def start_workflow(
    workflow_name: str,
    request: StartWorkflowRequest,
    current_user: dict = Depends(verify_token_middleware)
):
    """Start a new workflow instance"""
    try:
        logger.info(f"[WORKFLOW] Starting workflow {workflow_name} for user {current_user.get('username', 'unknown')}")
        service = WorkflowService()
        instance_id = service.start_workflow(workflow_name, request.initial_data)
        return {"instance_id": instance_id}
    except HTTPException as e:
        raise
    except Exception as e:
        logger.error(f"[WORKFLOW] Error starting workflow {workflow_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/workflows/config/{config_id}/start")
async def start_workflow_by_config_id(
    config_id: str,
    request: StartWorkflowRequest,
    current_user: dict = Depends(verify_token_middleware)
):
    """Start a new workflow instance using workflow configuration ID"""
    try:
        logger.info(f"[WORKFLOW] Starting workflow by config ID {config_id} for user {current_user.get('username', 'unknown')}")
        
        # Add tenant info to initial data
        initial_data = request.initial_data or {}
        tenant_id = current_user.get('tenantId') or current_user.get('tenant_id')
        initial_data.update({
            "config_id": config_id,
            "tenant_id": tenant_id,
            "started_by": current_user.get('username') or current_user.get('email', 'unknown'),
            "started_at": str(datetime.now())
        })
        
        instance_id = await WorkflowService.start_workflow_by_config_id_for_user(config_id, initial_data, current_user)
        
        return {
            "instance_id": instance_id,
            "config_id": config_id,
            "message": "Workflow started successfully"
        }
    except HTTPException as e:
        raise
    except Exception as e:
        logger.error(f"[WORKFLOW] Error starting workflow by config ID {config_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/workflows/{instance_id}", response_model=WorkflowResponse)
async def get_workflow_status(
    instance_id: str,
    current_user: dict = Depends(verify_token_middleware)
):
    """Get workflow status and ready tasks"""
    try:
        logger.debug(f"[WORKFLOW] Getting status for workflow {instance_id}")
        service = WorkflowService()
        result = service.get_workflow_status(instance_id)
        return WorkflowResponse(**result)
    except HTTPException as e:
        raise
    except Exception as e:
        logger.error(f"[WORKFLOW] Error getting workflow {instance_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/workflows/{instance_id}/run")
async def run_workflow(
    instance_id: str,
    request: RunRequest,
    current_user: dict = Depends(verify_token_middleware)
):
    """Run workflow synchronously"""
    try:
        logger.info(f"[WORKFLOW] Running workflow {instance_id} with max_steps={request.max_steps}")
        service = WorkflowService()
        result = await service.run_workflow_sync(instance_id, request.max_steps)
        return result
    except HTTPException as e:
        raise
    except Exception as e:
        logger.error(f"[WORKFLOW] Error running workflow {instance_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/workflows/{instance_id}/tasks/{task_id}/complete", response_model=TaskResponse)
async def complete_task(
    instance_id: str,
    task_id: str,
    request: CompleteTaskRequest,
    current_user: dict = Depends(verify_token_middleware)
):
    """Complete a specific task in the workflow"""
    try:
        logger.info(f"[WORKFLOW] Completing task {task_id} for workflow {instance_id}")
        tenant_id = current_user.get('tenantId') or current_user.get('tenant_id')
        service = WorkflowService()
        result = await service.complete_user_task(instance_id, task_id, request.data, tenant_id)
        return TaskResponse(**result)
    except HTTPException as e:
        raise
    except Exception as e:
        logger.error(f"[WORKFLOW] Error completing task {task_id} in workflow {instance_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/workflows/{instance_id}/tasks", response_model=List[TaskInfo])
async def list_tasks(
    instance_id: str,
    current_user: dict = Depends(verify_token_middleware)
):
    """List all tasks in a workflow instance"""
    try:
        logger.debug(f"[WORKFLOW] Listing tasks for workflow {instance_id}")
        service = WorkflowService()
        tasks = service.list_tasks(instance_id)
        return [TaskInfo(**task) for task in tasks]
    except HTTPException as e:
        raise
    except Exception as e:
        logger.error(f"[WORKFLOW] Error listing tasks for workflow {instance_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/workflows/{instance_id}")
async def stop_workflow(
    instance_id: str,
    current_user: dict = Depends(verify_token_middleware)
):
    """Stop and remove workflow instance"""
    try:
        logger.info(f"[WORKFLOW] Stopping workflow {instance_id}")
        service = WorkflowService()
        service.stop_workflow(instance_id)
        return {"success": True}
    except HTTPException as e:
        raise
    except Exception as e:
        logger.error(f"[WORKFLOW] Error stopping workflow {instance_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/bpmn/upload", response_model=BpmnUploadResponse)
async def upload_bpmn(
    workflow_name: str = Form(...),
    file: UploadFile = File(...),
    current_user: dict = Depends(verify_token_middleware)
):
    """Upload and parse BPMN file"""
    try:
        logger.info(f"[WORKFLOW] Uploading BPMN file {file.filename} for workflow {workflow_name}")
        service = WorkflowService()
        result = service.upload_bpmn(file, workflow_name)
        return BpmnUploadResponse(**result)
    except HTTPException as e:
        raise
    except Exception as e:
        logger.error(f"[WORKFLOW] Error uploading BPMN: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/workflows/health")
async def workflow_health_check():
    """Health check for workflow service"""
    return {"status": "healthy", "service": "workflow"}


@router.get("/workflows/metrics")
async def get_workflow_metrics(
    current_user: dict = Depends(verify_token_middleware)
):
    """Get workflow service metrics and storage information"""
    try:
        logger.debug("[WORKFLOW] Getting workflow metrics")
        service = WorkflowService()
        metrics = service.get_workflow_metrics()
        return metrics
    except Exception as e:
        logger.error(f"[WORKFLOW] Error getting metrics: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/instances")
async def list_workflow_instances(
    status: Optional[str] = None,
    limit: int = 20,
    skip: int = 0,
    current_user: dict = Depends(verify_token_middleware)
):
    """List workflow instances with pagination"""
    try:
        tenant_id = current_user.get('tenantId') or current_user.get('tenant_id')
        logger.info(f"[WORKFLOW] Listing workflow instances for tenant: {tenant_id}, status: {status}, limit: {limit}, skip: {skip}")
        
        service = WorkflowService()
        result = await service.get_workflow_instances(tenant_id, status, limit, skip)
        return result
    except HTTPException as e:
        raise
    except Exception as e:
        logger.error(f"[WORKFLOW] Error listing workflow instances: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/instances/{instance_id}")
async def get_workflow_instance_details(
    instance_id: str,
    current_user: dict = Depends(verify_token_middleware)
):
    """Get detailed information about a specific workflow instance"""
    try:
        tenant_id = current_user.get('tenantId') or current_user.get('tenant_id')
        logger.info(f"[WORKFLOW] Getting instance details for: {instance_id}")
        
        # First check if instance exists in database
        instance = await MongoStorageService.find_one(
            "workflowInstances",
            {"instance_id": instance_id},
            tenant_id
        )
        
        if not instance:
            raise HTTPException(status_code=404, detail=f"Workflow instance '{instance_id}' not found")
        
        # Get runtime status if instance is in memory
        service = WorkflowService()
        runtime_status = None
        if instance_id in service.active_workflows:
            runtime_status = service.get_workflow_status(instance_id)
        
        return {
            "instance": instance,
            "runtime_status": runtime_status,
            "in_memory": instance_id in service.active_workflows
        }
    except HTTPException as e:
        raise
    except Exception as e:
        logger.error(f"[WORKFLOW] Error getting instance details for {instance_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))