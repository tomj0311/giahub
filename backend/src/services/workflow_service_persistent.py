"""
Workflow Service with State Persistence

This service handles BPMN workflow execution and management with state persistence.
Follows the exact pattern for SpiffWorkflow state management.
"""

import sys
import json
import os
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

# Module loaded log
logger.debug("[WORKFLOW] Persistent service module loaded")


def call_external_api(task):
    """
    Function to call an external API using requestData from the BPMN process.
    Designed as a SpiffWorkflow service task delegate.
    """
    import json
    import requests
    
    try:
        request_data = task.data.get("requestData")
        if not request_data:
            # If no requestData, just set a success response
            task.data["responseData"] = {"status": "success", "message": "Service task completed"}
            logger.info(f"[WORKFLOW] Service task completed without requestData for task: {task.task_spec.name}")
            return

        if isinstance(request_data, str):
            request_data = json.loads(request_data)

        logger.info(f"[WORKFLOW] Processing request data: {request_data}")
        
        # Set the response data (you can modify this to make actual API calls)
        task.data["responseData"] = {
            "status": "success", 
            "processed_data": request_data,
            "message": "Data processed successfully"
        }
        
        logger.info(f"[WORKFLOW] Service task API call successful for task: {task.task_spec.name}")

    except Exception as e:
        error_msg = f"Service task API call failed: {str(e)}"
        task.data["responseData"] = {"error": error_msg}
        logger.error(f"[WORKFLOW] {error_msg}")


def register_service_task(script_engine):
    """
    Register the service task delegate with SpiffWorkflow's script engine.
    """
    script_engine.environment.globals["call_external_api"] = call_external_api
    logger.debug("[WORKFLOW] Service task delegate registered")


