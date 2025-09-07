"""
Agent Runtime routes for executing and managing agent conversations.
Handles real-time agent interactions, streaming responses, and conversation management.
"""

from __future__ import annotations

import asyncio
import json
import uuid
from datetime import datetime
from typing import List, Dict, Any, AsyncGenerator
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse

from ..utils.auth import verify_token_middleware
from ..utils.log import logger
from ..utils.mongo_storage import MongoStorageService
from ..services.agent_service import AgentService
from ..services.agent_runtime_service import AgentRuntimeService

router = APIRouter(prefix="/api/agent-runtime", tags=["agent-runtime"]) 


async def stream_agent_response(
    agent_name: str,
    prompt: str,
    session_prefix: str | None = None,
    user_id: str | None = None,
    tenant_id: str | None = None
) -> AsyncGenerator[str, None]:
    """Stream agent response using Server-Sent Events format."""
    
    # Generate correlation ID
    correlation_id = str(uuid.uuid4())
    logger.info(f"[AGENT_RUNTIME] Starting agent response stream with correlation ID: {correlation_id}")
    logger.debug(f"[AGENT_RUNTIME] Request parameters - agent: {agent_name}, session: {session_prefix}, user: {user_id}, tenant: {tenant_id}")
    
    try:
        # Create user object for service calls
        user = {"id": user_id, "userId": user_id, "tenantId": tenant_id}
        
        # Send start event
        yield f"data: {json.dumps({'type': 'agent_run_started', 'correlation_id': correlation_id, 'payload': {'file': agent_name}})}\n\n"
        
        # Execute agent using the runtime service
        async for response in AgentRuntimeService.execute_agent(
            agent_name=agent_name,
            prompt=prompt,
            user=user,
            session_prefix=session_prefix
        ):
            # Add correlation ID to response
            response['correlation_id'] = correlation_id
            
            # Send event as SSE
            yield f"data: {json.dumps(response)}\n\n"
            
    except Exception as e:
        logger.error(f"[AGENT_RUNTIME] Error in agent response stream: {e}")
        yield f"data: {json.dumps({'type': 'error', 'error': str(e), 'correlation_id': correlation_id})}\n\n"


@router.post("/run")
async def run_agent(body: Dict[str, Any], user: dict = Depends(verify_token_middleware)):
    """Stream agent responses using Server-Sent Events.

    body: { agent_name, prompt, session_prefix? | session_collection? }
    """
    agent_name = (body.get("agent_name") or body.get("file") or "").strip()
    prompt = (body.get("prompt") or "").strip()
    # Accept either key from frontend (older code uses session_collection)
    session_prefix = body.get("session_prefix") or body.get("session_collection")
    
    if not agent_name:
        raise HTTPException(status_code=400, detail="agent_name is required")
    if not prompt:
        raise HTTPException(status_code=400, detail="prompt is required")

    # CRITICAL: tenant_id is required - no fallbacks allowed
    tenant_id = user.get("tenantId")
    if not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User tenant information missing. Please re-login."
        )
    
    user_id = user.get("id") or user.get("userId")
    
    return StreamingResponse(
        stream_agent_response(
            agent_name=agent_name,
            prompt=prompt, 
            session_prefix=session_prefix,
            user_id=user_id,
            tenant_id=tenant_id
        ),
    # SSE media type so browsers treat stream correctly
    media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )


