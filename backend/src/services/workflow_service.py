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

# Add project root to Python path to find spiffworkflow
project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
sys.path.append(project_root)  # Add the project root directory to path
from spiffworkflow.bpmn.parser import BpmnParser
from spiffworkflow.bpmn.workflow import BpmnWorkflow
from spiffworkflow.bpmn.serializer import BpmnWorkflowSerializer
from spiffworkflow.task import TaskState
import redis
from lxml import etree

from backend.src.utils.log import logger


class WorkflowService:
    """Service for handling BPMN workflow operations with Redis persistence"""
    
    def __init__(self):
        self.parser = BpmnParser()
        self.serializer = BpmnWorkflowSerializer()
        self.specs: Dict[str, Any] = {}
        
        # Redis configuration with production persistence
        redis_host = os.getenv('REDIS_HOST', 'localhost')
        redis_port = int(os.getenv('REDIS_PORT', '8810'))
        redis_db = int(os.getenv('REDIS_DB', '0'))
        redis_password = os.getenv('REDIS_PASSWORD', None)
        
        try:
            # Configure Redis with persistence settings
            self.redis = redis.Redis(
                host=redis_host,
                port=redis_port,
                db=redis_db,
                password=redis_password,
                decode_responses=True,
                socket_connect_timeout=5,
                socket_timeout=5,
                retry_on_timeout=True,
                health_check_interval=30
            )
            
            # Test connection and verify persistence configuration
            self.redis.ping()
            
            # Check Redis persistence configuration
            config_info = self.redis.config_get('save')
            if config_info.get('save'):
                logger.info(f"[WORKFLOW] Redis connected with RDB persistence: {config_info['save']}")
            else:
                logger.warning("[WORKFLOW] Redis connected but RDB persistence not configured")
                
            # Check AOF persistence
            aof_config = self.redis.config_get('appendonly')
            if aof_config.get('appendonly') == 'yes':
                logger.info("[WORKFLOW] Redis AOF persistence enabled")
            else:
                logger.info("[WORKFLOW] Redis AOF persistence disabled")
                
            logger.info(f"[WORKFLOW] Connected to Redis at {redis_host}:{redis_port}")
            
        except Exception as e:
            logger.warning(f"[WORKFLOW] Redis not available ({e}), using in-memory storage")
            self.redis = None
            self._memory_store = {}
        
        self._load_specs()
    
    def _load_specs(self):
        """Load BPMN specs from Redis storage"""
        logger.info("[WORKFLOW] Loading BPMN specs from storage")
        if self.redis:
            try:
                # Load all specs from Redis
                spec_keys = self.redis.keys("spec:*")
                for key in spec_keys:
                    workflow_name = key.replace("spec:", "")
                    bpmn_content = self.redis.get(key)
                    if bpmn_content:
                        try:
                            parser = BpmnParser()
                            parser.add_bpmn_xml(bpmn_content.encode('utf-8'))
                            spec = parser.find_process_spec_by_name(workflow_name)
                            if spec:
                                self.specs[workflow_name] = spec
                                logger.info(f"[WORKFLOW] Loaded spec for {workflow_name} from Redis")
                        except Exception as e:
                            logger.error(f"[WORKFLOW] Failed to parse spec {workflow_name}: {e}")
                            
                logger.info(f"[WORKFLOW] Loaded {len(self.specs)} workflow specs from Redis")
            except Exception as e:
                logger.error(f"[WORKFLOW] Failed to load specs from Redis: {e}")
    
    def _store_workflow(self, instance_id: str, workflow_data: str, ttl_hours: int = 24):
        """Store workflow data with TTL for automatic cleanup"""
        if self.redis:
            try:
                # Set with TTL for automatic cleanup (default 24 hours)
                ttl_seconds = ttl_hours * 3600
                self.redis.setex(f"workflow:{instance_id}", ttl_seconds, workflow_data)
                logger.info(f"[WORKFLOW] Successfully uploaded workflow {instance_id} to Redis with {ttl_hours}h TTL")
                logger.debug(f"[WORKFLOW] Stored workflow {instance_id} with {ttl_hours}h TTL")
            except Exception as e:
                logger.error(f"[WORKFLOW] Failed to store workflow in Redis: {e}")
                raise
        else:
            self._memory_store[f"workflow:{instance_id}"] = workflow_data
    
    def _get_workflow(self, instance_id: str) -> Optional[str]:
        """Get workflow data from Redis or memory"""
        if self.redis:
            try:
                return self.redis.get(f"workflow:{instance_id}")
            except Exception as e:
                logger.error(f"[WORKFLOW] Failed to get workflow from Redis: {e}")
                return None
        else:
            return self._memory_store.get(f"workflow:{instance_id}")
    
    def _delete_workflow(self, instance_id: str):
        """Delete workflow data with proper error handling"""
        if self.redis:
            try:
                deleted = self.redis.delete(f"workflow:{instance_id}")
                logger.debug(f"[WORKFLOW] Deleted workflow {instance_id} (deleted: {deleted})")
            except Exception as e:
                logger.error(f"[WORKFLOW] Failed to delete workflow from Redis: {e}")
        else:
            self._memory_store.pop(f"workflow:{instance_id}", None)
    
    def _workflow_exists(self, instance_id: str) -> bool:
        """Check if workflow exists in storage"""
        if self.redis:
            try:
                return self.redis.exists(f"workflow:{instance_id}") > 0
            except Exception as e:
                logger.error(f"[WORKFLOW] Failed to check workflow existence in Redis: {e}")
                return False
        else:
            return f"workflow:{instance_id}" in self._memory_store
    
    def _extend_workflow_ttl(self, instance_id: str, ttl_hours: int = 24):
        """Extend workflow TTL when it's being actively used"""
        if self.redis:
            try:
                ttl_seconds = ttl_hours * 3600
                self.redis.expire(f"workflow:{instance_id}", ttl_seconds)
                logger.debug(f"[WORKFLOW] Extended TTL for workflow {instance_id}")
            except Exception as e:
                logger.error(f"[WORKFLOW] Failed to extend TTL: {e}")
    
    def get_workflow_metrics(self) -> Dict[str, Any]:
        """Get workflow storage metrics"""
        if self.redis:
            try:
                # Get Redis info
                info = self.redis.info()
                workflow_keys = len(self.redis.keys("workflow:*"))
                spec_keys = len(self.redis.keys("spec:*"))
                
                return {
                    "storage_type": "redis",
                    "redis_version": info.get('redis_version'),
                    "used_memory": info.get('used_memory_human'),
                    "connected_clients": info.get('connected_clients'),
                    "active_workflows": workflow_keys,
                    "loaded_specs": spec_keys,
                    "persistence_enabled": info.get('rdb_last_save_time', 0) > 0 or info.get('aof_enabled', 0) == 1
                }
            except Exception as e:
                logger.error(f"[WORKFLOW] Failed to get Redis metrics: {e}")
                return {"storage_type": "redis", "error": str(e)}
        else:
            return {
                "storage_type": "memory",
                "active_workflows": len([k for k in self._memory_store.keys() if k.startswith("workflow:")]),
                "loaded_specs": len(self.specs)
            }
    
    def start_workflow(self, workflow_name: str, initial_data: Dict[str, Any] = None, ttl_hours: int = 24) -> str:
        """Start a new workflow instance with configurable TTL"""
        spec = self.specs.get(workflow_name)
        if not spec:
            raise HTTPException(status_code=404, detail=f"Workflow '{workflow_name}' not found")
        
        wf = BpmnWorkflow(spec)
        if initial_data:
            wf.data.update(initial_data)
        
        instance_id = str(uuid.uuid4())
        serialized = self.serializer.to_dict(wf)
        self._store_workflow(instance_id, json.dumps(serialized), ttl_hours)
        
        logger.info(f"[WORKFLOW] Started workflow {workflow_name} with ID {instance_id} (TTL: {ttl_hours}h)")
        return instance_id
    
    def get_workflow_status(self, instance_id: str, extend_ttl: bool = True) -> Dict[str, Any]:
        """Get workflow status and ready tasks, optionally extending TTL"""
        serialized = self._get_workflow(instance_id)
        if not serialized:
            raise HTTPException(status_code=404, detail="Workflow instance not found")
        
        # Extend TTL for active workflows
        if extend_ttl:
            self._extend_workflow_ttl(instance_id)
        
        wf = self.serializer.from_dict(json.loads(serialized))
        ready_tasks = [
            {
                "task_id": str(task.id),
                "name": task.task_spec.name,
                "type": task.task_spec.__class__.__name__,
                "state": task.state.value if hasattr(task.state, 'value') else str(task.state)
            }
            for task in wf.get_tasks(state=TaskState.READY)
        ]
        
        status = "completed" if wf.is_completed() else "running"
        
        return {
            "instance_id": instance_id,
            "status": status,
            "ready_tasks": ready_tasks,
            "data": dict(wf.data)
        }
    
    def run_workflow_sync(self, instance_id: str) -> Dict[str, Any]:
        """Run workflow synchronously with persistence"""
        serialized = self._get_workflow(instance_id)
        if not serialized:
            raise HTTPException(status_code=404, detail="Workflow instance not found")
        
        wf = self.serializer.from_dict(json.loads(serialized))
        
        # Count initial ready tasks to estimate steps
        initial_ready_count = len(wf.get_tasks(state=TaskState.READY))
        
        # Execute engine steps (note: do_engine_steps doesn't return step count)
        wf.do_engine_steps()
        
        # Count final ready tasks to estimate steps executed
        final_ready_count = len(wf.get_tasks(state=TaskState.READY))
        
        # Estimate steps as difference in ready tasks (rough approximation)
        estimated_steps = max(0, initial_ready_count - final_ready_count + (1 if wf.is_completed() else 0))
        
        # Store updated workflow state
        serialized = self.serializer.to_dict(wf)
        self._store_workflow(instance_id, json.dumps(serialized))
        
        # Extend TTL for active workflows
        self._extend_workflow_ttl(instance_id)
        
        logger.info(f"[WORKFLOW] Ran {estimated_steps} steps for workflow {instance_id}")
        return {
            "steps_executed": estimated_steps,
            "is_completed": wf.is_completed(),
            "ready_tasks": [str(t.id) for t in wf.get_tasks(state=TaskState.READY)]
        }
    
    def stop_workflow(self, instance_id: str):
        """Stop and remove workflow instance"""
        if self._workflow_exists(instance_id):
            self._delete_workflow(instance_id)
            logger.info(f"[WORKFLOW] Stopped and removed workflow {instance_id}")
        else:
            raise HTTPException(status_code=404, detail="Workflow instance not found")
    
    def complete_task(self, instance_id: str, task_id: str, data: Dict[str, Any] = None) -> Dict[str, Any]:
        """Complete a specific task in the workflow"""
        serialized = self._get_workflow(instance_id)
        if not serialized:
            raise HTTPException(status_code=404, detail="Workflow instance not found")
        
        wf = self.serializer.from_dict(json.loads(serialized))
        task = None
        for t in wf.get_tasks():
            if str(t.id) == task_id:
                task = t
                break
        
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        
        if task.task_spec.can_leave() and task.state == TaskState.READY:
            if data:
                task.data.update(data)
            task.complete()
            wf.do_engine_steps()
            
            serialized = self.serializer.to_dict(wf)
            self._store_workflow(instance_id, json.dumps(serialized))
            
            logger.info(f"[WORKFLOW] Completed task {task_id} for workflow {instance_id}")
            return {"success": True, "is_completed": wf.is_completed()}
        else:
            raise HTTPException(status_code=400, detail="Task not ready or cannot be completed")
    
    def list_tasks(self, instance_id: str) -> List[Dict[str, Any]]:
        """List all tasks in a workflow instance"""
        serialized = self._get_workflow(instance_id)
        if not serialized:
            raise HTTPException(status_code=404, detail="Workflow instance not found")
        
        wf = self.serializer.from_dict(json.loads(serialized))
        return [
            {
                "task_id": str(task.id),
                "name": task.task_spec.name,
                "type": task.task_spec.__class__.__name__,
                "state": task.state.value if hasattr(task.state, 'value') else str(task.state)
            }
            for task in wf.get_tasks()
        ]
    
    def upload_bpmn(self, file: UploadFile, workflow_name: str) -> Dict[str, Any]:
        """Upload and parse BPMN file with persistent storage"""
        try:
            content = file.file.read()
            parser = BpmnParser()
            # Use bytes content directly with etree.fromstring to handle XML declarations properly
            if isinstance(content, str):
                content = content.encode('utf-8')
            # Parse XML from bytes and pass to add_bpmn_xml
            xml_element = etree.fromstring(content)
            parser.add_bpmn_xml(xml_element, filename=file.filename)
            
            # Get available process IDs and find the requested spec
            process_ids = parser.get_process_ids()
            if not process_ids:
                raise HTTPException(status_code=400, detail="No executable processes found in BPMN file")
            
            spec = None
            if workflow_name in process_ids:
                spec = parser.get_spec(workflow_name)
            else:
                # If the requested workflow name is not found, list available ones
                raise HTTPException(
                    status_code=400, 
                    detail=f"Workflow '{workflow_name}' not found. Available processes: {', '.join(process_ids)}"
                )
            
            # Store spec in memory for immediate use
            self.specs[workflow_name] = spec
            
            # Store BPMN content in Redis for persistence (no TTL for specs)
            if self.redis:
                try:
                    self.redis.set(f"spec:{workflow_name}", content.decode('utf-8'))
                    logger.info(f"[WORKFLOW] Successfully uploaded BPMN spec for {workflow_name} to Redis")
                    logger.info(f"[WORKFLOW] Stored BPMN spec for {workflow_name} in Redis")
                except Exception as e:
                    logger.error(f"[WORKFLOW] Failed to store BPMN spec in Redis: {e}")
                    # Continue anyway since we have it in memory
            
            logger.info(f"[WORKFLOW] Uploaded and loaded BPMN for {workflow_name}")
            return {"success": True, "workflow_name": workflow_name}
        except Exception as e:
            logger.error(f"[WORKFLOW] Error processing BPMN file: {e}")
            raise HTTPException(status_code=400, detail=f"Invalid BPMN file: {e}")
    
    def delete_workflow_config_from_redis(self, workflow_name: str, cleanup_instances: bool = False) -> bool:
        """Delete workflow spec and config from Redis storage
        
        Args:
            workflow_name: Name of the workflow to delete
            cleanup_instances: If True, also delete all running instances of this workflow
        """
        if not self.redis:
            logger.warning("[WORKFLOW] Redis not available, cannot delete workflow config")
            return False
        
        try:
            deleted_count = 0
            
            # Delete spec entry
            if self.redis.exists(f"spec:{workflow_name}"):
                self.redis.delete(f"spec:{workflow_name}")
                deleted_count += 1
                logger.info(f"[WORKFLOW] Deleted spec:{workflow_name} from Redis")
            
            # Delete config entry
            if self.redis.exists(f"config:{workflow_name}"):
                self.redis.delete(f"config:{workflow_name}")
                deleted_count += 1
                logger.info(f"[WORKFLOW] Deleted config:{workflow_name} from Redis")
            
            # Optionally clean up running instances
            if cleanup_instances:
                try:
                    # Get all workflow instance keys
                    workflow_keys = self.redis.keys("workflow:*")
                    instances_deleted = 0
                    
                    for key in workflow_keys:
                        try:
                            workflow_data = self.redis.get(key)
                            if workflow_data:
                                workflow_dict = json.loads(workflow_data)
                                # Check if this instance belongs to the deleted workflow
                                if workflow_dict.get("workflow_name") == workflow_name:
                                    self.redis.delete(key)
                                    instances_deleted += 1
                                    logger.info(f"[WORKFLOW] Deleted running instance {key}")
                        except Exception as e:
                            logger.warning(f"[WORKFLOW] Failed to check instance {key}: {e}")
                            continue
                    
                    if instances_deleted > 0:
                        logger.info(f"[WORKFLOW] Deleted {instances_deleted} running instances of {workflow_name}")
                        
                except Exception as e:
                    logger.error(f"[WORKFLOW] Error cleaning up instances for {workflow_name}: {e}")
            
            # Remove from in-memory specs
            if workflow_name in self.specs:
                del self.specs[workflow_name]
                logger.info(f"[WORKFLOW] Removed {workflow_name} from in-memory specs")
            
            logger.info(f"[WORKFLOW] Successfully deleted {deleted_count} Redis entries for workflow {workflow_name}")
            return True
            
        except Exception as e:
            logger.error(f"[WORKFLOW] Failed to delete workflow config from Redis: {e}")
            return False
    
    def get_workflow_name_by_config_id(self, config_id: str) -> Optional[str]:
        """Get workflow name from configuration ID stored in Redis"""
        if not self.redis:
            logger.warning("[WORKFLOW] Redis not available, cannot get workflow name by config ID")
            return None
        
        try:
            # Check if there's a config entry with this ID
            config_data = self.redis.get(f"config:{config_id}")
            if config_data:
                config_dict = json.loads(config_data)
                workflow_name = config_dict.get("name")
                logger.info(f"[WORKFLOW] Found workflow name '{workflow_name}' for config ID {config_id}")
                return workflow_name
            
            # If not found as config:id, check all config entries for matching ID
            config_keys = self.redis.keys("config:*")
            for key in config_keys:
                try:
                    config_data = self.redis.get(key)
                    if config_data:
                        config_dict = json.loads(config_data)
                        if config_dict.get("id") == config_id:
                            workflow_name = config_dict.get("name")
                            logger.info(f"[WORKFLOW] Found workflow name '{workflow_name}' for config ID {config_id} in key {key}")
                            return workflow_name
                except Exception as e:
                    logger.warning(f"[WORKFLOW] Error checking config key {key}: {e}")
                    continue
            
            logger.warning(f"[WORKFLOW] No workflow found for config ID {config_id}")
            return None
            
        except Exception as e:
            logger.error(f"[WORKFLOW] Error getting workflow name by config ID {config_id}: {e}")
            return None

    def store_workflow_config(self, config_data: Dict[str, Any]) -> bool:
        """Store complete workflow configuration document to Redis"""
        if not self.redis:
            logger.warning("[WORKFLOW] Redis not available, cannot store config")
            return False
        
        try:
            workflow_name = config_data.get("name", "unknown_workflow")
            self.redis.set(f"config:{workflow_name}", json.dumps(config_data))
            logger.info(f"[WORKFLOW] Successfully stored complete workflow config {workflow_name} to Redis with user {config_data.get('userName')} and tenant {config_data.get('tenantId')}")
            return True
        except Exception as e:
            logger.error(f"[WORKFLOW] Failed to store workflow config to Redis: {e}")
            return False
    
    def list_all_redis_workflows_by_tenant(self, tenant_id: str) -> List[Dict[str, Any]]:
        """NEW: List ALL workflows stored in Redis for a specific tenant"""
        logger.info(f"[WORKFLOW] Listing ALL Redis workflows for tenant: {tenant_id}")
        
        if not self.redis:
            logger.warning("[WORKFLOW] Redis not available, returning empty list")
            return []
        
        try:
            # Get all workflow keys from Redis - check both workflow: and config: keys
            workflow_keys = self.redis.keys("workflow:*")
            config_keys = self.redis.keys("config:*")
            all_keys = workflow_keys + config_keys
            workflows = []
            
            # DEBUG: Log what keys we found
            logger.info(f"[WORKFLOW] DEBUG: Found {len(workflow_keys)} workflow: keys: {workflow_keys}")
            logger.info(f"[WORKFLOW] DEBUG: Found {len(config_keys)} config: keys: {config_keys}")
            logger.info(f"[WORKFLOW] DEBUG: Total keys to process: {len(all_keys)}")
            
            for key in all_keys:
                try:
                    workflow_data = self.redis.get(key)
                    logger.info(f"[WORKFLOW] DEBUG: Processing key {key}, data exists: {workflow_data is not None}")
                    if workflow_data:
                        workflow_dict = json.loads(workflow_data)
                        logger.info(f"[WORKFLOW] DEBUG: Parsed data for {key}, top-level keys: {list(workflow_dict.keys())}")
                        
                        if key.startswith("config:"):
                            # Handle config keys - data is stored directly
                            tenant_from_data = workflow_dict.get("tenantId", "unknown")
                            logger.info(f"[WORKFLOW] DEBUG: Config key {key} has tenant: {tenant_from_data}")
                            workflow_info = {
                                "id": workflow_dict.get("id", key.replace("config:", "")),
                                "redis_key": key,
                                "tenant_id": tenant_from_data,
                                "name": workflow_dict.get("name", "Unknown Workflow"),
                                "description": workflow_dict.get("description", "No description"),
                                "category": workflow_dict.get("category", "general"),
                                "is_active": workflow_dict.get("is_active", True),
                                "type": "workflow_config",
                                "status": "stored_in_redis",
                                "created_at": workflow_dict.get("createdAt", "unknown"),
                                "bpmn_filename": workflow_dict.get("workflowFileName", workflow_dict.get("bpmn_filename", "no_file.bpmn"))
                            }
                        else:
                            # Handle workflow keys - legacy format
                            tenant_from_data = workflow_dict.get("data", {}).get("tenant_id", "unknown")
                            logger.info(f"[WORKFLOW] DEBUG: Workflow key {key} has tenant: {tenant_from_data}")
                            workflow_info = {
                                "id": key.replace("workflow:", ""),
                                "redis_key": key,
                                "tenant_id": tenant_from_data,
                                "name": workflow_dict.get("spec", {}).get("name", "Unknown Workflow"),
                                "description": workflow_dict.get("data", {}).get("description", "No description"),
                                "category": workflow_dict.get("data", {}).get("category", "general"),
                                "is_active": True,  # Assume active if in Redis
                                "type": "redis_workflow",
                                "status": "stored_in_redis",
                                "created_at": workflow_dict.get("data", {}).get("created_at", "unknown"),
                                "bpmn_filename": workflow_dict.get("data", {}).get("bpmn_filename", "redis_stored.bpmn")
                            }
                        
                        # Only include workflows for the specified tenant
                        logger.info(f"[WORKFLOW] DEBUG: Comparing tenant_id: '{workflow_info['tenant_id']}' with requested: '{tenant_id}'")
                        if workflow_info["tenant_id"] == tenant_id:
                            workflows.append(workflow_info)
                            logger.info(f"[WORKFLOW] DEBUG: Added workflow {workflow_info['name']} to results")
                        else:
                            logger.info(f"[WORKFLOW] DEBUG: Skipped workflow {workflow_info['name']} - tenant mismatch")
                            
                except Exception as e:
                    logger.error(f"[WORKFLOW] Error processing Redis workflow {key}: {e}")
                    continue
            
            logger.info(f"[WORKFLOW] Found {len(workflows)} Redis workflows for tenant {tenant_id}")
            return workflows
            
        except Exception as e:
            logger.error(f"[WORKFLOW] Error listing Redis workflows for tenant {tenant_id}: {e}")
            return []
    
    def test_workflow_with_bpmn_file(self, bpmn_file_path: str):
        """
        Comprehensive test function to test the workflow service with a BPMN file
        
        This function tests the following workflow operations in sequence:
        1. Upload BPMN file to Redis with dummy user/tenant data
        2. Store workflow configuration with user and tenant details
        3. Start a workflow instance
        4. Check workflow status
        5. Run workflow synchronously
        6. List all workflows for a tenant
        
        Args:
            bpmn_file_path: Path to the BPMN file to test with
        """
        logger.info("=" * 80)
        logger.info("[TEST] Starting workflow service test with BPMN file")
        logger.info("=" * 80)
        
        # 1. Test Variables - Dummy tenant and user data
        workflow_name = "test_workflow_1"
        tenant_id = "test_tenant_123"
        user_name = "test_user@example.com"
        
        try:
            # 2. First check if Redis is available
            if not self.redis:
                logger.warning("[TEST] Redis not available - skipping test")
                return {
                    "success": False,
                    "error": "Redis not available",
                    "storage_type": "memory"
                }
            
            # 3. TEST: Upload BPMN file
            logger.info("[TEST] Step 1: Testing BPMN file upload")
            
            try:
                # Read BPMN file content
                with open(bpmn_file_path, 'rb') as bpmn_file:
                    bpmn_content = bpmn_file.read()
                
                # Parse XML from bytes to handle XML declarations properly
                parser = BpmnParser()
                xml_element = etree.fromstring(bpmn_content)
                parser.add_bpmn_xml(xml_element, filename=bpmn_file_path)
                
                # Get the first available process spec
                process_ids = parser.get_process_ids()
                if not process_ids:
                    raise Exception("No executable processes found in BPMN file")
                
                # Try to get spec by the given workflow name first, then fall back to first available
                spec = None
                if workflow_name in process_ids:
                    spec = parser.get_spec(workflow_name)
                    workflow_name_to_use = workflow_name
                else:
                    # Use the first process ID found
                    workflow_name_to_use = process_ids[0]
                    spec = parser.get_spec(workflow_name_to_use)
                    workflow_name = workflow_name_to_use  # Update workflow_name for subsequent use
                
                # Store spec in memory for immediate use
                self.specs[workflow_name] = spec
                
                # Store BPMN content in Redis
                self.redis.set(f"spec:{workflow_name}", bpmn_content.decode('utf-8'))
                logger.info(f"[TEST] Successfully uploaded BPMN spec for {workflow_name} to Redis")
                
                upload_result = {"success": True, "workflow_name": workflow_name}
                logger.info(f"[TEST] BPMN upload result: {upload_result}")
            except Exception as e:
                logger.error(f"[TEST] Failed to upload BPMN: {str(e)}")
                return {"success": False, "error": f"BPMN upload failed: {str(e)}"}
            
            # 4. TEST: Store workflow configuration with dummy user and tenant
            logger.info("[TEST] Step 2: Testing workflow configuration storage")
            
            # Create a mock workflow configuration
            config_data = {
                "id": str(uuid.uuid4()),
                "name": workflow_name,
                "description": "Test workflow configuration",
                "category": "test",
                "tenantId": tenant_id,
                "userName": user_name,
                "createdAt": datetime.now().isoformat(),
                "updatedAt": datetime.now().isoformat(),
                "is_active": True,
                "version": "1.0.0",
                "workflowFileName": os.path.basename(bpmn_file_path)
            }
            
            # Store config
            config_stored = self.store_workflow_config(config_data)
            logger.info(f"[TEST] Workflow config storage result: {config_stored}")
            
            if not config_stored:
                logger.error("[TEST] Failed to store workflow configuration")
                return {"success": False, "error": "Failed to store workflow configuration"}
            
            # 5. TEST: Start workflow instance
            logger.info("[TEST] Step 3: Testing workflow instance start")
            
            # Prepare initial data
            initial_data = {
                "tenant_id": tenant_id,
                "user_id": "test_user_123",
                "start_time": datetime.now().isoformat(),
                "test_run": True,
            }
            
            try:
                instance_id = self.start_workflow(workflow_name, initial_data, ttl_hours=1)
                logger.info(f"[TEST] Started workflow instance: {instance_id}")
            except Exception as e:
                logger.error(f"[TEST] Failed to start workflow: {str(e)}")
                return {"success": False, "error": f"Workflow start failed: {str(e)}"}
            
            # 6. TEST: Get workflow status
            logger.info("[TEST] Step 4: Testing workflow status retrieval")
            
            try:
                status = self.get_workflow_status(instance_id)
                logger.info(f"[TEST] Workflow status: {status}")
            except Exception as e:
                logger.error(f"[TEST] Failed to get workflow status: {str(e)}")
                return {"success": False, "error": f"Status retrieval failed: {str(e)}"}
            
            # 7. TEST: Run workflow synchronously
            logger.info("[TEST] Step 5: Testing workflow execution")
            
            try:
                execution_result = self.run_workflow_sync(instance_id)
                logger.info(f"[TEST] Workflow execution result: {execution_result}")
            except Exception as e:
                logger.error(f"[TEST] Failed to execute workflow: {str(e)}")
                return {"success": False, "error": f"Workflow execution failed: {str(e)}"}
            
            # 8. TEST: Check workflow status again to verify completion
            logger.info("[TEST] Step 6: Verifying workflow completion status")
            
            try:
                final_status = self.get_workflow_status(instance_id)
                logger.info(f"[TEST] Final workflow status: {final_status}")
                
                # Verify completion
                if final_status.get("status") != "completed":
                    logger.warning(f"[TEST] Workflow not completed. Status: {final_status.get('status')}")
            except Exception as e:
                logger.error(f"[TEST] Failed to get final workflow status: {str(e)}")
            
            # 9. TEST: List workflows by tenant
            logger.info("[TEST] Step 7: Testing workflow listing by tenant")
            
            try:
                tenant_workflows = self.list_all_redis_workflows_by_tenant(tenant_id)
                logger.info(f"[TEST] Found {len(tenant_workflows)} workflows for tenant {tenant_id}")
                
                # Log workflows found
                for wf in tenant_workflows:
                    logger.info(f"[TEST] Found workflow: {wf.get('name')} (ID: {wf.get('id')})")
            except Exception as e:
                logger.error(f"[TEST] Failed to list workflows by tenant: {str(e)}")
            
            # 10. Return comprehensive test results
            logger.info("=" * 80)
            logger.info("[TEST] Workflow test completed successfully")
            logger.info("=" * 80)
            
            return {
                "success": True,
                "workflow_name": workflow_name,
                "instance_id": instance_id,
                "tenant_id": tenant_id,
                "workflow_complete": final_status.get("status") == "completed",
                "tenant_workflows": len(tenant_workflows),
                "test_execution_time": datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"[TEST] Overall test execution failed: {str(e)}")
            import traceback
            logger.error(traceback.format_exc())
            return {"success": False, "error": f"Test failed: {str(e)}"}


# Add code to execute the test when this file is run directly
if __name__ == "__main__":
    from datetime import datetime
    import os
    
    print("=" * 80)
    print("WORKFLOW SERVICE TEST")
    print("=" * 80)
    
    # Create service instance
    service = WorkflowService()
    
    # Get the directory of this file
    current_dir = os.path.dirname(os.path.abspath(__file__))
    
    # Path to the BPMN file
    bpmn_file_path = os.path.join(current_dir, "wf1.bpmn")
    
    if not os.path.exists(bpmn_file_path):
        print(f"BPMN file not found: {bpmn_file_path}")
        print("Available files in directory:")
        for file in os.listdir(current_dir):
            print(f"  - {file}")
    else:
        print(f"Testing with BPMN file: {bpmn_file_path}")
        
        # Run the test
        result = service.test_workflow_with_bpmn_file(bpmn_file_path)
        
        # Print result
        print("\nTEST RESULTS:")
        print("-" * 80)
        for key, value in result.items():
            print(f"{key}: {value}")
        print("-" * 80)
        print("Test Complete")