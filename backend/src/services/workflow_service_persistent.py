"""
Workflow Service with State Persistence

This service handles BPMN workflow execution and management with state persistence.
Follows the exact pattern for SpiffWorkflow state management.
"""

import sys
import json
import os
import time
import uuid
from typing import Any, Dict, List, Optional
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
from lxml import etree
from bson import ObjectId

from ..utils.log import logger
from ..utils.mongo_storage import MongoStorageService
from .workflow_bpmn_parser import EnhancedBpmnTaskParser
from .agent_runtime_service import AgentRuntimeService
from .workflow_notification_service import TaskNotificationService

# Module loaded log
logger.debug("[WORKFLOW] Persistent service module loaded")


class WorkflowServicePersistent:
    """Service for handling BPMN workflow execution and management with state persistence"""
    
    @classmethod
    async def execute_workflow_steps(cls, workflow, workflow_id, user, instance_id=None, bpmn_map=None):
        """SIMPLE: Execute workflow one step at a time, always update MongoDB"""
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
                started_tasks = [t for t in workflow.get_tasks() if t.state == TaskState.STARTED]
                completed_tasks = [t for t in workflow.get_tasks() if t.state == TaskState.COMPLETED]
                
                logger.debug(f"[WORKFLOW] Before step {step_count}: Ready={len(ready_tasks)}, Started={len(started_tasks)}, Completed={len(completed_tasks)}")
                
                # Check for ScriptTasks in READY state and handle them separately
                ready_tasks = [t for t in workflow.get_tasks() if t.state == TaskState.READY]
                script_tasks_handled = False
                
                for task in ready_tasks:
                    task_type = type(task.task_spec).__name__
                    if task_type == "NoneTask":
                        # NoneTask should not be executed - let SpiffWorkflow handle it according to standard
                        logger.debug(f"[WORKFLOW] NoneTask detected: {task.task_spec.bpmn_id} - letting SpiffWorkflow handle according to standard")
                        # Don't try to execute or complete - let the engine handle it naturally
                        continue
                    elif task_type == "ScriptTask":
                        logger.info(f"[WORKFLOW] Handling ScriptTask separately: {task.task_spec.bpmn_id}")
                        try:
                            await cls.handle_script_task(task)
                            script_tasks_handled = True
                            break  # Process one script task at a time
                        except Exception as script_error:
                            logger.error(f"[WORKFLOW] ScriptTask {task.task_spec.bpmn_id} failed: {script_error}")
                            await cls.update_workflow_instance(workflow, instance_id, tenant_id)
                            raise HTTPException(status_code=500, detail=f"ScriptTask failed: {str(script_error)}")
                
                # If we handled a script task, skip do_engine_steps and continue to next iteration
                if script_tasks_handled:
                    await cls.update_workflow_instance(workflow, instance_id, tenant_id)
                    continue
                
                # Execute workflow engine steps with error handling (for non-script tasks)
                try:
                    workflow.do_engine_steps()
                except Exception as engine_error:
                    logger.error(f"[WORKFLOW] Engine step {step_count} failed: {engine_error}")
                    # Mark any ready tasks as errored if engine step fails
                    for task in workflow.get_tasks():
                        if task.state == TaskState.READY:
                            task.data["error"] = f"Engine step failed: {str(engine_error)}"
                            task.error()
                    await cls.update_workflow_instance(workflow, instance_id, tenant_id)
                    raise HTTPException(status_code=500, detail=f"Workflow engine error: {str(engine_error)}")
                
                # ALWAYS update MongoDB after each step
                await cls.update_workflow_instance(workflow, instance_id, tenant_id)
                logger.debug(f"[WORKFLOW] MongoDB updated after step {step_count}")
                
                # Check if user input needed
                if workflow.manual_input_required():
                    ready_tasks = [t for t in workflow.get_tasks() if t.state == TaskState.READY]
                    if ready_tasks:
                        task = ready_tasks[0]
                        task_type = type(task.task_spec).__name__
                        logger.info(f"[WORKFLOW] Manual input required for {task_type}: {task.task_spec.bpmn_id}")
                        
                        if task_type in ["UserTask", "ManualTask", "NoneTask"]:
                            # Extension elements are now stored in serialized data
                            # No need for separate storage - just wait for user input
                            logger.debug(f"[WORKFLOW] Waiting for user input for {task_type}: {task.task_spec.bpmn_id}")
                            
                            # Send task assignment emails if extensions contain email addresses
                            try:
                                await TaskNotificationService.send_task_assignment_emails(task, workflow_id, instance_id)
                            except Exception as e:
                                logger.error(f"[WORKFLOW] Email notification failed: {e}")
                            
                            # Stop here - wait for user input
                            break
                        
                        elif task_type == "ServiceTask":
                            # Handle ServiceTask in READY state
                            try:
                                await cls.handle_service_task(task, bpmn_map, user)
                                await cls.update_workflow_instance(workflow, instance_id, tenant_id)
                                continue  # Continue processing after handling service task
                            except Exception as service_error:
                                logger.error(f"[WORKFLOW] ServiceTask {task.task_spec.bpmn_id} failed: {service_error}")
                                task.data["error"] = str(service_error)
                                task.error()
                                await cls.update_workflow_instance(workflow, instance_id, tenant_id)
                                # STOP the workflow - don't continue!
                                raise HTTPException(status_code=500, detail=f"ServiceTask failed: {str(service_error)}")
                
                # Check for ServiceTask in STARTED state
                started_tasks = [t for t in workflow.get_tasks() if t.state == TaskState.STARTED]
                for task in started_tasks:
                    task_type = type(task.task_spec).__name__
                    if task_type == "ServiceTask":
                        logger.info(f"[WORKFLOW] Handling ServiceTask in STARTED state: {task.task_spec.bpmn_id}")
                        try:
                            await cls.handle_service_task(task, bpmn_map, user)
                            await cls.update_workflow_instance(workflow, instance_id, tenant_id)
                            break  # Process one service task at a time
                        except Exception as service_error:
                            logger.error(f"[WORKFLOW] ServiceTask {task.task_spec.bpmn_id} failed in STARTED state: {service_error}")
                            task.data["error"] = str(service_error)
                            task.error()
                            await cls.update_workflow_instance(workflow, instance_id, tenant_id)
                            # STOP the workflow - don't continue!
                            raise HTTPException(status_code=500, detail=f"ServiceTask failed: {str(service_error)}")
            
            # Final MongoDB update
            await cls.update_workflow_instance(workflow, instance_id, tenant_id)
            logger.info(f"[WORKFLOW] Workflow execution completed after {step_count} steps")
            
            return {
                "instance_id": instance_id,
                "completed": workflow.is_completed(),
                "needs_user_input": workflow.manual_input_required(),
                "current_task_id": cls._get_current_task_id(workflow)
            }
        
        except Exception as e:
            logger.error(f"[WORKFLOW] Error: {e}", exc_info=True)
            raise

    @staticmethod
    def handle_user_task(task, form_map: Dict[str, List[Dict[str, str]]] | None = None):
        """
        Handle UserTask by prompting for form fields and ManualTask with simple confirmation.
        """
        logger.info(f"Handling user task: {task.task_spec.name}")
        dct = {}

        # Handle ManualTask - just needs confirmation
        if task.task_spec.__class__.__name__ == "ManualTask":
            return {
                "confirmation": {
                    "field_id": "manual_confirmation",
                    "label": "Confirm to proceed",
                    "type": "boolean",
                    "value": None,
                    "required": True,
                }
            }

        # Handle UserTask with form fields
        bpmn_id = getattr(task.task_spec, "bpmn_id", None)
        fields = []
        if form_map and bpmn_id and bpmn_id in form_map:
            fields = form_map[bpmn_id]

        if fields:
            for field in fields:
                label = field.get("label") or field.get("id")
                # Store form field definition instead of prompting for input
                dct[field.get("id") or label] = {
                    "field_id": field.get("id"),
                    "label": label,
                    "type": field.get("type", str),
                    "value": None,  # Will be filled by frontend
                    "required": field.get("requirwed", False),
                }
        else:
            logger.warning("No form metadata found for user task")

        return dct

    @classmethod
    async def handle_service_task(cls, task, bpmn_map, user):
        """Handle ServiceTask by reading ioSpecification and calling external API"""
        try:
            bpmn_id = task.task_spec.bpmn_id
            logger.info(f"[WORKFLOW] Handling ServiceTask: {bpmn_id}")
            
            # Get ioSpecification from task spec's io_specification attribute
            io_spec = {'inputs': {}, 'outputs': {}}
            if hasattr(task.task_spec, 'io_specification') and task.task_spec.io_specification:
                # Extract inputs and outputs from BpmnIoSpecification object
                io_spec_obj = task.task_spec.io_specification
                if hasattr(io_spec_obj, 'data_inputs'):
                    for data_input in io_spec_obj.data_inputs:
                        io_spec['inputs'][data_input.bpmn_id] = data_input.bpmn_name or data_input.bpmn_id
                if hasattr(io_spec_obj, 'data_outputs'):
                    for data_output in io_spec_obj.data_outputs:
                        io_spec['outputs'][data_output.bpmn_id] = data_output.bpmn_name or data_output.bpmn_id
                logger.debug(f"[WORKFLOW] Using ioSpecification from task spec: {io_spec}")
            else:
                logger.debug(f"[WORKFLOW] No ioSpecification found for ServiceTask {bpmn_id}")
                # Use default empty specification
            
            # Also get extensions for additional service task configuration
            extensions = {}
            if hasattr(task.task_spec, 'extensions') and task.task_spec.extensions:
                extensions = task.task_spec.extensions
                logger.debug(f"[WORKFLOW] Task extensions: {extensions}")
            
            # Call external API with parameters from both ioSpec inputs and extensions
            try:
                # Use inputs from ioSpecification, but also include extension data if needed
                api_params = io_spec.get('inputs', {})
                if extensions:
                    api_params.update(extensions)
                    
                response_data = await cls.call_external_api(api_params, user)
                if response_data is None:
                    raise ValueError("External API returned None")
                
                # response_data is already a dictionary, no need to parse JSON
                response = response_data
            except Exception as e:
                logger.error(f"[WORKFLOW] Failed to call external API for ServiceTask {bpmn_id}: {e}")
                task.data["error"] = f"API call failed: {str(e)}"
                task.error()
                # Don't return - raise exception to stop workflow
                raise Exception(f"ServiceTask {bpmn_id} failed: {str(e)}")
            
            # Handle the response based on io specification outputs
            if response:
                # Update task data with response
                task.data.update(response)
                
                # Map response data to specified outputs in ioSpecification
                await cls.map_outputs_to_task(task, io_spec.get('outputs', {}), response)
                
                task.complete()
                logger.info(f"[WORKFLOW] ServiceTask {bpmn_id} completed successfully")
            else:
                # Empty response - treat as error
                logger.warning(f"[WORKFLOW] ServiceTask {bpmn_id} received empty response")
                task.data["error"] = "Empty response from external API"
                task.error()
                # Don't return - raise exception to stop workflow
                raise Exception(f"ServiceTask {bpmn_id} failed: Empty response from external API")
            
        except Exception as e:
            logger.error(f"[WORKFLOW] Error handling ServiceTask {task.task_spec.bpmn_id}: {e}")
            # Set error in task data
            task.data["error"] = str(e)
            task.error()
            # Re-raise to stop workflow execution
            raise

    @staticmethod
    async def call_external_api(params, user):
        """
        Function to call an external API using requestData from the BPMN process.
        Designed as a SpiffWorkflow service task delegate.
        """
        try:
            # Parse incoming params
            request_data = {}
            
            if params:
                # If params is already a dict, use it directly
                if isinstance(params, dict):
                    request_data = params
                else:
                    # If params is a string, try to parse it
                    import json
                    request_data = json.loads(params) if isinstance(params, str) else {}

            # Check if this is an agent call
            if request_data.get('serviceType') == 'agent':
                agent_name = request_data.get('agentName', None)
                prompt = request_data.get('prompt', None)
                
                # Generate a 6-digit conversation ID
                conv_id = uuid.uuid4().hex[:6]
                
                # Call agent with proper parameters
                result = ""
                async for response in AgentRuntimeService.execute_agent(
                    agent_name=agent_name, 
                    prompt=prompt, 
                    user=user, 
                    conv_id=conv_id, 
                    cancel_event=None, 
                    stream=False
                ):
                    if response.get("type") == "error":
                        # Handle agent error and raise exception
                        error_msg = response.get("error", "Unknown agent error")
                        logger.error(f"[WORKFLOW] Agent execution failed: {error_msg}")
                        raise Exception(f"Agent execution failed: {error_msg}")
                    elif response.get("type") == "agent_response":
                        result = response.get("payload", {}).get("content", "")
                        break
                
            dummy_response = {"status": "success", "data": "dummy response"}
            logger.info(f"[WORKFLOW] External API call completed with sample response: {dummy_response}")
            return dummy_response

        except Exception as e:
            error_msg = f"Service task API call failed: {str(e)}"
            logger.error(f"[WORKFLOW] {error_msg}")
            # Re-raise the exception so calling code can handle it properly
            raise
  
    @staticmethod
    async def save_workflow_state(workflow, workflow_id, tenant_id=None, form_map=None):
        """Serialize and save workflow state to MongoDB"""
        logger.debug(
            f"[WORKFLOW] Saving workflow state for workflow_id='{workflow_id}' (tenant='{tenant_id}')"
        )
        try:
            instance_id = uuid.uuid4().hex[:6]

            serializer = BpmnWorkflowSerializer()
            serialized_json = serializer.serialize_json(workflow)
            logger.debug(
                f"[WORKFLOW] Workflow serialized (chars={len(serialized_json)}) for instance='{instance_id}'"
            )

            # Get current user tasks and their form fields
            user_tasks = []

            data = {
                "workflow_id": workflow_id,
                "instance_id": instance_id,
                "serialized_data": json.loads(serialized_json),
                "user_task": user_tasks,
                "created_at": datetime.now(UTC),
            }

            await MongoStorageService.insert_one("workflowInstances", data, tenant_id)
            logger.info(
                f"[WORKFLOW] Workflow state saved to MongoDB - instance: {instance_id}"
            )
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
    async def update_workflow_instance(
        workflow, instance_id, tenant_id=None
    ):
        """Update existing workflow instance in MongoDB"""
        try:
            serializer = BpmnWorkflowSerializer()
            serialized_json = serializer.serialize_json(workflow)

            user_tasks = []

            update_data = {
                "serialized_data": json.loads(serialized_json),
                "user_task": user_tasks,
                "updated_at": datetime.now(UTC),
            }

            await MongoStorageService.update_one(
                "workflowInstances", {"instance_id": instance_id}, update_data, tenant_id
            )
            logger.info(
                f"[WORKFLOW] Workflow instance updated in MongoDB - instance: {instance_id}"
            )
        except Exception as e:
            logger.error(
                f"[WORKFLOW] Failed to update workflow instance '{instance_id}': {e}",
                exc_info=True,
            )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to update workflow instance: {str(e)}",
            )

    @staticmethod
    async def load_workflow_state(workflow_id, tenant_id=None):
        """Load workflow state from MongoDB"""
        # Find the latest instance for this workflow
        result = await MongoStorageService.find_one(
            "workflowInstances", {"workflow_id": workflow_id}, tenant_id=tenant_id
        )

        if not result:
            return None

        serializer = BpmnWorkflowSerializer()
        serialized_json = json.dumps(result["serialized_data"])
        workflow = serializer.deserialize_json(serialized_json)
        return workflow

    @staticmethod
    async def list_incomplete_workflows(workflow_id: str):
        """List incomplete workflows for given workflow ID"""
        logger.debug(f"[WORKFLOW] Listing incomplete workflows for: {workflow_id}")
        try:
            query = {"workflow_id": workflow_id, "serialized_data.completed": False}
            docs = await MongoStorageService.find_many("workflowInstances", query)

            workflows = []
            for doc in docs:
                workflow = {
                    "id": str(doc["_id"]),
                    "workflow_id": doc.get("workflow_id"),
                    "instance_id": doc.get("instance_id"),
                    "created_at": (
                        doc.get("created_at").isoformat()
                        if doc.get("created_at")
                        else None
                    ),
                }
                workflows.append(workflow)

            logger.debug(f"[WORKFLOW] Found {len(workflows)} incomplete workflows")
            return workflows

        except Exception as e:
            logger.error(f"[WORKFLOW] Failed to list incomplete workflows: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to list incomplete workflows: {str(e)}",
            )

    @staticmethod
    async def list_workflows_paginated(workflow_id: str, page: int = 1, size: int = 8, status: str = "all"):
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

            # Get total count
            total = await MongoStorageService.count_documents("workflowInstances", query)
            
            # Calculate skip value for pagination
            skip = (page - 1) * size
            
            # Get paginated documents
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
                    "created_at": (
                        doc.get("created_at").isoformat()
                        if doc.get("created_at")
                        else None
                    ),
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
    async def get_workflow_instance(
        workflow_id: str, instance_id: str, tenant_id: Optional[str] = None
    ):
        """Get specific workflow instance by instance_id"""
        logger.debug(
            f"[WORKFLOW] Getting instance {instance_id} for workflow {workflow_id}"
        )
        try:
            query = {"workflow_id": workflow_id, "instance_id": instance_id}
            instance = await MongoStorageService.find_one(
                "workflowInstances", query, tenant_id=tenant_id
            )

            if not instance:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Workflow instance {instance_id} not found",
                )

            # Convert ObjectId to string for JSON serialization
            if "_id" in instance:
                instance["_id"] = str(instance["_id"])

            # Convert datetime objects to ISO strings for JSON serialization
            if "created_at" in instance:
                if hasattr(instance["created_at"], "isoformat"):
                    instance["created_at"] = instance["created_at"].isoformat()
                elif (
                    isinstance(instance["created_at"], dict)
                    and "$date" in instance["created_at"]
                ):
                    # Handle MongoDB $date format
                    instance["created_at"] = instance["created_at"]["$date"]

            if "updated_at" in instance:
                if hasattr(instance["updated_at"], "isoformat"):
                    instance["updated_at"] = instance["updated_at"].isoformat()
                elif (
                    isinstance(instance["updated_at"], dict)
                    and "$date" in instance["updated_at"]
                ):
                    # Handle MongoDB $date format
                    instance["updated_at"] = instance["updated_at"]["$date"]

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
    async def delete_workflow_instance(
        workflow_id: str, instance_id: str, tenant_id: Optional[str] = None
    ):
        """Delete specific workflow instance by instance_id"""
        logger.debug(
            f"[WORKFLOW] Deleting instance {instance_id} for workflow {workflow_id}"
        )
        try:
            query = {"workflow_id": workflow_id, "instance_id": instance_id}
            success = await MongoStorageService.delete_one(
                "workflowInstances", query, tenant_id=tenant_id
            )

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
            logger.warning(
                f"[WORKFLOW] Missing tenant information for user: {user.get('id')}"
            )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User tenant information missing. Please re-login.",
            )
        return tenant_id

    @staticmethod
    async def parse_bpmn(
        bpmn_xml: str,
    ) -> Dict[str, List[Dict[str, str]]]:
        """Extract simple formData/formField definitions by BPMN node id.

        - Supports tags named 'formData'/'formField' regardless of namespace.
        - Returns mapping: node_id -> list of {id,label,type} dicts.
        """
        try:
            bpmn_map = {"root": etree.fromstring(bpmn_xml.encode("utf-8"))}
            return bpmn_map
        
        except Exception:
            return {}

    @classmethod
    def _get_current_task_id(cls, workflow):
        """Get current task ID if waiting for user input"""
        if workflow.manual_input_required():
            ready_tasks = [t for t in workflow.get_tasks() if t.state == TaskState.READY]
            if ready_tasks:
                return ready_tasks[0].task_spec.bpmn_id
        return None

    @classmethod
    async def map_outputs_to_task(cls, task, output_spec, response_data):
        """Map API response data to task outputs based on ioSpecification"""
        try:
            if not output_spec or not response_data:
                return
                
            # For each defined output in the ioSpecification
            for output_name, output_config in output_spec.items():
                if output_name in response_data:
                    # Map the response data to task data with the specified output name
                    task.data[output_name] = response_data[output_name]
                    logger.debug(f"[WORKFLOW] Mapped output {output_name}: {response_data[output_name]}")
                else:
                    # Set default value if output not found in response
                    task.data[output_name] = None
                    logger.warning(f"[WORKFLOW] Output {output_name} not found in response")
                    
        except Exception as e:
            logger.error(f"[WORKFLOW] Error mapping outputs: {e}")

    @classmethod
    async def get_workflow_status(cls, workflow_id: str, instance_id: str, user: Dict[str, Any]):
        """SIMPLE: Get workflow status from MongoDB"""
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
    async def submit_user_task_and_continue(
        cls,
        workflow_id: str,
        instance_id: str,
        task_id: str,
        task_data: Dict[str, Any],
        user: Dict[str, Any],
    ):
        """Submit user task and continue workflow - DEBUGGING TASK DATA"""
        tenant_id = await cls.validate_tenant_access(user)
        logger.info(f"[WORKFLOW] Submitting task {task_id} for instance {instance_id} with data: {task_data}")
        
        try:
            # Get workflow from MongoDB
            instance = await cls.get_workflow_instance(workflow_id, instance_id, tenant_id)
            serializer = BpmnWorkflowSerializer()
            workflow = serializer.deserialize_json(json.dumps(instance["serialized_data"]))
            
            # Find current task and complete it
            ready_tasks = [t for t in workflow.get_tasks() if t.state == TaskState.READY]
            if not ready_tasks:
                raise HTTPException(status_code=400, detail="No ready tasks found")
                
            current_task = ready_tasks[0]
            if current_task.task_spec.bpmn_id != task_id:
                raise HTTPException(status_code=400, detail=f"Expected task {task_id}, got {current_task.task_spec.bpmn_id}")
            
            # Update task data - THIS IS THE CRITICAL POINT
            try:
                current_task.data.update(task_data)
                workflow.data.update(task_data)  # Also update workflow global data
                
                # Form data is now stored in serialized workflow data, no separate storage needed
                
                # Complete the task
                current_task.complete()
                logger.info(f"[WORKFLOW] Task {task_id} completed successfully")
                
            except Exception as task_error:
                logger.error(f"[WORKFLOW] Error completing task {task_id}: {task_error}")
                current_task.data["error"] = str(task_error)
                current_task.error()
                # Update MongoDB with error state
                await cls.update_workflow_instance(workflow, instance_id, tenant_id)
                raise HTTPException(status_code=500, detail=f"Task completion failed: {str(task_error)}")
            
            # Serialize and check what gets serialized
            test_serializer = BpmnWorkflowSerializer()
            test_json = test_serializer.serialize_json(workflow)
            test_data = json.loads(test_json)
            
            # Find our completed task in serialized data
            for task_uuid, serialized_task in test_data.get('tasks', {}).items():
                if serialized_task.get('task_spec') == task_id:
                    logger.debug(f"[WORKFLOW] SERIALIZED TASK {task_id} data: {serialized_task.get('data', {})}")
                    break
            
            # Update MongoDB immediately after completing task
            await cls.update_workflow_instance(workflow, instance_id, tenant_id)
            
            # Continue workflow execution
            bpmn_xml = await cls.get_bpmn_xml(workflow_id, user)
            bpmn_map = await cls.parse_bpmn(bpmn_xml)
            result = await cls.execute_workflow_steps(workflow, workflow_id, user, instance_id, bpmn_map)
            
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
        """SIMPLE: Create and start new workflow, save to MongoDB"""
        tenant_id = await cls.validate_tenant_access(user)
        logger.info(f"[WORKFLOW] Starting new workflow {workflow_id}")
        
        try:
            # Get BPMN XML
            bpmn_xml = await cls.get_bpmn_xml(workflow_id, user)
            bpmn_map = await cls.parse_bpmn(bpmn_xml)
            
            # Create workflow with enhanced parser
            script_engine = PythonScriptEngine()
            
            # Create enhanced parser that preserves all extension elements
            parser = BpmnParser()
            
            # Register our enhanced task parser for all task types
            from spiffworkflow.bpmn.parser.util import full_tag
            from spiffworkflow.bpmn.specs.defaults import (
                UserTask, ManualTask, ServiceTask, ScriptTask, NoneTask
            )
            
            # Override the default parsers with our enhanced ones
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
            result = await cls.execute_workflow_steps(workflow, workflow_id, user, bpmn_map=bpmn_map)
            
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
    async def get_bpmn_xml(
        cls,
        workflow_id: str,
        user: Dict[str, Any],
    ):
        logger.info(f"[WORKFLOW] Starting workflow retrieval for for ID: {workflow_id}")

        if not user:
            logger.error(
                "[WORKFLOW] User information is required for workflow execution"
            )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User information is required",
            )

        # Validate tenant access
        tenant_id = await cls.validate_tenant_access(user)
        user_id = user.get("id")

        try:
            # Import file service
            from backend.src.services.file_service import FileService

            # Get workflow config from MongoDB using storage service
            logger.debug(
                f"[WORKFLOW] Fetching workflow config for ID: {workflow_id}, tenant: {tenant_id}"
            )
            config = await MongoStorageService.find_one(
                "workflowConfig", {"_id": ObjectId(workflow_id)}, tenant_id=tenant_id
            )

            if not config:
                logger.warning(
                    f"[WORKFLOW] Workflow config not found: id='{workflow_id}', tenant='{tenant_id}'"
                )
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Workflow configuration not found for ID: {workflow_id}",
                )

            # Check both possible field names for the file path
            file_path = config.get("file_path") or config.get("bpmn_file_path")
            if not file_path:
                logger.error(f"[WORKFLOW] No file path found in config: {config}")
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="BPMN file path not found in workflow configuration",
                )

            # Get BPMN XML from Minio
            logger.debug(f"[WORKFLOW] Loading BPMN file from path: {file_path}")
            bpmn_content = await FileService.get_file_content_from_path(file_path)
            bpmn_xml = bpmn_content.decode("utf-8")

            return bpmn_xml
        
        except Exception as e:
            logger.error(f"[WORKFLOW] Failed retrieve workflow {workflow_id}: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to retrieve workflow: {str(e)}",
            )


