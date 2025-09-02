from __future__ import annotations

import logging
from datetime import datetime
from typing import List, Dict, Any

from fastapi import APIRouter, Depends, HTTPException

from ..db import get_collections
from ..utils.auth import verify_token_middleware

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/agent-runtime", tags=["agent-runtime"]) 


def _conversations_col():
    return get_collections()["conversations"]


@router.post("/run")
async def run_agent(body: Dict[str, Any], user: dict = Depends(verify_token_middleware)):
    """HTTP-only run: returns a single response (no streaming).

    body: { agent_name, prompt, session_prefix? }
    """
    agent_name = (body.get("agent_name") or body.get("file") or "").strip()
    prompt = (body.get("prompt") or "").strip()
    if not agent_name:
        raise HTTPException(status_code=400, detail="agent_name is required")
    if not prompt:
        raise HTTPException(status_code=400, detail="prompt is required")

    # For now, provide a deterministic dummy response; can be replaced with real model call
    content = f"Agent '{agent_name}' says: You said -> {prompt}"
    return {"content": content}


@router.get("/conversations")
async def list_conversations(user: dict = Depends(verify_token_middleware)):
    tenant_id = user.get("tenantId") or "system"
    cursor = _conversations_col().find({"tenantId": tenant_id}).sort("updated_at", -1)
    docs = await cursor.to_list(length=None)
    items: List[Dict[str, Any]] = []
    for d in docs:
        items.append({
            "conversation_id": d.get("conversation_id"),
            "title": d.get("title") or (d.get("messages") or [{}])[-1].get("content", "Conversation"),
            "agent_name": d.get("agent_name"),
            "updated_at": int((d.get("updated_at") or datetime.utcnow()).timestamp() * 1000),
        })
    return {"conversations": items}


@router.get("/conversations/{conversation_id}")
async def get_conversation(conversation_id: str, user: dict = Depends(verify_token_middleware)):
    tenant_id = user.get("tenantId") or "system"
    doc = await _conversations_col().find_one({"tenantId": tenant_id, "conversation_id": conversation_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Conversation not found")
    # sanitize
    return {
        "conversation_id": doc.get("conversation_id"),
        "agent_name": doc.get("agent_name"),
        "messages": doc.get("messages", []),
        "uploaded_files": doc.get("uploaded_files", []),
        "session_prefix": doc.get("session_prefix"),
        "updated_at": int((doc.get("updated_at") or datetime.utcnow()).timestamp() * 1000),
        "title": doc.get("title"),
    }


@router.post("/conversations")
async def save_conversation(body: Dict[str, Any], user: dict = Depends(verify_token_middleware)):
    conversation_id = body.get("conversation_id")
    agent_name = body.get("agent_name")
    messages = body.get("messages") or []
    uploaded_files = body.get("uploaded_files") or []
    session_prefix = body.get("session_prefix") or None
    if not conversation_id or not agent_name:
        raise HTTPException(status_code=400, detail="conversation_id and agent_name are required")

    tenant_id = user.get("tenantId") or "system"
    user_id = user.get("id") or user.get("userId") or "unknown"
    title = None
    for m in messages:
        if m.get("role") == "user":
            title = (m.get("content") or "").strip()[:80]
            break
    record = {
        "tenantId": tenant_id,
        "userId": user_id,
        "conversation_id": conversation_id,
        "agent_name": agent_name,
        "messages": messages,
        "uploaded_files": uploaded_files,
        "session_prefix": session_prefix,
        "title": title,
        "updated_at": datetime.utcnow(),
    }
    existing = await _conversations_col().find_one({"tenantId": tenant_id, "conversation_id": conversation_id})
    if existing:
        await _conversations_col().update_one({"_id": existing["_id"]}, {"$set": record})
    else:
        record["created_at"] = datetime.utcnow()
        await _conversations_col().insert_one(record)
    return {"message": "saved"}


@router.delete("/conversations/{conversation_id}")
async def delete_conversation(conversation_id: str, user: dict = Depends(verify_token_middleware)):
    tenant_id = user.get("tenantId") or "system"
    res = await _conversations_col().delete_one({"tenantId": tenant_id, "conversation_id": conversation_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"message": "deleted"}
