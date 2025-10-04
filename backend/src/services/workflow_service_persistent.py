"""
Workflow Service with State Persistence

This service handles BPMN workflow execution and management with state persistence.
Simplified and cleaned up for better readability and maintainability.
"""

import sys
import json
import os
import uuid
import importlib
import inspect
from typing import Any, Dict, Optional
from datetime import datetime, UTC
from fastapi import HTTPException, status

# Add the root directory to Python path so we can import spiffworkflow
root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

from spiffworkflow.bpmn import BpmnWorkflow
from spiffworkflow.bpmn.parser.BpmnParser import BpmnParser
from spiffworkflow.bpmn.serializer import BpmnWorkflowSerializer
from spiffworkflow.bpmn.script_engine import PythonScriptEngine
from spiffworkflow.util.task import TaskState
from bson import ObjectId

from ..utils.log import logger
from ..utils.mongo_storage import MongoStorageService
from .workflow_bpmn_parser import EnhancedBpmnTaskParser
from .agent_runtime_service import AgentRuntimeService
from .workflow_notification_service import TaskNotificationService

logger.debug("[WORKFLOW] Persistent service module loaded")


class WorkflowServicePersistent:
    """Service for handling BPMN workflow execution and management with state persistence"""
    
    @classmethod
    async def execute_workflow_steps(cls, workflow, workflow_id, user, instance_id=None):
        """Execute workflow one step at a time with centralized status updates"""
        try:
            tenant_id = await cls.validate_tenant_access(user)
            logger.debug(f"[WORKFLOW] Starting workflow execution - instance_id: {instance_id}")
            
            # Create instance if new
            if not instance_id:
                instance_id = await cls.save_workflow_state(workflow, workflow_id, tenant_id)
                logger.debug(f"[WORKFLOW] Created new instance: {instance_id}")
                
            # Process until completion or user input needed
            step_count = 0
            while not workflow.is_completed():
                step_count += 1
                logger.debug(f"[WORKFLOW] Executing step {step_count}")
                
                # Log current task states before execution
                ready_tasks = [t for t in workflow.get_tasks() if t.state == TaskState.READY]
                                
                for task in ready_tasks:
                    task_type = type(task.task_spec).__name__
                    if task_type == "NoneTask":
                        # NoneTask should not be executed - let SpiffWorkflow handle it according to standard
                        logger.debug(f"[WORKFLOW] NoneTask detected: {task.task_spec.bpmn_id} - letting SpiffWorkflow handle according to standard")
                        # Don't try to execute or complete - let the engine handle it naturally
                        continue
                    elif task_type == "ScriptTask":
                        logger.info(f"[WORKFLOW] Handling ScriptTask: {task.task_spec.bpmn_id}")
                        try:
                            await cls.handle_script_task(task)
                            break  # Process one script task at a time
                        except Exception as script_error:
                            logger.error(f"[WORKFLOW] ScriptTask {task.task_spec.bpmn_id} failed: {script_error}")
                            await cls._handle_task_error(workflow, instance_id, tenant_id, task, script_error, "ScriptTask")
                            raise HTTPException(status_code=500, detail=f"ScriptTask failed: {str(script_error)}")
                    elif task_type == "ServiceTask":
                        logger.info(f"[WORKFLOW] Handling ServiceTask: {task.task_spec.bpmn_id}")
                        try:
                            await cls.handle_service_task(task, user)
                            await cls._update_workflow_status(workflow, instance_id, tenant_id)
                            break  # Process one service task at a time
                        except Exception as service_error:
                            logger.error(f"[WORKFLOW] ServiceTask {task.task_spec.bpmn_id} failed: {service_error}")
                            await cls._handle_task_error(workflow, instance_id, tenant_id, task, service_error, "ServiceTask")
                            raise HTTPException(status_code=500, detail=f"ServiceTask failed: {str(service_error)}")

                try:
                    workflow.do_engine_steps()
                except Exception as engine_error:
                    logger.error(f"[WORKFLOW] Engine step {step_count} failed: {engine_error}")
                    await cls._handle_engine_error(workflow, instance_id, tenant_id, engine_error, step_count)
                    raise HTTPException(status_code=500, detail=f"Workflow engine error: {str(engine_error)}")
                
                # Update status after each step
                current_status = await cls._update_workflow_status(workflow, instance_id, tenant_id, step_count)
                logger.debug(f"[WORKFLOW] Updated after step {step_count} with status: {current_status}")
                
                # Check if user input needed
                if workflow.manual_input_required():
                    ready_tasks = [t for t in workflow.get_tasks() if t.state == TaskState.READY]
                    if ready_tasks:
                        task = ready_tasks[0]
                        task_type = type(task.task_spec).__name__
                        logger.info(f"[WORKFLOW] Manual input required for {task_type}: {task.task_spec.bpmn_id}")
                        
                        # Update with user input waiting status
                        await cls._update_workflow_status(workflow, instance_id, tenant_id, step_count, {
                            "waiting_for_user_input": True,
                            "current_task_type": task_type
                        })
                        
                        if task_type in ["UserTask", "ManualTask", "NoneTask"]:
                            logger.debug(f"[WORKFLOW] Waiting for user input for {task_type}: {task.task_spec.bpmn_id}")
                            
                            try:
                                await TaskNotificationService.send_task_assignment_emails(task, workflow_id, instance_id)
                            except Exception as e:
                                logger.error(f"[WORKFLOW] Email notification failed: {e}")
                            
                            break
                                    
            # Final update
            await cls._update_workflow_status(workflow, instance_id, tenant_id)
            logger.info(f"[WORKFLOW] Workflow execution completed after {step_count} steps")
            
            return {
                "instance_id": instance_id,
                "completed": workflow.is_completed(),
                "needs_user_input": workflow.manual_input_required(),
                "current_task_id": cls._get_current_task_id(workflow)
            }
            
            return status_data
        
        except Exception as e:
            logger.error(f"[WORKFLOW] Error: {e}", exc_info=True)
            raise

    @classmethod
    async def handle_script_task(cls, task):
        """Handle ScriptTask execution"""
        try:
            bpmn_id = task.task_spec.bpmn_id
            logger.info(f"[WORKFLOW] Executing ScriptTask: {bpmn_id}")
            
            # Execute the script using SpiffWorkflow's script engine
            if hasattr(task.task_spec, 'script') and task.task_spec.script:
                # The script engine should already be configured on the workflow
                task.run()
                logger.info(f"[WORKFLOW] ScriptTask {bpmn_id} completed successfully")
            else:
                logger.warning(f"[WORKFLOW] ScriptTask {bpmn_id} has no script to execute")
                task.complete()
                
        except Exception as e:
            logger.error(f"[WORKFLOW] Error handling ScriptTask {task.task_spec.bpmn_id}: {e}")
            task.data["error"] = str(e)
            task.error()
            raise

    @classmethod
    async def _handle_task_error(cls, workflow, instance_id, tenant_id, task, error, task_type):
        """Helper method to handle task errors consistently"""
        task.data["error"] = str(error)
        task.error()
        
        # Update status with task error information
        await cls._update_workflow_status(workflow, instance_id, tenant_id, extra_data={
            "error": str(error),
            "error_task_id": task.task_spec.bpmn_id,
            "error_task_type": task_type
        })

    @classmethod
    async def _handle_engine_error(cls, workflow, instance_id, tenant_id, error, step_count):
        """Helper method to handle engine errors consistently"""
        # Mark any ready tasks as errored if engine step fails
        for task in workflow.get_tasks():
            if task.state == TaskState.READY:
                task.data["error"] = f"Engine step failed: {str(error)}"
                task.error()
        
        # Update status with error information
        await cls._update_workflow_status(workflow, instance_id, tenant_id, extra_data={
            "error": str(error),
            "error_type": "engine_step",
            "error_step": step_count
        })

    @classmethod
    async def handle_service_task(cls, task, user):
        """Handle ServiceTask by reading extensionElements for function calls or fallback to external API"""
        try:
            bpmn_id = task.task_spec.bpmn_id
            logger.info(f"[WORKFLOW] Handling ServiceTask: {bpmn_id}")
            
            response_data = None
            
            # Check if task has extension elements with service configuration
            if hasattr(task.task_spec, 'extensions') and task.task_spec.extensions:
                logger.debug(f"[WORKFLOW] Found extensions in task {bpmn_id}: {task.task_spec.extensions}")
                
                service_config = task.task_spec.extensions.get('serviceConfiguration')
                if service_config and 'function' in service_config:
                    function_config = service_config['function']
                    module_name = function_config.get('moduleName')
                    function_name = function_config.get('functionName')
                    parameters = function_config.get('parameters', {}).get('parameter', [])
                    
                    logger.info(f"[WORKFLOW] Executing function: {module_name}.{function_name}")
                    
                    # Build function parameters from task data and config
                    function_params = {}
                    for param in parameters:
                        if isinstance(param, dict):
                            param_name = param.get('name')
                            param_value = param.get('value')
                            if param_name:
                                # Check if value is in task data, otherwise use config value
                                if param_value in task.data:
                                    function_params[param_name] = task.data[param_value]
                                else:
                                    function_params[param_name] = param_value
                    
                    # Add user to parameters if not already present
                    if 'user' not in function_params:
                        function_params['user'] = user
                    
                    # Import and execute the function
                    try:
                        module_path = f"backend.src.services.{module_name}"
                        module = importlib.import_module(module_path)
                        function = getattr(module, function_name)
                        
                        # Execute function
                        if inspect.iscoroutinefunction(function):
                            response_data = await function(**function_params)
                        else:
                            response_data = function(**function_params)
                        
                        logger.info(f"[WORKFLOW] Function executed successfully: {module_name}.{function_name}")
                        
                    except (ImportError, AttributeError) as e:
                        logger.error(f"[WORKFLOW] Function execution failed: {e}")
                        raise Exception(f"Function execution failed: {str(e)}")
                        
            else:
                # No extensions, fallback to external API call
                logger.debug(f"[WORKFLOW] No extensions found, using external API for task {bpmn_id}")
                response_data = await cls.call_external_api(task.data, user)
            
            # Handle the response
            if response_data:
                # Update task data with response
                task.data.update(response_data)
                task.complete()
                logger.info(f"[WORKFLOW] ServiceTask {bpmn_id} completed successfully")
            else:
                # Empty response - treat as error
                logger.warning(f"[WORKFLOW] ServiceTask {bpmn_id} received empty response")
                task.data["error"] = "Empty response from service"
                task.error()
                raise Exception(f"ServiceTask {bpmn_id} failed: Empty response from service")
            
        except Exception as e:
            logger.error(f"[WORKFLOW] Error handling ServiceTask {task.task_spec.bpmn_id}: {e}")
            # Set error in task data
            task.data["error"] = str(e)
            task.error()
            # Re-raise to stop workflow execution
            raise

    @staticmethod
    async def save_workflow_state(workflow, workflow_id, tenant_id=None):
        """Serialize and save workflow state to MongoDB"""
        logger.debug(f"[WORKFLOW] Saving workflow state for workflow_id='{workflow_id}' (tenant='{tenant_id}')")
        try:
            instance_id = uuid.uuid4().hex[:6]

            serializer = BpmnWorkflowSerializer()
            serialized_json = serializer.serialize_json(workflow)
            logger.debug(f"[WORKFLOW] Workflow serialized (chars={len(serialized_json)}) for instance='{instance_id}'")

            data = {
                "workflow_id": workflow_id,
                "instance_id": instance_id,
                "serialized_data": json.loads(serialized_json),
                "user_task": [],
                "created_at": datetime.now(UTC),
            }

            await MongoStorageService.insert_one("workflowInstances", data, tenant_id)
            logger.info(f"[WORKFLOW] Workflow state saved to MongoDB - instance: {instance_id}")
            return instance_id

        except HTTPException:
            # Pass through HTTP exceptions untouched after logging
            logger.error(
                f"[WORKFLOW] Failed to save workflow state for workflow_id='{workflow_id}'",
                exc_info=True,
            )
            raise
        except Exception as e:
            logger.error(
                f"[WORKFLOW] Error saving workflow state for workflow_id='{workflow_id}': {e}",
                exc_info=True,
            )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to save workflow state: {str(e)}",
            )

    @staticmethod
    async def update_workflow_instance(workflow, instance_id, tenant_id=None):
        """Update existing workflow instance in MongoDB"""
        try:
            serializer = BpmnWorkflowSerializer()
            serialized_json = serializer.serialize_json(workflow)

            update_data = {
                "serialized_data": json.loads(serialized_json),
                "user_task": [],
                "updated_at": datetime.now(UTC),
            }

            await MongoStorageService.update_one(
                "workflowInstances", {"instance_id": instance_id}, update_data, tenant_id
            )
            logger.info(f"[WORKFLOW] Workflow instance updated in MongoDB - instance: {instance_id}")
        except Exception as e:
            logger.error(f"[WORKFLOW] Failed to update workflow instance '{instance_id}': {e}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to update workflow instance: {str(e)}",
            )

    @staticmethod
    async def list_workflows_paginated(workflow_id: str, page: int = 1, size: int = 8, status: str = "all", user: dict = None):
        """List workflows with pagination and status filter"""
        logger.debug(f"[WORKFLOW] Listing workflows for: {workflow_id}, page: {page}, size: {size}, status: {status}")
        try:
            # Build query based on status
            query = {"workflow_id": workflow_id}
            if status == "incomplete":
                query["serialized_data.completed"] = False
            elif status == "complete":
                query["serialized_data.completed"] = True
            # For "all", no additional filter needed

            # Get total count and paginated documents
            total = await MongoStorageService.count_documents("workflowInstances", query)
            skip = (page - 1) * size
            
            docs = await MongoStorageService.find_many(
                "workflowInstances", 
                query, 
                skip=skip, 
                limit=size,
                sort_field="created_at",
                sort_order=-1  # Most recent first
            )

            workflows = []
            for doc in docs:
                workflow = {
                    "id": str(doc["_id"]),
                    "workflow_id": doc.get("workflow_id"),
                    "instance_id": doc.get("instance_id"),
                    "created_at": doc.get("created_at").isoformat() if doc.get("created_at") else None,
                    "status": "complete" if doc.get("serialized_data", {}).get("completed", False) else "incomplete"
                }
                workflows.append(workflow)

            logger.debug(f"[WORKFLOW] Found {len(workflows)} workflows (total: {total})")
            return {
                "data": workflows,
                "total": total,
                "page": page,
                "size": size
            }

        except Exception as e:
            logger.error(f"[WORKFLOW] Failed to list workflows: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to list workflows: {str(e)}",
            )

    @staticmethod
    async def get_workflow_instance(workflow_id: str, instance_id: str, tenant_id: Optional[str] = None, user: dict = None):
        """Get specific workflow instance by instance_id"""
        logger.debug(f"[WORKFLOW] Getting instance {instance_id} for workflow {workflow_id}")
        try:
            query = {"workflow_id": workflow_id, "instance_id": instance_id}
            instance = await MongoStorageService.find_one("workflowInstances", query, tenant_id=tenant_id)

            if not instance:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Workflow instance {instance_id} not found",
                )

            # Convert ObjectId to string for JSON serialization
            if "_id" in instance:
                instance["_id"] = str(instance["_id"])

            # Convert datetime objects to ISO strings for JSON serialization
            for date_field in ["created_at", "updated_at"]:
                if date_field in instance:
                    if hasattr(instance[date_field], "isoformat"):
                        instance[date_field] = instance[date_field].isoformat()
                    elif isinstance(instance[date_field], dict) and "$date" in instance[date_field]:
                        # Handle MongoDB $date format
                        instance[date_field] = instance[date_field]["$date"]

            return instance

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"[WORKFLOW] Failed to get workflow instance: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to get workflow instance: {str(e)}",
            )

    @staticmethod
    async def delete_workflow_instance(workflow_id: str, instance_id: str, tenant_id: Optional[str] = None, user: dict = None):
        """Delete specific workflow instance by instance_id"""
        logger.debug(f"[WORKFLOW] Deleting instance {instance_id} for workflow {workflow_id}")
        try:
            query = {"workflow_id": workflow_id, "instance_id": instance_id}
            success = await MongoStorageService.delete_one("workflowInstances", query, tenant_id=tenant_id)

            if not success:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Workflow instance {instance_id} not found",
                )

            logger.info(f"[WORKFLOW] Successfully deleted workflow instance: {instance_id}")
            return True

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"[WORKFLOW] Failed to delete workflow instance: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to delete workflow instance: {str(e)}",
            )

    @staticmethod
    async def validate_tenant_access(user: dict) -> str:
        """Validate tenant access and return tenant_id"""
        tenant_id = user.get("tenantId")
        if not tenant_id:
            logger.warning(f"[WORKFLOW] Missing tenant information for user: {user.get('id')}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User tenant information missing. Please re-login.",
            )
        return tenant_id

    @classmethod
    def _get_current_task_id(cls, workflow):
        """Get current task ID if waiting for user input"""
        if workflow.manual_input_required():
            ready_tasks = [t for t in workflow.get_tasks() if t.state == TaskState.READY]
            if ready_tasks:
                return ready_tasks[0].task_spec.bpmn_id
        return None

    @classmethod
    async def _update_workflow_status(cls, workflow, instance_id, tenant_id, step_count=None, extra_data=None):
        """Update workflow status and save to MongoDB - centralized to avoid redundancy"""
        status_data = {
            "instance_id": instance_id,
            "completed": workflow.is_completed(),
            "needs_user_input": workflow.manual_input_required(),
            "current_task_id": cls._get_current_task_id(workflow)
        }
        
        workflow.data.update({
            "workflow_status": status_data,
            "last_updated": datetime.now(UTC).isoformat()
        })
        
        if step_count is not None:
            workflow.data["step_count"] = step_count
            
        if extra_data:
            workflow.data.update(extra_data)
            
        await cls.update_workflow_instance(workflow, instance_id, tenant_id)
        return status_data

    @classmethod
    async def get_workflow_status(cls, workflow_id: str, instance_id: str, user: Dict[str, Any]):
        """Get workflow status from MongoDB"""
        tenant_id = await cls.validate_tenant_access(user)
        
        try:
            instance = await cls.get_workflow_instance(workflow_id, instance_id, tenant_id)
            serializer = BpmnWorkflowSerializer()
            workflow = serializer.deserialize_json(json.dumps(instance["serialized_data"]))
            
            return {
                "instance_id": instance_id,
                "completed": workflow.is_completed(),
                "needs_user_input": workflow.manual_input_required(),
                "current_task_id": cls._get_current_task_id(workflow),
                "workflow_data": workflow.data
            }
            
        except Exception as e:
            logger.error(f"[WORKFLOW] Status check failed: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=str(e))

    @classmethod
    async def handle_user_task(
        cls,
        workflow_id: str,
        instance_id: str,
        task_id: str,
        task_data: Dict[str, Any],
        user: Dict[str, Any],
    ):
        """Submit user task and continue workflow"""
        tenant_id = await cls.validate_tenant_access(user)
        logger.info(f"[WORKFLOW] Submitting task {task_id} for instance {instance_id} with data: {task_data}")
        
        try:
            # Get workflow from MongoDB
            instance = await cls.get_workflow_instance(workflow_id, instance_id, tenant_id)
            serializer = BpmnWorkflowSerializer()
            workflow = serializer.deserialize_json(json.dumps(instance["serialized_data"]))
            
            # Find current task and complete it
            ready_tasks = [t for t in workflow.get_tasks() if t.state == TaskState.READY or t.state == TaskState.STARTED or t.state == TaskState.ERROR]
            if not ready_tasks:
                raise HTTPException(status_code=400, detail="No ready tasks found")
                
            current_task = ready_tasks[0]
            if current_task.task_spec.bpmn_id != task_id:
                raise HTTPException(status_code=400, detail=f"Expected task {task_id}, got {current_task.task_spec.bpmn_id}")
            
            # Update task data and complete the task
            try:
                current_task.data.update(task_data)
                workflow.data.update(task_data)  # Also update workflow global data
                current_task.complete()
                logger.info(f"[WORKFLOW] Task {task_id} completed successfully")
                
            except Exception as task_error:
                logger.error(f"[WORKFLOW] Error completing task {task_id}: {task_error}")
                current_task.data["error"] = str(task_error)
                current_task.error()
                await cls._update_workflow_status(workflow, instance_id, tenant_id, extra_data={
                    "error": str(task_error),
                    "error_type": "task_completion"
                })
                raise HTTPException(status_code=500, detail=f"Task completion failed: {str(task_error)}")
            
            # Update status after completing task
            await cls._update_workflow_status(workflow, instance_id, tenant_id)
            
            # Continue workflow execution
            result = await cls.execute_workflow_steps(workflow, workflow_id, user, instance_id)
            
            return {
                "message": "Task submitted successfully",
                "instance_id": instance_id,
                "completed": result["completed"],
                "needs_user_input": result["needs_user_input"],
                "current_task_id": result["current_task_id"]
            }
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"[WORKFLOW] Submit failed: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=str(e))

    @classmethod
    async def run_workflow(cls, workflow_id: str, initial_data: Dict[str, Any], user: Dict[str, Any]):
        """Create and start new workflow, save to MongoDB"""
        tenant_id = await cls.validate_tenant_access(user)
        logger.info(f"[WORKFLOW] Starting new workflow {workflow_id}")
        
        try:
            # Get BPMN XML
            bpmn_xml = await cls.get_bpmn_xml(workflow_id, user)
            
            # Create workflow with enhanced parser
            script_engine = PythonScriptEngine()
            parser = BpmnParser()
            
            # Register our enhanced task parser for all task types
            from spiffworkflow.bpmn.parser.util import full_tag
            from spiffworkflow.bpmn.specs.defaults import (
                UserTask, ManualTask, ServiceTask, ScriptTask, NoneTask
            )
            
            enhanced_parsers = {
                full_tag('userTask'): (EnhancedBpmnTaskParser, UserTask),
                full_tag('manualTask'): (EnhancedBpmnTaskParser, ManualTask),
                full_tag('serviceTask'): (EnhancedBpmnTaskParser, ServiceTask),
                full_tag('scriptTask'): (EnhancedBpmnTaskParser, ScriptTask),
                full_tag('task'): (EnhancedBpmnTaskParser, NoneTask),
            }
            
            # Update the parser's override classes
            parser.OVERRIDE_PARSER_CLASSES.update(enhanced_parsers)
            
            clean_bpmn = bpmn_xml.replace('<?xml version="1.0" encoding="UTF-8"?>', "").strip()
            parser.add_bpmn_str(clean_bpmn)
            
            process_ids = parser.get_process_ids()
            if not process_ids:
                raise HTTPException(status_code=400, detail="No processes found in BPMN")
                
            spec = parser.get_spec(process_ids[0])
            subprocess_specs = parser.get_subprocess_specs(process_ids[0], specs={})
            
            workflow = BpmnWorkflow(spec, subprocess_specs=subprocess_specs, script_engine=script_engine)
            
            # Set initial data
            if initial_data:
                workflow.data.update(initial_data)
            
            # Execute workflow and save to MongoDB
            result = await cls.execute_workflow_steps(workflow, workflow_id, user)
            
            return {
                "message": "Workflow started successfully",
                "instance_id": result["instance_id"],
                "completed": result["completed"],
                "needs_user_input": result["needs_user_input"],
                "current_task_id": result["current_task_id"]
            }
                
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"[WORKFLOW] Failed to start workflow: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=str(e))

    @classmethod
    async def get_bpmn_xml(cls, workflow_id: str, user: Dict[str, Any]):
        """Get BPMN XML content from file storage"""
        logger.info(f"[WORKFLOW] Retrieving BPMN for workflow ID: {workflow_id}")

        if not user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User information is required",
            )

        tenant_id = await cls.validate_tenant_access(user)

        try:
            # Import file service
            from backend.src.services.file_service import FileService

            # Get workflow config from MongoDB
            logger.debug(f"[WORKFLOW] Fetching workflow config for ID: {workflow_id}, tenant: {tenant_id}")
            config = await MongoStorageService.find_one(
                "workflowConfig", {"_id": ObjectId(workflow_id)}, tenant_id=tenant_id
            )

            if not config:
                logger.warning(f"[WORKFLOW] Workflow config not found: id='{workflow_id}', tenant='{tenant_id}'")
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Workflow configuration not found for ID: {workflow_id}",
                )

            # Get file path from config
            file_path = config.get("file_path") or config.get("bpmn_file_path")
            if not file_path:
                logger.error(f"[WORKFLOW] No file path found in config: {config}")
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="BPMN file path not found in workflow configuration",
                )

            # Get BPMN XML from file storage
            logger.debug(f"[WORKFLOW] Loading BPMN file from path: {file_path}")
            bpmn_content = await FileService.get_file_content_from_path(file_path)
            return bpmn_content.decode("utf-8")
        
        except Exception as e:
            logger.error(f"[WORKFLOW] Failed to retrieve workflow {workflow_id}: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to retrieve workflow: {str(e)}",
            )