async def async_main():
    """Async main execution - Load BPMN, resume if state exists, update task.data, save state"""
    from backend.src.db import init_database
    try:
        await init_database()

        arg = "68c895f3620a7a8f3ff26058"

        if arg and len(arg) == 24:
            user = {
                "id": "tCde9FYTsP3PoRhzME00tQ",
                "role": "user",
                "tenantId": "e3016c53-4a91-485a-bda9-417be6e13c62",
                "email": "tj7apple@gmail.com",
                "exp": 1758142124,
            }
            await WorkflowServicePersistent.run_workflow_from_id(arg, user=user)
        else:
            bpmn_file = arg or "process.bpmn"

            if not os.path.exists(bpmn_file):
                logger.error(f"[WORKFLOW] BPMN file not found: {bpmn_file}")
                return

            with open(bpmn_file, "r") as f:
                bpmn_xml = f.read()

            await WorkflowServicePersistent.run_workflow(
                bpmn_xml, "test_workflow", "default"
            )
    except Exception as e:
        logger.error(f"[WORKFLOW] async_main failed: {e}", exc_info=True)


def main():
    """Main execution wrapper"""
    import asyncio
    try:
        asyncio.run(async_main())
    except Exception as e:
        logger.error(f"[WORKFLOW] Main execution failed: {e}")


if __name__ == "__main__":
    main()
