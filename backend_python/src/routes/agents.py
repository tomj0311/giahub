"""
Agents CRUD routes (HTTP only)

Schema (agents collection):
- tenantId, userId
- name (unique per tenant), category, description, instructions
- model: { name: str }
- tools: { [toolName]: { ...params } }  // opaque params
- collection: optional knowledge prefix name
- memory: { history: { enabled: bool, num: int } }
"""

from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException

from ..utils.auth import verify_token_middleware
from ..services.agent_service import AgentService
from ..utils.log import logger

router = APIRouter(tags=["agents"])


@router.get("")
async def list_agents(user: dict = Depends(verify_token_middleware)):
    """List agents for current tenant."""
    logger.info("[AGENTS] Listing agents for tenant")
    try:
        agents = await AgentService.list_agents(user)
        logger.debug(f"[AGENTS] Retrieved {len(agents)} agents")
        return {"agents": agents}
    except Exception as e:
        logger.error(f"[AGENTS] Error listing agents: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{name}")
async def get_agent(name: str, user: dict = Depends(verify_token_middleware)):
    """Get specific agent by name."""
    logger.info(f"[AGENTS] Getting agent by name: {name}")
    try:
        agent = await AgentService.get_agent_by_name(name, user)
        if agent:
            logger.debug(f"[AGENTS] Successfully retrieved agent: {name}")
        else:
            logger.warning(f"[AGENTS] Agent not found: {name}")
        return agent
    except Exception as e:
        logger.error(f"[AGENTS] Error retrieving agent {name}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("")
async def upsert_agent(payload: dict, user: dict = Depends(verify_token_middleware)):
    """Create or update agent by name (unique per tenant)."""
    agent_name = payload.get("name", "Unnamed")
    logger.info(f"[AGENTS] Upserting agent: {agent_name}")
    logger.debug(f"[AGENTS] Agent payload: {payload}")
    try:
        result = await AgentService.upsert_agent(payload, user)
        logger.info(f"[AGENTS] Successfully upserted agent: {agent_name}")
        return result
    except Exception as e:
        logger.error(f"[AGENTS] Error upserting agent {agent_name}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{name}")
async def delete_agent(name: str, user: dict = Depends(verify_token_middleware)):
    """Delete agent by name."""
    logger.info(f"[AGENTS] Deleting agent: {name}")
    try:
        result = await AgentService.delete_agent(name, user)
        logger.info(f"[AGENTS] Successfully deleted agent: {name}")
        return result
    except Exception as e:
        logger.error(f"[AGENTS] Error deleting agent {name}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
