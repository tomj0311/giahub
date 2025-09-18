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
from spiffworkflow.serializer.json import JSONSerializer
from lxml import etree
from bson import ObjectId

from ..utils.log import logger
from ..utils.mongo_storage import MongoStorageService

# Module loaded log
logger.debug("[WORKFLOW] Persistent service module loaded")

class WorkflowServicePersistent:
    """Service for handling BPMN workflow execution and management with state persistence"""

    @staticmethod
    async def save_workflow_state(workflow, workflow_id, tenant_id=None, form_map=None):
        """Serialize and save workflow state to MongoDB"""
        instance_id = uuid.uuid4().hex[:6]
        
        serializer = BpmnWorkflowSerializer()
        serialized_json = serializer.serialize_json(workflow)
        
        # Get current user tasks and their form fields
        user_tasks = []
        if form_map:
            # Get ready tasks and filter for UserTasks and ManualTasks
            ready_tasks = [t for t in workflow.get_tasks() if t.state == TaskState.READY]
            for task in ready_tasks:
                if task.task_spec.__class__.__name__ in ["UserTask", "ManualTask"]:
                    task_details = {
                        "task_id": str(task.id),
                        "task_name": task.task_spec.name,
                        "bpmn_id": getattr(task.task_spec, "bpmn_id", None),
                        "form_fields": WorkflowServicePersistent.handle_user_task(task, form_map)
                    }
                    user_tasks.append(task_details)
        
        data = {
            "workflow_id": workflow_id,
            "instance_id": instance_id,
            "serialized_data": json.loads(serialized_json),
            "user_task": user_tasks,
            "created_at": datetime.now(UTC)
        }
        
        await MongoStorageService.insert_one("workflowInstances", data, tenant_id)
        print(f"Workflow state saved to MongoDB - instance: {instance_id}")
        return instance_id

    @staticmethod
    async def update_workflow_instance(workflow, instance_id, tenant_id=None, form_map=None):
        """Update existing workflow instance in MongoDB"""
        serializer = BpmnWorkflowSerializer()
        serialized_json = serializer.serialize_json(workflow)
        
        # Get current user tasks and their form fields
        user_tasks = []
        if form_map:
            # Get ready tasks and filter for UserTasks and ManualTasks
            ready_tasks = [t for t in workflow.get_tasks() if t.state == TaskState.READY]
            for task in ready_tasks:
                if task.task_spec.__class__.__name__ in ["UserTask", "ManualTask"]:
                    task_details = {
                        "task_id": str(task.id),
                        "task_name": task.task_spec.name,
                        "bpmn_id": getattr(task.task_spec, "bpmn_id", None),
                        "form_fields": WorkflowServicePersistent.handle_user_task(task, form_map)
                    }
                    user_tasks.append(task_details)
        
        update_data = {
            "serialized_data": json.loads(serialized_json),
            "user_task": user_tasks,
            "updated_at": datetime.now(UTC)
        }
        
        await MongoStorageService.update_one(
            "workflowInstances", 
            {"instance_id": instance_id}, 
            update_data, 
            tenant_id
        )
        print(f"Workflow instance updated in MongoDB - instance: {instance_id}")

    @staticmethod
    async def load_workflow_state(workflow_id, tenant_id=None):
        """Load workflow state from MongoDB"""
        # Find the latest instance for this workflow
        result = await MongoStorageService.find_one(
            "workflowInstances", 
            {"workflow_id": workflow_id},
            tenant_id=tenant_id
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
                    "created_at": doc.get("created_at").isoformat() if doc.get("created_at") else None,
                }
                workflows.append(workflow)
                
            logger.debug(f"[WORKFLOW] Found {len(workflows)} incomplete workflows")
            return workflows
            
        except Exception as e:
            logger.error(f"[WORKFLOW] Failed to list incomplete workflows: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to list incomplete workflows: {str(e)}"
            )

    @staticmethod
    async def save_workflow_to_mongo(workflow_id: str, workflow, tenant_id: Optional[str] = None):
        """Save workflow to MongoDB workflow_instances collection"""
        instance_id = uuid.uuid4().hex[:6]
        
        serializer = BpmnWorkflowSerializer()
        serialized_json = serializer.serialize_json(workflow)
        
        data = {
            "workflow_id": workflow_id,
            "instance_id": instance_id,
            "serialized_data": json.loads(serialized_json),
            "created_at": datetime.utcnow()
        }
        
        await MongoStorageService.insert_one("workflow_instances", data, tenant_id)
        return instance_id

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
    async def get_workflow_instance(workflow_id: str, instance_id: str, tenant_id: Optional[str] = None):
        """Get specific workflow instance by instance_id"""
        logger.debug(f"[WORKFLOW] Getting instance {instance_id} for workflow {workflow_id}")
        try:
            query = {"workflow_id": workflow_id, "instance_id": instance_id}
            instance = await MongoStorageService.find_one("workflowInstances", query, tenant_id=tenant_id)
            
            if not instance:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Workflow instance {instance_id} not found"
                )
            
            # Convert ObjectId to string for JSON serialization
            if "_id" in instance:
                instance["_id"] = str(instance["_id"])
            
            # Convert datetime objects to ISO strings for JSON serialization
            if "created_at" in instance:
                if hasattr(instance["created_at"], "isoformat"):
                    instance["created_at"] = instance["created_at"].isoformat()
                elif isinstance(instance["created_at"], dict) and "$date" in instance["created_at"]:
                    # Handle MongoDB $date format
                    instance["created_at"] = instance["created_at"]["$date"]
                    
            if "updated_at" in instance:
                if hasattr(instance["updated_at"], "isoformat"):
                    instance["updated_at"] = instance["updated_at"].isoformat()
                elif isinstance(instance["updated_at"], dict) and "$date" in instance["updated_at"]:
                    # Handle MongoDB $date format
                    instance["updated_at"] = instance["updated_at"]["$date"]
            
            return instance
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"[WORKFLOW] Failed to get workflow instance: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to get workflow instance: {str(e)}"
            )

    @staticmethod
    async def submit_user_task_and_continue(workflow_id: str, instance_id: str, form_data: Dict[str, Any], tenant_id: Optional[str] = None):
        """Submit user task data and continue workflow execution"""
        logger.info(f"[WORKFLOW] Submitting task data for instance {instance_id}")
        try:
            # Get the workflow instance
            instance = await WorkflowServicePersistent.get_workflow_instance(workflow_id, instance_id, tenant_id)
            
            # Deserialize the workflow
            serializer = BpmnWorkflowSerializer()
            serialized_json = json.dumps(instance["serialized_data"])
            workflow = serializer.deserialize_json(serialized_json)
            
            # Update task data with submitted form data
            workflow.data.update(form_data)
            
            # Find ready user tasks and complete them
            ready_tasks = [t for t in workflow.get_tasks() if t.state == TaskState.READY and hasattr(t.task_spec, 'manual') and t.task_spec.manual]
            
            for task in ready_tasks:
                task.data.update(form_data)
                logger.info(f"[WORKFLOW] Completing task: {task.task_spec.name}")
                task.complete()
            
            # Continue workflow execution
            workflow.do_engine_steps()
            
            # Update existing workflow instance
            instance = await WorkflowServicePersistent.get_workflow_instance(workflow_id, instance_id, tenant_id)
            form_map = await WorkflowServicePersistent.parse_form_data_from_bpmn("")  # Simple empty form map
            await WorkflowServicePersistent.update_workflow_instance(workflow, instance_id, tenant_id, form_map)
            
            # Check if more manual input is required
            manual_required = workflow.manual_input_required()
            completed = workflow.is_completed()
            
            result = {
                "message": "Task completed successfully",
                "workflow_completed": completed,
                "manual_input_required": manual_required,
                "instance_id": instance_id
            }
            
            if completed:
                result["final_data"] = workflow.data
                logger.info(f"[WORKFLOW] Workflow {instance_id} completed successfully")
            elif manual_required:
                logger.info(f"[WORKFLOW] Workflow {instance_id} requires more manual input")
            
            return result
            
        except Exception as e:
            logger.error(f"[WORKFLOW] Failed to submit task data: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to submit task data: {str(e)}"
            )

    @staticmethod
    async def validate_tenant_access(user: dict) -> str:
        """Validate tenant access and return tenant_id"""
        tenant_id = user.get("tenantId")
        if not tenant_id:
            logger.warning(f"[WORKFLOW] Missing tenant information for user: {user.get('id')}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User tenant information missing. Please re-login."
            )
        return tenant_id

    @staticmethod
    async def parse_form_data_from_bpmn(bpmn_xml: str) -> Dict[str, List[Dict[str, str]]]:
        """Extract simple formData/formField definitions by BPMN node id.

        - Supports tags named 'formData'/'formField' regardless of namespace.
        - Returns mapping: node_id -> list of {id,label,type} dicts.
        """
        try:
            root = etree.fromstring(bpmn_xml.encode("utf-8"))
        except Exception:
            return {}

        def findall_any_ns(node, local):
            return node.xpath(f'.//*[local-name()="{local}"]')

        forms: Dict[str, List[Dict[str, str]]] = {}

        # Look for any task (userTask/manualTask) with nested formData
        task_nodes = root.xpath('//*[local-name()="userTask" or local-name()="manualTask"]')
        for t in task_nodes:
            node_id = t.get("id")
            if not node_id:
                continue
            fields: List[Dict[str, str]] = []
            for fd in findall_any_ns(t, "formData"):
                for ff in findall_any_ns(fd, "formField"):
                    fields.append(
                        {
                            "id": ff.get("id") or "",
                            "label": ff.get("label") or (ff.get("id") or ""),
                            "type": ff.get("type") or "string",
                        }
                    )
            if fields:
                forms[node_id] = fields
        return forms

    @classmethod
    async def run_workflow(cls, bpmn_xml: str, workflow_id: str, tenant_id=None):
        """Execute a BPMN workflow from XML content with state persistence"""
        # Use default Python script engine (builtins are available to exec)
        script_engine = PythonScriptEngine()
        parser = BpmnParser()

        form_map = await cls.parse_form_data_from_bpmn(bpmn_xml)
        clean_bpmn = bpmn_xml.replace('<?xml version="1.0" encoding="UTF-8"?>', "").strip()
        parser.add_bpmn_str(clean_bpmn)

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
        print("Started new workflow.")

        # Process tasks step-by-step without blocking
        while not workflow.is_completed():
            # Run automatic steps (e.g., ScriptTask)
            workflow.do_engine_steps()
            await cls.save_workflow_state(workflow, workflow_id, tenant_id, form_map)
            
            # If manual input is required, stop and save state
            if workflow.manual_input_required():
                print("Workflow paused - manual input required")
                break

        print("\nWorkflow status:")
        if workflow.is_completed():
            print("Workflow completed successfully!")
            print(f"Final data: {workflow.data}")
        else:
            print("Workflow not completed yet. Rerun to continue.")

    @classmethod
    async def run_workflow_from_id(cls, workflow_id: str, initial_data: Optional[Dict[str, Any]] = None, user: Optional[Dict[str, Any]] = None):
        """
        Execute a BPMN workflow by fetching from database using workflow_id with state persistence
        """
        logger.info(f"[WORKFLOW] Starting workflow execution for ID: {workflow_id}")
        
        if not user:
            logger.error("[WORKFLOW] User information is required for workflow execution")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User information is required"
            )
        
        # Validate tenant access
        tenant_id = await cls.validate_tenant_access(user)
        user_id = user.get("id")
        
        try:
            # Import file service
            from backend.src.services.file_service import FileService
            
            # Get workflow config from MongoDB using storage service
            logger.debug(f"[WORKFLOW] Fetching workflow config for ID: {workflow_id}, tenant: {tenant_id}")
            config = await MongoStorageService.find_one(
                "workflowConfig", 
                {"_id": ObjectId(workflow_id)},
                tenant_id=tenant_id
            )
            
            if not config:
                logger.warning(f"[WORKFLOW] Workflow config not found: id='{workflow_id}', tenant='{tenant_id}'")
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Workflow configuration not found for ID: {workflow_id}"
                )
            
            # Check both possible field names for the file path
            file_path = config.get("file_path") or config.get("bpmn_file_path")
            if not file_path:
                logger.error(f"[WORKFLOW] No file path found in config: {config}")
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="BPMN file path not found in workflow configuration"
                )

            # Get BPMN XML from Minio
            logger.debug(f"[WORKFLOW] Loading BPMN file from path: {file_path}")
            bpmn_content = await FileService.get_file_content_from_path(file_path)
            bpmn_xml = bpmn_content.decode("utf-8")

            # Execute the workflow with state persistence using workflow_id
            logger.info(f"[WORKFLOW] Executing workflow for tenant: {tenant_id}, user: {user_id}")
            await cls.run_workflow(bpmn_xml, workflow_id, tenant_id)
            logger.info(f"[WORKFLOW] Workflow execution completed successfully for ID: {workflow_id}")
            
            return {
                "message": "Workflow started successfully",
                "workflow_id": workflow_id,
                "tenant_id": tenant_id
            }
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"[WORKFLOW] Failed to execute workflow {workflow_id}: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to execute workflow: {str(e)}"
            )


