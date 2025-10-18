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

from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Query

from ..utils.auth import verify_token_middleware
from ..services.agent_service import AgentService
from ..utils.log import logger

router = APIRouter(tags=["agents"])


@router.get("/all")
async def list_all_agents(
    user: dict = Depends(verify_token_middleware),
    active_only: bool = Query(True, description="Return only active agents")
):
    """Get all agents with minimal fields for dropdowns/selects."""
    try:
        result = await AgentService.list_all_agents_minimal(
            user=user,
            active_only=active_only
        )
        return result
    except Exception as e:
        logger.error(f"Error listing all agents: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("")
async def list_agents(
    user: dict = Depends(verify_token_middleware),
    page: int = Query(1, ge=1, description="Page number (1-based)"),
    page_size: int = Query(8, ge=1, le=100, description="Items per page"),
    category: Optional[str] = Query(None, description="Filter by category"),
    search: Optional[str] = Query(None, description="Search in name and description"),
    sort_by: str = Query("created_at", description="Sort field"),
    sort_order: str = Query("desc", regex="^(asc|desc)$", description="Sort order")
):
    """List agents for current tenant with pagination, filtering, and sorting."""
    try:
        result = await AgentService.list_agents_paginated(
            user=user,
            page=page,
            page_size=page_size,
            category=category,
            search=search,
            sort_by=sort_by,
            sort_order=sort_order
        )
        return result
    except Exception as e:
        logger.error(f"Error listing agents: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{name}")
async def get_agent(name: str, user: dict = Depends(verify_token_middleware)):
    """Get specific agent by name."""
    try:
        agent = await AgentService.get_agent_by_name(name, user)
        return agent
    except Exception as e:
        logger.error(f"Error retrieving agent {name}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("")
async def upsert_agent(payload: dict, user: dict = Depends(verify_token_middleware)):
    """Create or update agent by name (unique per tenant)."""
    try:
        result = await AgentService.upsert_agent(payload, user)
        return result
    except Exception as e:
        logger.error(f"Error upserting agent: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{name}")
async def delete_agent(name: str, user: dict = Depends(verify_token_middleware)):
    """Delete agent by name."""
    try:
        result = await AgentService.delete_agent(name, user)
        return result
    except Exception as e:
        logger.error(f"Error deleting agent {name}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/id/{agent_id}")
async def delete_agent_by_id(agent_id: str, user: dict = Depends(verify_token_middleware)):
    """Delete agent by ID."""
    try:
        result = await AgentService.delete_agent_by_id(agent_id, user)
        return result
    except Exception as e:
        logger.error(f"Error deleting agent by ID {agent_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
