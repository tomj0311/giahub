"""
Workflow CRUD routes - refactored to use WorkflowService
"""

from fastapi import APIRouter, Depends, status, Query, HTTPException, BackgroundTasks, UploadFile, File, Form
from typing import Dict, Any, Optional, List
from pydantic import BaseModel
from datetime import datetime
import time
import os
import uuid
import json

from ..utils.auth import verify_token_middleware
from ..services.workflow_service_persistent import WorkflowServicePersistent
from ..services.workflow_config_service import WorkflowConfigService
from ..services.file_service import FileService
from ..utils.log import logger

router = APIRouter(tags=["workflows"])

# Lightweight in-memory cache to coalesce near-simultaneous requests
_INCOMPLETE_CACHE = {}
_INCOMPLETE_CACHE_TTL = float(os.getenv("INCOMPLETE_CACHE_TTL", "0.5"))  # seconds


async def _run_workflow_background(workflow_id: str, instance_id: str, initial_data: dict, user: dict):
    """Run workflow in background"""
    try:
        await WorkflowServicePersistent.run_workflow(workflow_id, initial_data, user, instance_id=instance_id)
        logger.info(f"Workflow {workflow_id} instance {instance_id} completed in background")
    except Exception as e:
        logger.error(f"Background workflow {workflow_id} instance {instance_id} failed: {str(e)}")

@router.post("/workflows/{workflow_id}/start")
async def start_workflow_by_workflow_id(
    workflow_id: str,
    request: dict,
    background_tasks: BackgroundTasks,
    user: dict = Depends(verify_token_middleware)
):
    """Start a new workflow instance using workflow configuration ID"""
    # Add tenant info to initial data
    initial_data = request.get('initial_data', {})
    tenant_id = user.get('tenantId') or user.get('tenant_id')
    
    # Generate instance_id first
    instance_id = uuid.uuid4().hex[:6]

    initial_data.update({
        "workflow_id": workflow_id,
        "instance_id": instance_id,
        "tenant_id": tenant_id,
        "started_by": user.get('username') or user.get('email', 'unknown'),
        "started_at": str(datetime.now())
    })
    
    # Start workflow in background with instance_id
    background_tasks.add_task(_run_workflow_background, workflow_id, instance_id, initial_data, user)
    
    return {
        "success": True,
        "message": "Workflow started in background",
        "workflow_id": workflow_id,
        "instance_id": instance_id
    }


