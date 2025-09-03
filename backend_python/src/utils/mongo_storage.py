"""MongoDB storage utilities for agent runtime."""
from typing import Dict, Optional, Any
from datetime import datetime

from .log import logger

def model_config_get(config_name: str) -> Optional[Dict[str, Any]]:
    """Get model configuration from MongoDB."""
    try:
        from ..db import get_collections
        collections = get_collections()
        model_configs = collections.get('modelConfig')
        if not model_configs:
            logger.warning("modelConfig collection not available")
            return None
        
        config = model_configs.find_one({"name": config_name})
        return config
    except Exception as e:
        logger.error(f"Failed to get model config {config_name}: {e}")
        return None

def tools_config_get(config_name: str) -> Optional[Dict[str, Any]]:
    """Get tools configuration from MongoDB."""
    try:
        from ..db import get_collections
        collections = get_collections()
        tools_configs = collections.get('tools_configs')
        if not tools_configs:
            logger.warning("tools_configs collection not available")
            return None
        
        config = tools_configs.find_one({"name": config_name})
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
        
        # Upsert based on correlation_id
        result = agent_runs.replace_one(
            {"correlation_id": correlation_id},
            run_data,
            upsert=True
        )
        logger.info(f"Agent run data upserted for {correlation_id}")
    except Exception as e:
        logger.error(f"Failed to upsert agent run data: {e}")

def agent_run_update_status(correlation_id: str, status: str, error: Optional[str] = None) -> None:
    """Update agent run status in MongoDB."""
    try:
        from ..db import get_collections
        collections = get_collections()
        agent_runs = collections.get('agent_runs')
        if not agent_runs:
            logger.warning("agent_runs collection not available")
            return
        
        update_data = {
            "status": status,
            "updated_at": datetime.utcnow()
        }
        if error:
            update_data["error"] = error
        
        result = agent_runs.update_one(
            {"correlation_id": correlation_id},
            {"$set": update_data}
        )
        logger.info(f"Agent run status updated for {correlation_id}: {status}")
    except Exception as e:
        logger.error(f"Failed to update agent run status: {e}")
