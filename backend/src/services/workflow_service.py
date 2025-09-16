"""
Workflow Service

This service handles BPMN workflow management using SpiffWorkflow.
Provides functionality for starting, running, and managing workflow instances.
"""

import uuid
import json
import os
import sys
from typing import Dict, Any, Optional, List
from fastapi import HTTPException, UploadFile
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


class WorkflowService:
    """Service for handling BPMN workflow operations"""
    
    def __init__(self):
        self.parser = BpmnParser()  # Use BPMN parser
        self.serializer = BpmnWorkflowSerializer()
        self.specs: Dict[str, Any] = {}
        self.active_workflows: Dict[str, BpmnWorkflow] = {}  # Store active workflow instances
        self.bpmn_xml_data: Dict[str, Any] = {}  # Store original BPMN XML for form parsing
        
        self._load_specs()
    
    def _load_specs(self):
        """Initialize BPMN specs"""
        logger.info("[WORKFLOW] Initializing BPMN workflow service")
        logger.info(f"[WORKFLOW] Currently have {len(self.specs)} workflow specs loaded")
    
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
    
    def complete_user_task(self, instance_id: str, task_id: str, form_data: Dict[str, Any] = None) -> Dict[str, Any]:
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
    
    
# Test main method - separate from the main service
if __name__ == "__main__":
    def _get_workflow_config_from_mongo(workflow_id: str):
        """Get workflow configuration from MongoDB"""
        from pymongo import MongoClient
        print("Connecting to MongoDB on port 8801...")
        mongo_client = MongoClient('mongodb://localhost:8801/')
        collection = mongo_client['giap']['workflowConfig']
        
        print(f"Looking for workflow config with ID: {workflow_id}")
        workflow_config = collection.find_one({"_id": ObjectId(workflow_id)})
        if not workflow_config:
            raise ValueError(f"Workflow config not found for ID: {workflow_id}")
        
        print(f"Found workflow: {workflow_config['name']}")
        print(f"BPMN file path: {workflow_config['bpmn_file_path']}")
        return workflow_config

    def _get_bpmn_content_from_minio(file_path: str):
        """Download BPMN content from MinIO"""
        from minio import Minio
        print("Connecting to MinIO on port 8803...")
        minio_client = Minio('localhost:8803', access_key='minio', secret_key='minio8888', secure=False)
        
        print(f"Downloading BPMN file from MinIO: {file_path}")
        response = minio_client.get_object("uploads", file_path)
        content = response.read()
        response.close()
        response.release_conn()
        return content

    def _setup_workflow_from_bpmn(workflow_service, bpmn_content, workflow_config):
        """Parse BPMN and setup workflow in service"""
        parser = BpmnParser()
        xml_element = etree.fromstring(bpmn_content)
        processes = xml_element.xpath('//bpmn:process | //process', namespaces={'bpmn': 'http://www.omg.org/spec/BPMN/20100524/MODEL'})
        
        parser.add_bpmn_xml(xml_element, filename=workflow_config['bpmn_filename'])
        process_ids = parser.get_process_ids()
        
        if not process_ids:
            # Make processes executable and re-parse
            for proc in processes:
                if proc.get('isExecutable') != 'true':
                    proc.set('isExecutable', 'true')
            parser = BpmnParser()
            parser.add_bpmn_xml(xml_element, filename=workflow_config['bpmn_filename'])
            process_ids = parser.get_process_ids()
            
            if not process_ids:
                raise ValueError("No executable processes found")
        
        print(f"Found process IDs: {process_ids}")
        workflow_name = workflow_config['name'] if workflow_config['name'] in process_ids else process_ids[0]
        spec = parser.get_spec(workflow_name)
        
        workflow_service.specs[workflow_name] = spec
        workflow_service.bpmn_xml_data[workflow_name] = xml_element
        print(f"Loaded workflow: {workflow_name}")
        return workflow_name

    def _process_workflow_tasks(workflow_service, instance_id):
        """Process all workflow tasks until completion"""
        status = workflow_service.get_workflow_status(instance_id)
        print(f"📊 Workflow status: {status['task_counts']}")
        ready_tasks = status['ready_user_tasks']
        
        while ready_tasks and not status['is_completed']:
            print(f"\n👤 Found {len(ready_tasks)} ready user/manual tasks:")
            
            for i, task in enumerate(ready_tasks, 1):
                print(f"\n  {i}. {task['task_name']} (ID: {task['task_id']}) - Type: {task['task_type']}")
                try:
                    result = workflow_service.complete_user_task(instance_id, task['task_id'])
                    print(f"     ✅ Task completed: {result['status']}")
                    if result.get('workflow_complete'):
                        print(f"     🏁 Workflow completed!")
                        return
                except Exception as e:
                    print(f"     ❌ Failed to complete task: {e}")
                    continue
            
            status = workflow_service.get_workflow_status(instance_id)
            ready_tasks = status['ready_user_tasks']
            if not ready_tasks:
                print("     ⏸️ No more ready tasks")
                break
        
        if not ready_tasks and not status['is_completed']:
            print("❓ No user/manual tasks found - workflow may be waiting or blocked")
        elif not ready_tasks and status['is_completed']:
            print("✅ All tasks completed automatically!")
        
        # Final status
        final_status = workflow_service.get_workflow_status(instance_id)
        print(f"\n📋 Final workflow status:")
        print(f"   🏁 Complete: {final_status['is_completed']}")
        print(f"   📊 Task counts: {final_status['task_counts']}")
        print(f"   💾 Workflow data: {final_status['workflow_data']}")

    def test_workflow_from_mongo_minio():
        """Test workflow by reading config from MongoDB and file from MinIO"""
        try:
            workflow_id = "68c895f3620a7a8f3ff26058"
            workflow_config = _get_workflow_config_from_mongo(workflow_id)
            bpmn_content = _get_bpmn_content_from_minio(workflow_config['bpmn_file_path'])
            
            workflow_service = WorkflowService()
            workflow_name = _setup_workflow_from_bpmn(workflow_service, bpmn_content, workflow_config)
            
            instance_id = workflow_service.start_workflow(workflow_name)
            print(f"Started instance: {instance_id}")
            
            print("\n🔍 Checking workflow status...")
            _process_workflow_tasks(workflow_service, instance_id)
            print("✅ Test completed successfully!")
            
        except Exception as e:
            print(f"❌ Test failed: {e}")
            import traceback
            traceback.print_exc()
    
    print("🚀 Testing workflow with user/manual task handling from MinIO...")
    test_workflow_from_mongo_minio()

