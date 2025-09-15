"""
Workflow Service

This service handles BPMN workflow management using SpiffWorkflow.
Provides functionality for starting, running, and managing workflow instances.
"""

import uuid
import json
import os
from typing import Dict, Any, Optional, List
from fastapi import HTTPException, UploadFile
from spiffworkflow.bpmn.parser import BpmnParser
from spiffworkflow.bpmn.workflow import BpmnWorkflow
from spiffworkflow.bpmn.serializer import BpmnWorkflowSerializer
from spiffworkflow.task import TaskState
import redis

from ..utils.log import logger


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
        wf.initialize()
        
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
            for task in wf.get_ready_tasks()
        ]
        
        status = "completed" if wf.is_completed() else "running"
        if wf.is_error():
            status = "error"
        
        return {
            "instance_id": instance_id,
            "status": status,
            "ready_tasks": ready_tasks,
            "data": dict(wf.data)
        }
    
    def run_workflow_sync(self, instance_id: str, max_steps: Optional[int] = None) -> Dict[str, Any]:
        """Run workflow synchronously with persistence"""
        serialized = self._get_workflow(instance_id)
        if not serialized:
            raise HTTPException(status_code=404, detail="Workflow instance not found")
        
        wf = self.serializer.from_dict(json.loads(serialized))
        steps = wf.do_engine_steps(max_steps=max_steps or 100)
        
        # Store updated workflow state
        serialized = self.serializer.to_dict(wf)
        self._store_workflow(instance_id, json.dumps(serialized))
        
        # Extend TTL for active workflows
        self._extend_workflow_ttl(instance_id)
        
        logger.info(f"[WORKFLOW] Ran {steps} steps for workflow {instance_id}")
        return {
            "steps_executed": steps,
            "is_completed": wf.is_completed(),
            "ready_tasks": [str(t.id) for t in wf.get_ready_tasks()]
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
            parser.add_bpmn_xml(content, filename=file.filename)
            spec = parser.find_process_spec_by_name(workflow_name)
            if not spec:
                raise HTTPException(status_code=400, detail="Invalid BPMN or workflow name")
            
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