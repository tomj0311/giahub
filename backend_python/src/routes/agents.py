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
import logging

from fastapi import APIRouter, HTTPException, Depends, status

from ..db import get_collections
from ..utils.auth import verify_token_middleware

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/agents", tags=["agents"]) 


def _agents_col():
    return get_collections()["agents"]


@router.get("")
async def list_agents(user: dict = Depends(verify_token_middleware)):
    """List agents for current tenant."""
    tenant_id = user.get("tenantId") or "system"
    cursor = _agents_col().find({"tenantId": tenant_id}).sort("name", 1)
    docs = await cursor.to_list(length=None)
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
    return {"agents": items}


@router.get("/{name}")
async def get_agent(name: str, user: dict = Depends(verify_token_middleware)):
    tenant_id = user.get("tenantId") or "system"
    doc = await _agents_col().find_one({"tenantId": tenant_id, "name": name})
    if not doc:
        raise HTTPException(status_code=404, detail="Agent not found")
    doc["id"] = str(doc.pop("_id"))
    return doc


@router.post("")
async def upsert_agent(payload: dict, user: dict = Depends(verify_token_middleware)):
    """Create or update agent by name (unique per tenant)."""
    name = (payload.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")

    tenant_id = user.get("tenantId") or "system"
    user_id = user.get("id") or user.get("userId") or "unknown"

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
        await _agents_col().update_one({"_id": existing["_id"]}, {"$set": record})
        action = "updated"
    else:
        record["created_at"] = datetime.utcnow()
        await _agents_col().insert_one(record)
        action = "created"

    return {"message": f"Agent {action}", "name": name}


@router.delete("/{name}")
async def delete_agent(name: str, user: dict = Depends(verify_token_middleware)):
    tenant_id = user.get("tenantId") or "system"
    res = await _agents_col().delete_one({"tenantId": tenant_id, "name": name})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Agent not found")
    return {"message": f"Agent '{name}' deleted"}