@router.get("/conversations")
async def list_conversations(user: dict = Depends(verify_token_middleware)):
    # CRITICAL: tenant_id is required - no fallbacks allowed
    tenant_id = user.get("tenantId")
    if not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User tenant information missing. Please re-login."
        )
    
    docs = await MongoStorageService.find_many(
        "conversations", 
        filter_dict={}, 
        tenant_id=tenant_id, 
        sort_field="updated_at",
        sort_order=-1
    )
    items: List[Dict[str, Any]] = []
    for d in docs:
        # Generate title from first user message, truncated to ~25 words
        title = d.get("title")
        if not title:
            messages = d.get("messages", [])
            # Find first user message
            first_user_msg = next((msg for msg in messages if msg.get("role") == "user"), None)
            if first_user_msg:
                content = first_user_msg.get("content", "")
                # Truncate to first 25 words
                words = content.split()
                if len(words) > 25:
                    title = " ".join(words[:25]) + "..."
                else:
                    title = content
            else:
                title = "Conversation"
        
        items.append({
            "conversation_id": d.get("conversation_id"),
            "title": title,
            "agent_name": d.get("agent_name"),
            "updated_at": int((d.get("updated_at") or datetime.utcnow()).timestamp() * 1000),
        })
    return {"conversations": items}


@router.get("/conversations/{conversation_id}")
async def get_conversation(conversation_id: str, user: dict = Depends(verify_token_middleware)):
    # CRITICAL: tenant_id is required - no fallbacks allowed
    tenant_id = user.get("tenantId")
    if not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User tenant information missing. Please re-login."
        )
    
    doc = await MongoStorageService.find_one(
        "conversations", 
        {"conversation_id": conversation_id}, 
        tenant_id=tenant_id
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Conversation not found")
    # sanitize
    # Provide both keys for maximum compatibility with different frontends
    session_val = doc.get("session_prefix") or doc.get("session_collection")
    return {
        "conversation_id": doc.get("conversation_id"),
        "agent_name": doc.get("agent_name"),
        "messages": doc.get("messages", []),
        "uploaded_files": doc.get("uploaded_files", []),
        "session_prefix": session_val,
        "session_collection": session_val,
        "updated_at": int((doc.get("updated_at") or datetime.utcnow()).timestamp() * 1000),
        "title": doc.get("title"),
    }


@router.post("/conversations")
async def save_conversation(body: Dict[str, Any], user: dict = Depends(verify_token_middleware)):
    """Save conversation to MongoDB."""
    conversation_id = body.get("conversation_id") or str(uuid.uuid4())
    messages = body.get("messages", [])
    uploaded_files = body.get("uploaded_files", [])
    # Accept either key and persist under both for now
    session_prefix = body.get("session_prefix") or body.get("session_collection") or ""
    agent_name = body.get("agent_name", "")
    
    # CRITICAL: tenant_id is required - no fallbacks allowed
    tenant_id = user.get("tenantId")
    if not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User tenant information missing. Please re-login."
        )
    
    user_id = user.get("id") or user.get("userId") or "unknown"
    
    # Accept frontend structure as-is and only add required backend fields
    record = dict(body)  # Preserve original structure
    record.update({
        "tenantId": tenant_id,
        "userId": user_id,
        "conversation_id": conversation_id,
        "updated_at": datetime.utcnow(),
        # Store both field names for transitional compatibility
        "session_prefix": session_prefix,
        "session_collection": session_prefix,
    })
    
    existing = await MongoStorageService.find_one(
        "conversations", 
        {"conversation_id": conversation_id}, 
        tenant_id=tenant_id
    )
    if existing:
        await MongoStorageService.update_one(
            "conversations",
            {"conversation_id": conversation_id},
            record,
            tenant_id=tenant_id
        )
    else:
        record["created_at"] = datetime.utcnow()
        await MongoStorageService.insert_one("conversations", record, tenant_id=tenant_id)
    return {"message": "saved"}


@router.delete("/conversations/{conversation_id}")
async def delete_conversation(conversation_id: str, user: dict = Depends(verify_token_middleware)):
    # CRITICAL: tenant_id is required - no fallbacks allowed
    tenant_id = user.get("tenantId")
    if not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User tenant information missing. Please re-login."
        )
    
    deleted = await MongoStorageService.delete_one(
        "conversations",
        {"conversation_id": conversation_id},
        tenant_id=tenant_id
    )
    if not deleted:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"message": "deleted"}
