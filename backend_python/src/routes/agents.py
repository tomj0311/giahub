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

from datetime import datetime
from typing import Optional, Dict, Any, List

from fastapi import APIRouter, HTTPException, Depends, status

from ..db import get_collections
from ..utils.auth import verify_token_middleware
from ..utils.log import logger

router = APIRouter(prefix="/api/agents", tags=["agents"]) 


def _agents_col():
    return get_collections()["agents"]


@router.get("")
async def list_agents(user: dict = Depends(verify_token_middleware)):
    """List agents for current tenant."""
    # CRITICAL: tenant_id is required - no fallbacks allowed
    tenant_id = user.get("tenantId")
    if not tenant_id:
        from fastapi import status
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User tenant information missing. Please re-login."
        )
    
    logger.info(f"[AGENTS] Listing agents for tenant: {tenant_id}")
    
    try:
        cursor = _agents_col().find({"tenantId": tenant_id}).sort("name", 1)
        docs = await cursor.to_list(length=None)
        logger.debug(f"[AGENTS] Found {len(docs)} agents for tenant: {tenant_id}")
        
        items: List[Dict[str, Any]] = []
        for d in docs:
            item = {
                "id": str(d.get("_id")),
                "name": d.get("name"),
                "category": d.get("category", ""),
                "description": d.get("description", ""),
                "instructions": d.get("instructions", ""),
                "model": d.get("model"),
                "tools": d.get("tools", {}),
                "collection": d.get("collection", ""),
                "memory": d.get("memory", {}),
                "created_at": d.get("created_at"),
                "updated_at": d.get("updated_at"),
            }
            items.append(item)
        
        logger.info(f"[AGENTS] Successfully retrieved {len(items)} agents for tenant: {tenant_id}")
        return {"agents": items}
    except Exception as e:
        logger.error(f"[AGENTS] Failed to list agents for tenant {tenant_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve agents")


@router.get("/{name}")
async def get_agent(name: str, user: dict = Depends(verify_token_middleware)):
    # CRITICAL: tenant_id is required - no fallbacks allowed
    tenant_id = user.get("tenantId")
    if not tenant_id:
        from fastapi import status
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User tenant information missing. Please re-login."
        )
    
    logger.info(f"[AGENTS] Getting agent '{name}' for tenant: {tenant_id}")
    
    try:
        doc = await _agents_col().find_one({"tenantId": tenant_id, "name": name})
        if not doc:
            logger.warning(f"[AGENTS] Agent '{name}' not found for tenant: {tenant_id}")
            raise HTTPException(status_code=404, detail=f"Agent '{name}' not found")
            raise HTTPException(status_code=404, detail="Agent not found")
        
        doc["id"] = str(doc.pop("_id"))
        logger.info(f"[AGENTS] Successfully retrieved agent '{name}' for tenant: {tenant_id}")
        return doc
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[AGENTS] Failed to get agent '{name}' for tenant {tenant_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve agent")


@router.post("")
async def upsert_agent(payload: dict, user: dict = Depends(verify_token_middleware)):
    """Create or update agent by name (unique per tenant)."""
    name = (payload.get("name") or "").strip()
    if not name:
        logger.warning("[AGENTS] Upsert agent failed - name is required")
        raise HTTPException(status_code=400, detail="name is required")

    # CRITICAL: tenant_id is required - no fallbacks allowed
    tenant_id = user.get("tenantId")
    if not tenant_id:
        from fastapi import status
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User tenant information missing. Please re-login."
        )
    user_id = user.get("id") or user.get("userId") or "unknown"
    logger.info(f"[AGENTS] Upserting agent '{name}' for tenant: {tenant_id}, user: {user_id}")

    try:
        record = {
            "tenantId": tenant_id,
            "userId": user_id,
            "name": name,
            "category": payload.get("category", ""),
            "description": payload.get("description", ""),
            "instructions": payload.get("instructions", ""),
            "model": payload.get("model") or {},
            "tools": payload.get("tools") or {},
            "collection": payload.get("collection", ""),
            "memory": payload.get("memory") or {},
            "updated_at": datetime.utcnow(),
        }

        existing = await _agents_col().find_one({"tenantId": tenant_id, "name": name})
        if existing:
            logger.debug(f"[AGENTS] Updating existing agent '{name}' for tenant: {tenant_id}")
            await _agents_col().update_one({"_id": existing["_id"]}, {"$set": record})
            action = "updated"
        else:
            logger.debug(f"[AGENTS] Creating new agent '{name}' for tenant: {tenant_id}")
            record["created_at"] = datetime.utcnow()
            await _agents_col().insert_one(record)
            action = "created"

        logger.info(f"[AGENTS] Successfully {action} agent '{name}' for tenant: {tenant_id}")
        return {"message": f"Agent {action}", "name": name}
    except Exception as e:
        logger.error(f"[AGENTS] Failed to upsert agent '{name}' for tenant {tenant_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to save agent")


@router.delete("/{name}")
async def delete_agent(name: str, user: dict = Depends(verify_token_middleware)):
    # CRITICAL: tenant_id is required - no fallbacks allowed
    tenant_id = user.get("tenantId")
    if not tenant_id:
        from fastapi import status
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User tenant information missing. Please re-login."
        )
    
    logger.info(f"[AGENTS] Deleting agent '{name}' for tenant: {tenant_id}")
    
    try:
        res = await _agents_col().delete_one({"tenantId": tenant_id, "name": name})
        if res.deleted_count == 0:
            logger.warning(f"[AGENTS] Agent '{name}' not found for deletion in tenant: {tenant_id}")
            raise HTTPException(status_code=404, detail="Agent not found")
        
        logger.info(f"[AGENTS] Successfully deleted agent '{name}' for tenant: {tenant_id}")
        return {"message": f"Agent '{name}' deleted"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[AGENTS] Failed to delete agent '{name}' for tenant {tenant_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete agent")
