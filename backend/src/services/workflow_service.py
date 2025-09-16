"""
Workflow Service

This service handles BPMN workflow management using SpiffWorkflow.
Provides functionality for starting, running, and managing workflow instances.
"""

import uuid
import json
import os
import sys
import uuid
from datetime import datetime
from typing import Dict, Any, Optional, List
from fastapi import HTTPException, UploadFile, status
from bson import ObjectId
from io import BytesIO
# Add project root to Python path to find spiffworkflow
project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
sys.path.append(project_root)  # Add the project root directory to path
from spiffworkflow.bpmn.parser import BpmnParser
from spiffworkflow.bpmn.workflow import BpmnWorkflow
from spiffworkflow.bpmn.serializer import BpmnWorkflowSerializer
from spiffworkflow.task import TaskState
from spiffworkflow.bpmn.specs.mixins.user_task import UserTask as BpmnUserTask
from spiffworkflow.bpmn.specs.mixins.manual_task import ManualTask
from lxml import etree
from backend.src.utils.log import logger
from backend.src.utils.mongo_storage import MongoStorageService
from backend.src.services.file_service import FileService

# Module loaded log
logger.debug("[WORKFLOW] Service module loaded")


class WorkflowService:
    """Service for handling BPMN workflow operations"""
    
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
    
    @classmethod
    async def start_workflow_by_config_id_for_user(cls, config_id: str, initial_data: Dict[str, Any] = None, user: dict = None) -> str:
        """Start a new workflow instance using configuration ID - follows working service pattern"""
        tenant_id = await cls.validate_tenant_access(user)
        try:
            # Get workflow config from MongoDB using EXACT pattern from workflow_config_service
            try:
                object_id = ObjectId(config_id)
            except Exception:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid configuration ID"
                )
            
            config = await MongoStorageService.find_one("workflowConfig", {"_id": object_id}, tenant_id=tenant_id)
            
            if not config:
                logger.warning(f"[WORKFLOW] Workflow config not found: {config_id}")
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Workflow config '{config_id}' not found"
                )
            
            # Create workflow service instance to handle the workflow operations
            service = cls()
            workflow_name = config.get('name')
            bpmn_file_path = config.get('bpmn_file_path')
            
            if not bpmn_file_path:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"No BPMN file path in config '{config_id}'"
                )
            
            # Get BPMN content from MinIO and load spec
            from backend.src.services.file_service import FileService
            bpmn_content = await FileService.get_file_content_from_path(bpmn_file_path)
            if not bpmn_content:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"BPMN file not found at '{bpmn_file_path}'"
                )
            
            # Parse and store the workflow spec
            actual_workflow_name = service._parse_and_store_bpmn(bpmn_content, workflow_name)
            
            # Start the workflow
            instance_id = service.start_workflow(actual_workflow_name, initial_data)
            
            # Save instance to MongoDB
            await service._save_workflow_instance(instance_id, config_id, actual_workflow_name, initial_data, tenant_id)
            
            return instance_id
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"[WORKFLOW] Error starting workflow by config ID {config_id}: {e}")
            raise HTTPException(status_code=500, detail=str(e))
    
    def __init__(self):
        self.parser = BpmnParser()  # Use BPMN parser
        self.serializer = BpmnWorkflowSerializer()
        self.specs: Dict[str, Any] = {}
        self.active_workflows: Dict[str, BpmnWorkflow] = {}  # Store active workflow instances
        self.bpmn_xml_data: Dict[str, Any] = {}  # Store original BPMN XML for form parsing
        self._initialized = False
        
        # Don't load specs during init - do it lazily when needed
        logger.info("[WORKFLOW] Initializing BPMN workflow service")
        logger.info(f"[WORKFLOW] Currently have {len(self.specs)} workflow specs loaded")
    
    async def _ensure_initialized(self, tenant_id: str = None):
        """Ensure the service is initialized lazily when needed"""
        if not self._initialized:
            try:
                # Load workflow instances from database
                loaded_count = await self.load_workflow_instances_from_db(tenant_id)
                logger.info(f"[WORKFLOW] Service initialized with {loaded_count} workflow instances")
                self._initialized = True
            except Exception as e:
                logger.error(f"[WORKFLOW] Error during initialization: {e}")
                # Don't fail the entire service if database loading fails
                self._initialized = True

    async def initialize(self, tenant_id: str = None):
        """Initialize the service and load workflow instances from database"""
        await self._ensure_initialized(tenant_id)
    

    
    def _parse_and_store_bpmn(self, bpmn_content: bytes, workflow_name: str) -> str:
        """Parse BPMN content and store workflow spec"""
        try:
            xml_element = etree.fromstring(bpmn_content)
            
            # Find all processes
            processes = xml_element.xpath('//bpmn:process | //process', 
                                       namespaces={'bpmn': 'http://www.omg.org/spec/BPMN/20100524/MODEL'})
            
            # Parse with BPMN parser
            parser = BpmnParser()
            parser.add_bpmn_xml(xml_element, filename=f"{workflow_name}.bpmn")
            process_ids = parser.get_process_ids()
            
            if not process_ids:
                # Make processes executable and re-parse
                for proc in processes:
                    if proc.get('isExecutable') != 'true':
                        proc.set('isExecutable', 'true')
                parser = BpmnParser()
                parser.add_bpmn_xml(xml_element, filename=f"{workflow_name}.bpmn")
                process_ids = parser.get_process_ids()
                
                if not process_ids:
                    raise ValueError("No executable processes found in BPMN file")
            
            logger.info(f"[WORKFLOW] Found process IDs: {process_ids}")
            
            # Use provided workflow name if it matches a process ID, otherwise use first process
            actual_workflow_name = workflow_name if workflow_name in process_ids else process_ids[0]
            
            # Get and store spec
            spec = parser.get_spec(actual_workflow_name)
            self.specs[actual_workflow_name] = spec
            self.bpmn_xml_data[actual_workflow_name] = xml_element
            
            logger.info(f"[WORKFLOW] Loaded workflow: {actual_workflow_name}")
            return actual_workflow_name
            
        except Exception as e:
            logger.error(f"[WORKFLOW] Error parsing BPMN content: {e}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid BPMN file: {str(e)}"
            )
    
    def _xpath_with_fallback(self, element, xpath_pattern: str) -> List:
        """Helper to try XPath with and without namespace"""
        namespaced = element.xpath(xpath_pattern.replace('//', '//bpmn:'), 
                                 namespaces={'bpmn': 'http://www.omg.org/spec/BPMN/20100524/MODEL'})
        return namespaced or element.xpath(xpath_pattern)
    
    def _parse_bpmn_form_fields(self, task, workflow_name: str) -> List[Dict[str, Any]]:
        """Parse form fields from BPMN extensionElements"""
        form_fields = []
        xml_element = self.bpmn_xml_data.get(workflow_name)
        if xml_element is None:
            logger.warning(f"[WORKFLOW] No XML data found for workflow: {workflow_name}")
            return form_fields
        
        task_id = task.task_spec.bpmn_id
        logger.info(f"[WORKFLOW] Looking for form fields in task: {task_id}")
        
        user_tasks = self._xpath_with_fallback(xml_element, f'//userTask[@id="{task_id}"]')
        
        for user_task in user_tasks:
            ext_elements = self._xpath_with_fallback(user_task, './/extensionElements')
            for ext_elem in ext_elements:
                form_data_elements = self._xpath_with_fallback(ext_elem, './/formData')
                for form_data in form_data_elements:
                    form_field_elements = self._xpath_with_fallback(form_data, './/formField')
                    for form_field in form_field_elements:
                        field_info = {
                            'id': form_field.get('id', ''),
                            'type': form_field.get('type', 'string'),
                            'label': form_field.get('label', ''),
                            'required': form_field.get('required', 'false').lower() == 'true'
                        }
                        form_fields.append(field_info)
                        logger.info(f"[WORKFLOW] Found BPMN form field: {field_info}")
        
        return form_fields

    def _validate_and_convert_input(self, value: str, field_type: str, field_id: str) -> Any:
        """Validate and convert input value based on field type"""
        if not value:
            return None
        
        converters = {
            'long': lambda v: int(v),
            'integer': lambda v: int(v),
            'double': lambda v: float(v),
            'float': lambda v: float(v),
            'boolean': lambda v: v.lower() in ['true', 'yes', 'y']
        }
        
        if field_type in converters:
            try:
                if field_type == 'boolean' and value.lower() not in ['true', 'false', 'yes', 'no', 'y', 'n']:
                    raise ValueError("Please enter true/false, yes/no, or y/n.")
                return converters[field_type](value)
            except ValueError as e:
                error_msg = str(e) if 'boolean' in str(e) else f"Please enter a valid {'integer' if field_type in ['long', 'integer'] else 'number'}."
                raise ValueError(error_msg)
        
        return value  # string type (default)

    def _prompt_user_for_form_data(self, task_name: str, task, workflow_name: str, task_data: Dict[str, Any] = None) -> Dict[str, Any]:
        """Prompt user via console to fill form data for a user task"""
        print(f"\n📝 USER TASK: {task_name}")
        print("=" * 50)
        
        if task_data:
            print(f"Current task data: {task_data}")
        
        bpmn_fields = self._parse_bpmn_form_fields(task, workflow_name)
        
        if bpmn_fields:
            print(f"Found {len(bpmn_fields)} form fields from BPMN")
            form_data = {}
            print("Please fill out the following form:")
            print("-" * 50)
            
            for field in bpmn_fields:
                field_id, field_type, field_required = field['id'], field['type'], field['required']
                field_label = field['label'] or field_id.replace('_', ' ').title()
                required_marker = " (required)" if field_required else " (optional)"
                prompt = f"{field_label}{required_marker}: "
                
                while True:
                    try:
                        value = input(prompt).strip()
                        
                        if field_required and not value:
                            print("This field is required. Please enter a value.")
                            continue
                        
                        if not value:  # Skip optional empty fields
                            break
                        
                        form_data[field_id] = self._validate_and_convert_input(value, field_type, field_id)
                        break
                        
                    except ValueError as e:
                        print(str(e))
                        continue
                    except (KeyboardInterrupt, EOFError):
                        print("\n⚠️ Form input cancelled by user")
                        return form_data
            
            print(f"\n✅ Form completed with data: {form_data}")
            return form_data
        
        else:
            # Fallback for tasks without forms
            print("⚠️ No form fields found. Using fallback input method.")
            form_data = {}
            print("Enter form data (format: key=value, press Enter to finish):")
            while True:
                try:
                    user_input = input("Field: ").strip()
                    if not user_input:
                        break
                    if '=' in user_input:
                        key, value = user_input.split('=', 1)
                        form_data[key.strip()] = value.strip()
                    else:
                        print("Invalid format. Please use: key=value")
                except (KeyboardInterrupt, EOFError):
                    break
            return form_data
    
    def _prompt_user_for_manual_task(self, task_name: str, task_data: Dict[str, Any] = None) -> bool:
        """Prompt user via console to complete a manual task"""
        print(f"\n✋ MANUAL TASK: {task_name}")
        print("=" * 50)
        
        if task_data:
            print(f"Task context: {task_data}")
        
        print("This task requires manual completion.")
        print("Please perform the required action and confirm completion.")
        
        while True:
            try:
                response = input("\nMark task as complete? (y/n): ").strip().lower()
                if response in ['y', 'yes']:
                    print("✅ Manual task marked as completed")
                    return True
                elif response in ['n', 'no']:
                    print("❌ Task not completed")
                    return False
                else:
                    print("Please enter 'y' for yes or 'n' for no")
            except (KeyboardInterrupt, EOFError):
                print("\n⚠️ Manual task cancelled by user")
                return False
    
    
    def _run_engine_steps_safely(self, wf: BpmnWorkflow, context: str):
        """Safely run engine steps with consistent error handling"""
        try:
            wf.do_engine_steps()
            logger.info(f"[WORKFLOW] {context}")
        except Exception as e:
            logger.warning(f"[WORKFLOW] Engine steps failed for {context}: {e}")
    
    def start_workflow(self, workflow_name: str, initial_data: Dict[str, Any] = None) -> str:
        """Start a new workflow instance"""
        spec = self.specs.get(workflow_name)
        if not spec:
            raise HTTPException(status_code=404, detail=f"Workflow '{workflow_name}' not found")
        
        wf = BpmnWorkflow(spec)
        if initial_data:
            wf.data.update(initial_data)
        
        instance_id = str(uuid.uuid4())
        self.active_workflows[instance_id] = wf
        
        # Run initial engine steps to get to the first user task
        self._run_engine_steps_safely(wf, f"Ran initial engine steps for workflow {workflow_name}")
        
        logger.info(f"[WORKFLOW] Started workflow {workflow_name} with ID {instance_id}")
        return instance_id
    
    def get_ready_user_tasks(self, instance_id: str) -> List[Dict[str, Any]]:
        """Get all ready user tasks for a workflow instance"""
        wf = self.active_workflows.get(instance_id)
        if not wf:
            raise HTTPException(status_code=404, detail=f"Workflow instance '{instance_id}' not found")
        
        ready_tasks = [
            {
                'task_id': task.id,
                'task_name': task.task_spec.name,
                'task_spec_name': task.task_spec.bpmn_id,
                'task_type': type(task.task_spec).__name__,
                'is_user_task': isinstance(task.task_spec, BpmnUserTask),
                'is_manual_task': isinstance(task.task_spec, ManualTask),
                'data': dict(task.data)
            }
            for task in wf.get_tasks(state=TaskState.READY)
            if hasattr(task.task_spec, 'manual') and task.task_spec.manual
        ]
        
        logger.info(f"[WORKFLOW] Found {len(ready_tasks)} ready user/manual tasks for instance {instance_id}")
        return ready_tasks
    
    async def complete_user_task(self, instance_id: str, task_id: str, form_data: Dict[str, Any] = None, tenant_id: str = None) -> Dict[str, Any]:
        """Complete a user task with form data"""
        wf = self.active_workflows.get(instance_id)
        if not wf:
            raise HTTPException(status_code=404, detail=f"Workflow instance '{instance_id}' not found")
        
        # Find the task by ID
        task = None
        for t in wf.get_tasks():
            if str(t.id) == str(task_id):
                task = t
                break
        
        if not task:
            raise HTTPException(status_code=404, detail=f"Task '{task_id}' not found")
        
        if not (hasattr(task.task_spec, 'manual') and task.task_spec.manual):
            raise HTTPException(status_code=400, detail=f"Task '{task_id}' is not a user/manual task")
        
        if task.state != TaskState.READY:
            raise HTTPException(status_code=400, detail=f"Task '{task_id}' is not ready (current state: {task.state})")
        
        # If no form_data provided, prompt user via console
        if form_data is None:
            if isinstance(task.task_spec, BpmnUserTask):
                # This is a user task - prompt for form data
                # Find the workflow name for this instance
                workflow_name = None
                for name, spec in self.specs.items():
                    if wf.spec == spec:
                        workflow_name = name
                        break
                
                form_data = self._prompt_user_for_form_data(task.task_spec.name, task, workflow_name or "unknown", dict(task.data))
            elif isinstance(task.task_spec, ManualTask):
                # This is a manual task - prompt for completion confirmation
                if self._prompt_user_for_manual_task(task.task_spec.name, dict(task.data)):
                    form_data = {}  # Empty form data for manual tasks
                else:
                    raise HTTPException(status_code=400, detail="Manual task was not completed by user")
        
        # Update task data with form data
        if form_data:
            task.data.update(form_data)
            logger.info(f"[WORKFLOW] Updated task {task_id} with form data: {form_data}")
        
        # Complete the task
        task.run()
        
        # Try to run the workflow further (automatic tasks)
        self._run_engine_steps_safely(wf, f"Completed task {task_id} and ran engine steps")
        
        # Update instance in database
        await self._update_workflow_instance(instance_id, tenant_id)
        
        return {
            'task_id': task_id,
            'status': 'completed',
            'workflow_complete': wf.is_completed(),
            'next_ready_tasks': self.get_ready_user_tasks(instance_id)
        }
    
    def get_workflow_status(self, instance_id: str) -> Dict[str, Any]:
        """Get the current status of a workflow instance"""
        wf = self.active_workflows.get(instance_id)
        if not wf:
            raise HTTPException(status_code=404, detail=f"Workflow instance '{instance_id}' not found")
        
        # Build task info and count states in one pass
        task_counts = {}
        all_tasks = []
        
        for task in wf.get_tasks():
            state_name = next((name for name in TaskState._names if getattr(TaskState, name) == task.state), f"UNKNOWN_{task.state}")
            task_counts[state_name] = task_counts.get(state_name, 0) + 1
            all_tasks.append({
                'task_id': task.id,
                'task_name': task.task_spec.name,
                'task_spec_name': task.task_spec.bpmn_id,
                'task_type': type(task.task_spec).__name__,
                'state': state_name,
                'is_manual': hasattr(task.task_spec, 'manual') and task.task_spec.manual
            })
        
        return {
            'instance_id': instance_id,
            'is_completed': wf.is_completed(),
            'task_counts': task_counts,
            'all_tasks': all_tasks,
            'workflow_data': dict(wf.data),
            'ready_user_tasks': self.get_ready_user_tasks(instance_id)
        }
    
    def list_tasks(self, instance_id: str) -> List[Dict[str, Any]]:
        """List all tasks in a workflow instance"""
        wf = self.active_workflows.get(instance_id)
        if not wf:
            raise HTTPException(status_code=404, detail=f"Workflow instance '{instance_id}' not found")
        
        tasks = []
        for task in wf.get_tasks():
            state_name = next((name for name in TaskState._names if getattr(TaskState, name) == task.state), f"UNKNOWN_{task.state}")
            tasks.append({
                'task_id': str(task.id),
                'name': task.task_spec.name,
                'type': type(task.task_spec).__name__,
                'state': state_name
            })
        
        return tasks
    
    def stop_workflow(self, instance_id: str):
        """Stop and remove workflow instance"""
        if instance_id in self.active_workflows:
            del self.active_workflows[instance_id]
            logger.info(f"[WORKFLOW] Stopped and removed workflow instance: {instance_id}")
        else:
            logger.warning(f"[WORKFLOW] Workflow instance not found in memory: {instance_id}")
    
    def upload_bpmn(self, file: UploadFile, workflow_name: str) -> Dict[str, Any]:
        """Upload and parse BPMN file"""
        try:
            # Read file content
            bpmn_content = file.file.read()
            
            # Parse and store the workflow spec
            actual_workflow_name = self._parse_and_store_bpmn(bpmn_content, workflow_name)
            
            return {
                "success": True,
                "workflow_name": actual_workflow_name
            }
        except Exception as e:
            logger.error(f"[WORKFLOW] Error uploading BPMN file: {e}")
            return {
                "success": False,
                "workflow_name": workflow_name,
                "error": str(e)
            }
    
    def get_workflow_metrics(self) -> Dict[str, Any]:
        """Get workflow service metrics and storage information"""
        return {
            "active_workflows_count": len(self.active_workflows),
            "loaded_specs_count": len(self.specs),
            "initialized": self._initialized,
            "active_workflows": list(self.active_workflows.keys()),
            "loaded_specs": list(self.specs.keys())
        }
    
    async def get_workflow_name_by_config_id(self, config_id: str, tenant_id: str = None) -> Optional[str]:
        """Get workflow name from config ID stored in MongoDB"""
        try:
            config = await MongoStorageService.find_one(
                "workflowConfig", 
                {"_id": ObjectId(config_id)},
                tenant_id=tenant_id
            )
            if config:
                return config.get('name')
            return None
        except Exception as e:
            logger.error(f"[WORKFLOW] Error getting workflow name for config {config_id}: {e}")
            return None
    

    
    async def _save_workflow_instance(self, instance_id: str, config_id: str, workflow_name: str, initial_data: Dict[str, Any] = None, tenant_id: str = None):
        """Save workflow instance to MongoDB"""
        try:
            wf = self.active_workflows.get(instance_id)
            if not wf:
                raise ValueError(f"Workflow instance '{instance_id}' not found in memory")
            
            # Serialize workflow state
            serialized_wf = self.serializer.serialize_workflow(wf)
            
            instance_data = {
                "instance_id": instance_id,
                "config_id": config_id,
                "workflow_name": workflow_name,
                "status": "completed" if wf.is_completed() else "running",
                "serialized_workflow": serialized_wf,
                "initial_data": initial_data or {},
                "current_data": dict(wf.data),
                "tenantId": tenant_id,
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow()
            }
            
            await MongoStorageService.insert_one("workflowInstances", instance_data, tenant_id)
            logger.info(f"[WORKFLOW] Saved workflow instance '{instance_id}' to MongoDB")
            
        except Exception as e:
            logger.error(f"[WORKFLOW] Error saving workflow instance '{instance_id}': {e}")
            # Don't raise - workflow can continue without persistence
    
    async def _update_workflow_instance(self, instance_id: str, tenant_id: str = None):
        """Update workflow instance in MongoDB"""
        try:
            wf = self.active_workflows.get(instance_id)
            if not wf:
                logger.warning(f"[WORKFLOW] Cannot update instance '{instance_id}' - not found in memory")
                return
            
            # Serialize workflow state
            serialized_wf = self.serializer.serialize_workflow(wf)
            
            update_data = {
                "status": "completed" if wf.is_completed() else "running",
                "serialized_workflow": serialized_wf,
                "current_data": dict(wf.data),
                "updated_at": datetime.utcnow()
            }
            
            await MongoStorageService.update_one(
                "workflowInstances",
                {"instance_id": instance_id},
                update_data,
                tenant_id
            )
            logger.debug(f"[WORKFLOW] Updated workflow instance '{instance_id}' in MongoDB")
            
        except Exception as e:
            logger.error(f"[WORKFLOW] Error updating workflow instance '{instance_id}': {e}")
            # Don't raise - workflow can continue without persistence
    
    async def load_workflow_instances_from_db(self, tenant_id: str = None):
        """Load all active workflow instances from MongoDB back into memory"""
        try:
            # Find all active (non-completed) workflow instances
            instances = await MongoStorageService.find_many(
                "workflowInstances",
                {"status": {"$ne": "completed"}},
                tenant_id,
                sort_field="created_at",
                sort_order=-1
            )
            
            loaded_count = 0
            for instance in instances:
                try:
                    instance_id = instance["instance_id"]
                    config_id = instance["config_id"]
                    workflow_name = instance["workflow_name"]
                    serialized_wf = instance.get("serialized_workflow")
                    
                    if not serialized_wf:
                        logger.warning(f"[WORKFLOW] No serialized data for instance '{instance_id}', skipping")
                        continue
                    
                    # Load workflow spec if not already loaded
                    if workflow_name not in self.specs:
                        # Get workflow config and load BPMN file
                        try:
                            config = await MongoStorageService.find_one("workflowConfig", {"_id": ObjectId(config_id)}, tenant_id=tenant_id)
                            if config and config.get('bpmn_file_path'):
                                from backend.src.services.file_service import FileService
                                bpmn_content = await FileService.get_file_content_from_path(config['bpmn_file_path'])
                                if bpmn_content:
                                    self._parse_and_store_bpmn(bpmn_content, workflow_name)
                        except Exception as e:
                            logger.error(f"[WORKFLOW] Failed to load workflow spec for '{workflow_name}': {e}")
                    
                    # Deserialize workflow
                    spec = self.specs.get(workflow_name)
                    if not spec:
                        logger.error(f"[WORKFLOW] Cannot load spec for workflow '{workflow_name}', skipping instance '{instance_id}'")
                        continue
                    
                    wf = self.serializer.deserialize_workflow(serialized_wf, spec=spec)
                    self.active_workflows[instance_id] = wf
                    
                    loaded_count += 1
                    logger.info(f"[WORKFLOW] Loaded instance '{instance_id}' ({workflow_name}) from database")
                    
                except Exception as e:
                    logger.error(f"[WORKFLOW] Error loading instance '{instance.get('instance_id', 'unknown')}': {e}")
                    continue
            
            logger.info(f"[WORKFLOW] Loaded {loaded_count} workflow instances from database")
            return loaded_count
            
        except Exception as e:
            logger.error(f"[WORKFLOW] Error loading workflow instances from database: {e}")
            return 0
    
    async def get_workflow_instances(self, tenant_id: str = None, status: str = None, limit: int = 20, skip: int = 0) -> Dict[str, Any]:
        """Get paginated list of workflow instances"""
        try:
            filter_dict = {}
            if status:
                filter_dict["status"] = status
            
            # Get total count
            total_count = await MongoStorageService.count_documents("workflowInstances", filter_dict, tenant_id)
            
            # Get instances with pagination
            instances = await MongoStorageService.find_many(
                "workflowInstances",
                filter_dict,
                tenant_id,
                sort_field="created_at",
                sort_order=-1,
                limit=limit,
                skip=skip
            )
            
            # Add runtime info for active instances
            for instance in instances:
                instance_id = instance["instance_id"]
                if instance_id in self.active_workflows:
                    wf = self.active_workflows[instance_id]
                    instance["in_memory"] = True
                    instance["ready_tasks_count"] = len(self.get_ready_user_tasks(instance_id))
                else:
                    instance["in_memory"] = False
                    instance["ready_tasks_count"] = 0
            
            return {
                "instances": instances,
                "total_count": total_count,
                "page_size": limit,
                "current_page": (skip // limit) + 1 if limit > 0 else 1,
                "total_pages": (total_count + limit - 1) // limit if limit > 0 else 1
            }
            
        except Exception as e:
            logger.error(f"[WORKFLOW] Error getting workflow instances: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to get workflow instances: {str(e)}")
    
    async def run_workflow_sync(self, instance_id: str, max_steps: int = None) -> Dict[str, Any]:
        """Run workflow synchronously with step limit"""
        try:
            wf = self.active_workflows.get(instance_id)
            if not wf:
                raise HTTPException(status_code=404, detail=f"Workflow instance '{instance_id}' not found")
            
            if wf.is_completed():
                return {
                    "message": "Workflow is already completed",
                    "steps_executed": 0,
                    "is_completed": True,
                    "ready_tasks": []
                }
            
            steps_executed = 0
            max_steps = max_steps or 100
            
            # Execute steps
            while not wf.is_completed() and steps_executed < max_steps:
                ready_tasks = [task for task in wf.get_tasks(state=TaskState.READY)]
                if not ready_tasks:
                    break
                
                # Check if we have user/manual tasks that need intervention
                user_tasks = [task for task in ready_tasks if hasattr(task.task_spec, 'manual') and task.task_spec.manual]
                if user_tasks:
                    logger.info(f"[WORKFLOW] Found {len(user_tasks)} user tasks requiring intervention")
                    break
                
                # Run automatic tasks
                self._run_engine_steps_safely(wf, f"Running automatic tasks (step {steps_executed + 1})")
                steps_executed += 1
            
            # Update instance in database
            await self._update_workflow_instance(instance_id)
            
            # Get ready user tasks
            ready_user_tasks = self.get_ready_user_tasks(instance_id)
            
            return {
                "message": f"Executed {steps_executed} steps",
                "steps_executed": steps_executed,
                "is_completed": wf.is_completed(),
                "ready_tasks": [{"task_id": str(task["task_id"]), "name": task["task_name"], "type": task["task_type"], "state": "READY"} for task in ready_user_tasks]
            }
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"[WORKFLOW] Error running workflow '{instance_id}': {e}")
            raise HTTPException(status_code=500, detail=f"Failed to run workflow: {str(e)}")
    
    
    