class WorkflowServicePersistent:
    """Service for handling BPMN workflow execution and management with state persistence"""

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
    async def save_workflow_to_mongo(
        workflow_id: str, workflow, tenant_id: Optional[str] = None
    ):
        """Save workflow to MongoDB workflow_instances collection"""
        try:
            instance_id = uuid.uuid4().hex[:6]

            serializer = BpmnWorkflowSerializer()
            serialized_json = serializer.serialize_json(workflow)

            data = {
                "workflow_id": workflow_id,
                "instance_id": instance_id,
                "serialized_data": json.loads(serialized_json),
                "created_at": datetime.utcnow(),
            }

            await MongoStorageService.insert_one("workflow_instances", data, tenant_id)
            logger.info(
                f"[WORKFLOW] Saved workflow to 'workflow_instances' - instance: {instance_id}"
            )
            return instance_id
        except Exception as e:
            logger.error(
                f"[WORKFLOW] Failed to save workflow '{workflow_id}' to MongoDB: {e}",
                exc_info=True,
            )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to save workflow to MongoDB: {str(e)}",
            )

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

    @staticmethod
    async def read_extensions(task_name, bpmn_map: Dict[str, object]):
        from lxml import etree
        nsmap = {'bpmn': 'http://www.omg.org/spec/BPMN/20100524/MODEL', 'spiffworkflow': 'http://spiffworkflow.org/bpmn/schema/1.0/core'}
        # Search all loaded BPMN documents for a matching serviceTask
        for _, root in bpmn_map.items():
            task = root.xpath(f'//bpmn:serviceTask[@id="{task_name}" or @name="{task_name}"]', namespaces=nsmap)
            if task:
                ext_elements = task[0].xpath('.//bpmn:extensionElements', namespaces=nsmap)
                if ext_elements:
                    return etree.tostring(ext_elements[0], pretty_print=True, encoding='unicode')
        return None

    @classmethod
    async def execute_workflow_steps(cls, workflow, workflow_id, tenant_id, form_data, instance_id=None, bpmn_map=None):
        """Simple function to run workflow steps with state saving"""
        try:
            while not workflow.is_completed():
                # Find ready user tasks and complete them
                ready_tasks = [
                    t
                    for t in workflow.get_tasks()
                    if t.state == TaskState.READY
                ]

                tasks = workflow.get_tasks()

                for task in ready_tasks:
                    logger.info(f"[WORKFLOW] Completing task: {task.task_spec.name}")

                    task_type = type(task.task_spec).__name__
                    logger.debug(f"[WORKFLOW] Task type: {task_type}")

                    if task_type in ["UserTask", "ManualTask"]:
                        # Update task data with provided form_data
                        if form_data:
                            task.data.update(form_data)
                            task.complete()
                        else:
                            await cls.read_extensions(task.spec.name, bpmn_map)
                            break
                    else:
                        task.complete()

                    if instance_id:
                        await cls.update_workflow_instance(workflow, instance_id, tenant_id)
                    else:
                        instance_id = await cls.save_workflow_state(workflow, workflow_id, tenant_id)

                    logger.info(f"[WORKFLOW] Task '{task.task_spec.name}' completed")

                if workflow.manual_input_required():
                    break

            return instance_id
        
        except Exception as e:
            logger.error(
                f"[WORKFLOW] Error executing workflow steps for '{workflow_id}': {e}",
                exc_info=True,
            )
            raise

    @classmethod
    async def submit_user_task_and_continue(
        cls,
        workflow_id: str,
        instance_id: str,
        form_data: Dict[str, Any],
        user: Dict[str, Any],
    ):
        """Submit user task data and continue workflow execution"""
        bpmn_xml = await cls.get_bpmn_xml(workflow_id, user)

        # Ensure tenant_id is available for subsequent calls
        tenant_id = await cls.validate_tenant_access(user)

        logger.info(f"[WORKFLOW] Submitting task data for instance {instance_id}")
        try:
            # Get the workflow instance
            instance = await WorkflowServicePersistent.get_workflow_instance(
                workflow_id, instance_id, tenant_id
            )

            # Deserialize the workflow
            serializer = BpmnWorkflowSerializer()
            serialized_json = json.dumps(instance["serialized_data"])
            workflow = serializer.deserialize_json(serialized_json)

            # Update task data with submitted form data
            workflow.data.update(form_data)

            # Continue workflow execution with proper state saving
            await WorkflowServicePersistent.execute_workflow_steps(workflow, workflow_id, tenant_id, form_data, instance_id)

            # Check if more manual input is required
            manual_required = workflow.manual_input_required()
            completed = workflow.is_completed()

            result = {
                "message": "Task completed successfully",
                "workflow_completed": completed,
                "manual_input_required": manual_required,
                "instance_id": instance_id,
            }

            if completed:
                result["final_data"] = workflow.data
                logger.info(f"[WORKFLOW] Workflow {instance_id} completed successfully")
            elif manual_required:
                logger.info(
                    f"[WORKFLOW] Workflow {instance_id} requires more manual input"
                )

            return result

        except Exception as e:
            logger.error(f"[WORKFLOW] Failed to submit task data: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to submit task data: {str(e)}",
            )

    @classmethod
    async def run_workflow(cls, workflow_id: str, initial_data: Dict[str, Any], user: Dict[str, Any]):
        """Execute a BPMN workflow from XML content with state persistence"""
        try:
            bpmn_xml = await cls.get_bpmn_xml(workflow_id, user)
            tenant_id = await cls.validate_tenant_access(user)
            # Use default Python script engine (builtins are available to exec)
            script_engine = PythonScriptEngine()
            
            # Register service task delegate
            register_service_task(script_engine)
            
            parser = BpmnParser()

            bpmn_map = await cls.parse_bpmn(bpmn_xml)
            
            clean_bpmn = bpmn_xml.replace(
                '<?xml version="1.0" encoding="UTF-8"?>', ""
            ).strip()
            
            # Try to parse BPMN with better error handling
            try:
                parser.add_bpmn_str(clean_bpmn)
            except Exception as parse_error:
                logger.error(f"[WORKFLOW] BPMN parsing failed: {parse_error}")
                # Try to continue with a simpler approach
                raise Exception(f"BPMN file has parsing issues: {str(parse_error)}")

            # Get the first process ID and create workflow spec
            process_ids = parser.get_process_ids()
            if not process_ids:
                raise Exception("No executable processes found in BPMN")

            process_id = process_ids[0]
            spec = parser.get_spec(process_id)
            subprocess_specs = parser.get_subprocess_specs(process_id, specs={})

            workflow = BpmnWorkflow(
                spec, subprocess_specs=subprocess_specs, script_engine=script_engine
            )
            logger.info("[WORKFLOW] Started new workflow execution")

            # Use common execution function
            await cls.execute_workflow_steps(workflow, workflow_id, tenant_id, initial_data, bpmn_map=bpmn_map)

            logger.info("[WORKFLOW] Workflow status:")
            if workflow.is_completed():
                logger.info("[WORKFLOW] Workflow completed successfully")
                logger.debug(f"[WORKFLOW] Final data: {workflow.data}")
            else:
                logger.info("[WORKFLOW] Workflow not completed yet. Rerun to continue.")
                
        except Exception as e:
            logger.error(f"[WORKFLOW] Workflow execution failed: {e}")
            raise

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