def run_workflow_from_workflow_id(workflow_id: str, user: Optional[Dict[str, Any]] = None):
    """Legacy function - use WorkflowServicePersistent.run_workflow_from_id instead"""
    import asyncio
    if not user:
        logger.warning("[WORKFLOW] Legacy function called without user information")
        # For backward compatibility, create a minimal user object
        user = {"tenantId": "default", "id": "system"}
    return asyncio.run(WorkflowServicePersistent.run_workflow_from_id(workflow_id, user=user))


async def async_main():
    """Async main execution - Load BPMN, resume if state exists, update task.data, save state"""
    from backend.src.db import init_database

    # Initialize DB connection before anything else
    await init_database()
    
    # Accept workflow_id or BPMN file path as first CLI argument
    arg = "68c895f3620a7a8f3ff26058"
    
    if arg and len(arg) == 24:  # MongoDB ObjectId is 24 chars
        # Assume it's a workflow_id
        # Use following information for user
        user = {
            "id": "tCde9FYTsP3PoRhzME00tQ",
            "role": "user", 
            "tenantId": "e3016c53-4a91-485a-bda9-417be6e13c62",
            "email": "tj7apple@gmail.com",
            "exp": 1758142124
        }
        await WorkflowServicePersistent.run_workflow_from_id(arg, user=user)
    else:
        # Assume it's a BPMN file path
        bpmn_file = arg or 'process.bpmn'  # Default to 'process.bpmn'
        
        if not os.path.exists(bpmn_file):
            print(f"BPMN file not found: {bpmn_file}")
            return
            
        with open(bpmn_file, 'r') as f:
            bpmn_xml = f.read()
            
        await WorkflowServicePersistent.run_workflow(bpmn_xml, "test_workflow", "default")


def main():
    """Main execution wrapper"""
    import asyncio
    asyncio.run(async_main())


if __name__ == "__main__":
    main()