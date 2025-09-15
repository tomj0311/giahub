"""
Workflow routes for BPMN workflow management.
Handles workflow execution, task completion, and BPMN file uploads.
"""

from typing import Dict, Any, Optional, List
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from pydantic import BaseModel

from ..utils.auth import verify_token_middleware
from ..utils.log import logger
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
def get_workflow_service() -> WorkflowService:
    return WorkflowService()


@router.post("/workflows/{workflow_name}/start")
async def start_workflow(
    workflow_name: str,
    request: StartWorkflowRequest,
    service: WorkflowService = Depends(get_workflow_service),
    current_user: dict = Depends(verify_token_middleware)
):
    """Start a new workflow instance"""
    try:
        logger.info(f"[WORKFLOW] Starting workflow {workflow_name} for user {current_user.get('username', 'unknown')}")
        instance_id = service.start_workflow(workflow_name, request.initial_data)
        return {"instance_id": instance_id}
    except HTTPException as e:
        raise
    except Exception as e:
        logger.error(f"[WORKFLOW] Error starting workflow {workflow_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/workflows/{instance_id}", response_model=WorkflowResponse)
async def get_workflow_status(
    instance_id: str,
    service: WorkflowService = Depends(get_workflow_service),
    current_user: dict = Depends(verify_token_middleware)
):
    """Get workflow status and ready tasks"""
    try:
        logger.debug(f"[WORKFLOW] Getting status for workflow {instance_id}")
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
    service: WorkflowService = Depends(get_workflow_service),
    current_user: dict = Depends(verify_token_middleware)
):
    """Run workflow synchronously"""
    try:
        logger.info(f"[WORKFLOW] Running workflow {instance_id} with max_steps={request.max_steps}")
        result = service.run_workflow_sync(instance_id, request.max_steps)
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
    service: WorkflowService = Depends(get_workflow_service),
    current_user: dict = Depends(verify_token_middleware)
):
    """Complete a specific task in the workflow"""
    try:
        logger.info(f"[WORKFLOW] Completing task {task_id} for workflow {instance_id}")
        result = service.complete_task(instance_id, task_id, request.data)
        return TaskResponse(**result)
    except HTTPException as e:
        raise
    except Exception as e:
        logger.error(f"[WORKFLOW] Error completing task {task_id} in workflow {instance_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/workflows/{instance_id}/tasks", response_model=List[TaskInfo])
async def list_tasks(
    instance_id: str,
    service: WorkflowService = Depends(get_workflow_service),
    current_user: dict = Depends(verify_token_middleware)
):
    """List all tasks in a workflow instance"""
    try:
        logger.debug(f"[WORKFLOW] Listing tasks for workflow {instance_id}")
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
    service: WorkflowService = Depends(get_workflow_service),
    current_user: dict = Depends(verify_token_middleware)
):
    """Stop and remove workflow instance"""
    try:
        logger.info(f"[WORKFLOW] Stopping workflow {instance_id}")
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
    service: WorkflowService = Depends(get_workflow_service),
    current_user: dict = Depends(verify_token_middleware)
):
    """Upload and parse BPMN file"""
    try:
        logger.info(f"[WORKFLOW] Uploading BPMN file {file.filename} for workflow {workflow_name}")
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
    service: WorkflowService = Depends(get_workflow_service),
    current_user: dict = Depends(verify_token_middleware)
):
    """Get workflow service metrics and storage information"""
    try:
        logger.debug("[WORKFLOW] Getting workflow metrics")
        metrics = service.get_workflow_metrics()
        return metrics
    except Exception as e:
        logger.error(f"[WORKFLOW] Error getting metrics: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/redis/all")
async def list_all_redis_workflows_by_tenant(
    service: WorkflowService = Depends(get_workflow_service),
    current_user: dict = Depends(verify_token_middleware)
):
    """NEW: List ALL workflows stored in Redis for current user's tenant"""
    try:
        # Extract tenant_id from JWT token payload
        tenant_id = current_user.get('tenant_id') or current_user.get('tenantId') or 'default-tenant'
        logger.info(f"[WORKFLOW] Listing ALL Redis workflows for tenant: {tenant_id} (from user: {current_user.get('email', 'unknown')})")
        workflows = service.list_all_redis_workflows_by_tenant(tenant_id)
        return {
            "success": True,
            "tenant_id": tenant_id,
            "workflows": workflows,
            "count": len(workflows)
        }
    except Exception as e:
        logger.error(f"[WORKFLOW] Error listing Redis workflows: {e}")
        raise HTTPException(status_code=500, detail=str(e))