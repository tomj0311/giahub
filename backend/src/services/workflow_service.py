"""
Workflow Service

This service handles BPMN workflow execution and management.
"""

import sys
import json
import os
from typing import Any, Dict, List, Optional
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
logger.debug("[WORKFLOW] Service module loaded")

class WorkflowService:
    """Service for handling BPMN workflow execution and management"""

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
    def parse_form_data_from_bpmn(bpmn_xml: str) -> Dict[str, List[Dict[str, str]]]:
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

    @staticmethod
    def handle_user_task(task, form_map: Dict[str, List[Dict[str, str]]] | None = None):
        """
        Handle UserTask by prompting for form fields and setting task data.
        """
        logger.info(f"Handling user task: {task.task_spec.name}")
        dct = {}
        # Prefer parsed formMap (from original BPMN XML)
        bpmn_id = getattr(task.task_spec, "bpmn_id", None)
        fields = []
        if form_map and bpmn_id and bpmn_id in form_map:
            fields = form_map[bpmn_id]

        if fields:
            for field in fields:
                label = field.get("label") or field.get("id")
                response = input(f"{label}: ")
                dct[field.get("id") or label] = response
        else:
            logger.warning("No form metadata found for user task")

        task.data.update(dct)

    @staticmethod
    def handle_manual_task(task, form_map: Dict[str, List[Dict[str, str]]] | None = None):
        """
        Handle ManualTask by prompting user to confirm completion.
        """
        logger.info(f"Handling manual task: {task.task_spec.name}")
        # If any form fields are defined, prompt for them first.
        bpmn_id = getattr(task.task_spec, "bpmn_id", None)
        if form_map and bpmn_id and bpmn_id in form_map:
            to_update = {}
            for field in form_map[bpmn_id]:
                label = field.get("label") or field.get("id")
                response = input(f"{label}: ")
                to_update[field.get("id") or label] = response
            task.data.update(to_update)

        confirm = input("Do you confirm this task is completed? (y/n): ")
        if confirm.lower() == "y":
            pass  # Proceed
        else:
            logger.error("Task not confirmed. Aborting.")
            sys.exit(1)

    @classmethod
    def run_workflow(cls, bpmn_xml: str):
        """Execute a BPMN workflow from XML content"""
        # Use default Python script engine (builtins are available to exec)
        script_engine = PythonScriptEngine()
        parser = BpmnParser()

        form_map = cls.parse_form_data_from_bpmn(bpmn_xml)
        clean_bpmn = bpmn_xml.replace('<?xml version="1.0" encoding="UTF-8"?>', "").strip()
        parser.add_bpmn_str(clean_bpmn)

        # Get the first process ID and create workflow spec
        process_ids = parser.get_process_ids()
        if not process_ids:
            raise Exception("No executable processes found in BPMN")

        process_id = process_ids[0]

        spec = parser.get_spec(process_id)
        subprocess_specs = parser.get_subprocess_specs(process_id, specs={})

        # Create BPMN workflow engine
        workflow = BpmnWorkflow(
            spec, subprocess_specs=subprocess_specs, script_engine=script_engine
        )

        # Kick the engine to run all non-manual tasks initially (start/script/gateways)
        workflow.do_engine_steps()

        # Main loop: handle ready tasks until workflow is completed
        while workflow.is_completed() is False:
            ready_tasks = [t for t in workflow.get_tasks() if t.state == TaskState.READY]

            if not ready_tasks:
                logger.debug("No ready tasks. Checking if waiting...")
                # Try to progress any auto tasks
                workflow.do_engine_steps()
                continue

            for task in ready_tasks:
                if task.task_spec.__class__.__name__ == "UserTask":
                    cls.handle_user_task(task, form_map)
                    task.complete()
                elif task.task_spec.__class__.__name__ == "ManualTask":
                    cls.handle_manual_task(task, form_map)
                    task.complete()
                else:
                    # For other tasks (script, gateways), let the engine handle them
                    pass

            # After handling human tasks, progress the engine
            workflow.do_engine_steps()

        logger.info("Workflow completed successfully!")


    @classmethod
    async def run_workflow_from_id(cls, workflow_id: str, initial_data: Optional[Dict[str, Any]] = None, user: Optional[Dict[str, Any]] = None):
        """
        Execute a BPMN workflow by fetching from database using workflow_id
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
            from .file_service import FileService
            
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

            # Execute the workflow
            logger.info(f"[WORKFLOW] Executing workflow for tenant: {tenant_id}, user: {user_id}")
            cls.run_workflow(bpmn_xml)
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
    """Legacy function - use WorkflowService.run_workflow_from_id instead"""
    import asyncio
    if not user:
        logger.warning("[WORKFLOW] Legacy function called without user information")
        # For backward compatibility, create a minimal user object
        user = {"tenantId": "default", "id": "system"}
    return asyncio.run(WorkflowService.run_workflow_from_id(workflow_id, user=user))


def main():
    """CLI entry point for running workflows"""
    # Accept workflow_id or BPMN file path as first CLI argument
    arg = "68c895f3620a7a8f3ff26058"
    
    if arg and len(arg) == 24:  # MongoDB ObjectId is 24 chars
        # Assume it's a workflow_id
        # Create a system user for CLI execution
        system_user = {"tenantId": "default", "id": "system"}
        run_workflow_from_workflow_id(arg, user=system_user)


if __name__ == "__main__":
    main()