@router.post("/workflows/by-name/{workflow_name}/start")
async def start_workflow_by_name(
    workflow_name: str,
    request: dict,
    background_tasks: BackgroundTasks,
    user: dict = Depends(verify_token_middleware)
):
    """Start a new workflow instance using workflow name"""
    try:
        # Validate tenant access
        tenant_id = await WorkflowServicePersistent.validate_tenant_access(user)
        
        # Find workflow configuration by name
        logger.info(f"[WORKFLOW] Looking up workflow by name: {workflow_name}")
        workflow_config = await WorkflowConfigService.get_workflow_config_by_name(workflow_name, user)
        
        if not workflow_config:
            logger.warning(f"[WORKFLOW] Workflow not found: {workflow_name}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Workflow '{workflow_name}' not found"
            )
        
        workflow_id = workflow_config.get("id")
        
        # Add tenant info to initial data
        initial_data = request.get('initial_data', {})
        
        # Generate instance_id first
        instance_id = uuid.uuid4().hex[:6]

        initial_data.update({
            "workflow_id": workflow_id,
            "workflow_name": workflow_name,
            "instance_id": instance_id,
            "tenant_id": tenant_id,
            "started_by": user.get('username') or user.get('email', 'unknown'),
            "started_at": str(datetime.now())
        })
        
        # Start workflow in background with instance_id
        background_tasks.add_task(_run_workflow_background, workflow_id, instance_id, initial_data, user)
        
        logger.info(f"[WORKFLOW] Started workflow '{workflow_name}' (ID: {workflow_id}) with instance: {instance_id}")
        
        return {
            "success": True,
            "message": "Workflow started in background",
            "workflow_name": workflow_name,
            "workflow_id": workflow_id,
            "instance_id": instance_id
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[WORKFLOW] Failed to start workflow by name '{workflow_name}': {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to start workflow: {str(e)}"
        )


@router.get("/workflows/health")
async def workflow_health_check():
    """Health check for workflow service"""
    return {"status": "healthy", "service": "workflow"}


@router.get("/workflows/{workflow_id}/incomplete")
async def get_incomplete_workflows(
    workflow_id: str,
    page: int = Query(1, ge=1),
    size: int = Query(8, ge=1, le=100),
    user: dict = Depends(verify_token_middleware)
):
    """Get incomplete workflow instances for a specific workflow ID with pagination"""
    try:
        cache_key = f"{workflow_id}_{page}_{size}"
        now = time.time()
        cached = _INCOMPLETE_CACHE.get(cache_key)
        if cached and (now - cached["ts"]) < _INCOMPLETE_CACHE_TTL:
            logger.debug(f"[WORKFLOW] Returning cached response for incomplete list: workflow_id={workflow_id}")
            return cached["data"]

        incomplete_workflows = await WorkflowServicePersistent.list_workflows_paginated(
            workflow_id, page, size, status="incomplete", user=user
        )
        response_data = {
            "success": True,
            "data": incomplete_workflows.get("data", []),
            "count": len(incomplete_workflows.get("data", [])),
            "total": incomplete_workflows.get("total", 0),
            "page": page,
            "size": size,
            "total_pages": (incomplete_workflows.get("total", 0) + size - 1) // size
        }
        _INCOMPLETE_CACHE[cache_key] = {"ts": now, "data": response_data}
        logger.debug(f"[WORKFLOW] Returning response: {response_data}")
        return response_data
    except Exception as e:
        error_msg = f"Failed to get incomplete workflows: {str(e)}"
        logger.error(f"[HTTP 500] {error_msg}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=error_msg)


@router.get("/workflows/{workflow_id}/instances")
async def get_all_workflows(
    workflow_id: str,
    page: int = Query(1, ge=1),
    size: int = Query(8, ge=1, le=100),
    status: str = Query("all", regex="^(all|complete|incomplete)$"),
    user: dict = Depends(verify_token_middleware)
):
    """Get all workflow instances for a specific workflow ID with pagination"""
    try:
        cache_key = f"{workflow_id}_{page}_{size}_{status}"
        now = time.time()
        cached = _INCOMPLETE_CACHE.get(cache_key)
        if cached and (now - cached["ts"]) < _INCOMPLETE_CACHE_TTL:
            logger.debug(f"[WORKFLOW] Returning cached response for all workflows: workflow_id={workflow_id}")
            return cached["data"]

        workflows = await WorkflowServicePersistent.list_workflows_paginated(
            workflow_id, page, size, status=status, user=user
        )
        response_data = {
            "success": True,
            "data": workflows.get("data", []),
            "count": len(workflows.get("data", [])),
            "total": workflows.get("total", 0),
            "page": page,
            "size": size,
            "total_pages": (workflows.get("total", 0) + size - 1) // size
        }
        _INCOMPLETE_CACHE[cache_key] = {"ts": now, "data": response_data}
        logger.debug(f"[WORKFLOW] Returning response: {response_data}")
        return response_data
    except Exception as e:
        error_msg = f"Failed to get workflows: {str(e)}"
        logger.error(f"[HTTP 500] {error_msg}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=error_msg)


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
        error_msg = f"Failed to get workflow instance: {str(e)}"
        logger.error(f"[HTTP 500] {error_msg}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=error_msg)


async def _submit_task_background(workflow_id: str, instance_id: str, task_id: str, task_data: dict, user: dict):
    """Submit task in background"""
    try:
        result = await WorkflowServicePersistent.handle_user_task(
            workflow_id, instance_id, task_id, task_data, user
        )
        logger.info(f"Task {task_id} completed in background")
    except Exception as e:
        logger.error(f"Background task {task_id} failed: {str(e)}")

@router.post("/workflows/{workflow_id}/instances/{instance_id}/submit-task")
async def submit_user_task(
    workflow_id: str,
    instance_id: str,
    task_id: str = Form(...),
    data: str = Form("{}"),
    files: List[UploadFile] = File(None),
    background_tasks: BackgroundTasks = None,
    user: dict = Depends(verify_token_middleware)
):
    """Submit user task data and continue workflow (with optional file uploads)"""
    try:
        # Parse task_data from form
        task_data = json.loads(data) if data else {}
        
        # Handle file uploads if present
        if files and any(f.filename for f in files):
            user_id = user.get('userId') or user.get('user_id') or user.get('id', 'unknown')
            tenant_id = await FileService.validate_tenant_access(user)
            
            # Upload files to: uploads/{user_id}/{workflow_id}/{instance_id}/
            upload_path = f"uploads/{user_id}/{workflow_id}/{instance_id}"
            
            uploaded_files = []
            for file in files:
                if not file.filename:
                    continue
                try:
                    file_info = await FileService.upload_file_to_storage(
                        file, tenant_id, user_id, workflow_id, path=upload_path
                    )
                    uploaded_files.append({
                        "filename": file_info["filename"],
                        "file_path": file_info["file_path"],
                        "file_size": file_info["file_size"],
                        "content_type": file_info.get("content_type")
                    })
                    logger.info(f"Uploaded file: {file_info['filename']} to {file_info['file_path']}")
                except Exception as e:
                    logger.error(f"Failed to upload file {file.filename}: {str(e)}")
            
            # Add file references to task_data
            if uploaded_files:
                task_data["uploaded_files"] = uploaded_files
        
        # Submit task in background
        background_tasks.add_task(_submit_task_background, workflow_id, instance_id, task_id, task_data, user)
        
        return {"success": True, "message": "Task submitted in background", "task_id": task_id}
    except json.JSONDecodeError:
        logger.error(f"Invalid JSON in data field")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid JSON format in data field"
        )
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
        workflow_id, instance_id, task_id, new_data, user
    )
    return {"success": result}


