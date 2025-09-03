"""MongoDB storage utilities for agent runtime."""
from typing import Dict, Optional, Any
from datetime import datetime

from .log import logger

def model_config_get(config_name: str, tenant_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Get model configuration from MongoDB."""
    try:
        from ..db import get_collections
        collections = get_collections()
        model_configs = collections.get('modelConfig')
        if not model_configs:
            logger.warning("modelConfig collection not available")
            return None
        
        # CRITICAL: Include tenant_id in query for isolation
        query = {"name": config_name}
        if tenant_id:
            query["tenantId"] = tenant_id
            logger.debug(f"Searching for model config '{config_name}' with tenant_id: {tenant_id}")
        else:
            logger.warning(f"[TENANT_ENFORCEMENT] model_config_get called without tenant_id for config: {config_name}")
        
        config = model_configs.find_one(query)
        return config
    except Exception as e:
        logger.error(f"Failed to get model config {config_name}: {e}")
        return None

def tools_config_get(config_name: str, tenant_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Get tools configuration from MongoDB."""
    try:
        from ..db import get_collections
        collections = get_collections()
        tools_configs = collections.get('toolConfig')  # Fixed collection name
        if not tools_configs:
            logger.warning("toolConfig collection not available")
            return None
        
        # CRITICAL: Include tenant_id in query for isolation
        query = {"name": config_name}
        if tenant_id:
            query["tenantId"] = tenant_id
            logger.debug(f"Searching for tools config '{config_name}' with tenant_id: {tenant_id}")
        else:
            logger.warning(f"[TENANT_ENFORCEMENT] tools_config_get called without tenant_id for config: {config_name}")
        
        config = tools_configs.find_one(query)
        return config
    except Exception as e:
        logger.error(f"Failed to get tools config {config_name}: {e}")
        return None

def agent_run_upsert(run_data: Dict[str, Any]) -> None:
    """Insert or update agent run data in MongoDB."""
    try:
        from ..db import get_collections
        collections = get_collections()
        agent_runs = collections.get('agent_runs')
        if not agent_runs:
            logger.warning("agent_runs collection not available")
            return
        
        correlation_id = run_data.get('correlation_id')
        if not correlation_id:
            logger.error("No correlation_id in run_data")
            return
        
        # CRITICAL: Validate tenant_id is present before upsert
        tenant_id = run_data.get('tenantId')
        if not tenant_id:
            logger.error(f"[TENANT_ENFORCEMENT] CRITICAL: agent_run_upsert requires tenant_id but none found in run_data for correlation_id: {correlation_id}")
            raise ValueError("tenant_id is required for agent_runs upsert operations")
        
        # Upsert based on correlation_id AND tenant_id for isolation
        result = agent_runs.replace_one(
            {"correlation_id": correlation_id, "tenantId": tenant_id},
            run_data,
            upsert=True
        )
        logger.info(f"Agent run data upserted for {correlation_id} with tenant_id: {tenant_id}")
    except Exception as e:
        logger.error(f"Failed to upsert agent run data: {e}")
        raise

def agent_run_update_status(correlation_id: str, status: str, error: Optional[str] = None, tenant_id: Optional[str] = None) -> None:
    """Update agent run status in MongoDB."""
    try:
        from ..db import get_collections
        collections = get_collections()
        agent_runs = collections.get('agent_runs')
        if not agent_runs:
            logger.warning("agent_runs collection not available")
            return
        
        # CRITICAL: Validate tenant_id is present for update
        if not tenant_id:
            logger.error(f"[TENANT_ENFORCEMENT] CRITICAL: agent_run_update_status requires tenant_id but none provided for correlation_id: {correlation_id}")
            raise ValueError("tenant_id is required for agent_runs update operations")
        
        update_data = {
            "status": status,
            "updated_at": datetime.utcnow()
        }
        if error:
            update_data["error"] = error
        
        # Update only records matching both correlation_id AND tenant_id
        result = agent_runs.update_one(
            {"correlation_id": correlation_id, "tenantId": tenant_id},
            {"$set": update_data}
        )
        logger.info(f"Agent run status updated for {correlation_id} with tenant_id: {tenant_id}: {status}")
    except Exception as e:
        logger.error(f"Failed to update agent run status: {e}")
        raise
