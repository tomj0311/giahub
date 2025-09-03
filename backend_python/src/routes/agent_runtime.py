from __future__ import annotations

import asyncio
import json
import uuid
from datetime import datetime
from typing import List, Dict, Any, AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from ..db import get_collections
from ..utils.auth import verify_token_middleware
from ..utils.agent_runtime import AgentRunManager, RunCallbacks
from ..utils.log import logger

router = APIRouter(prefix="/api/agent-runtime", tags=["agent-runtime"]) 

# Global agent manager instance
agent_manager = AgentRunManager(agents_dir="")  # Not using filesystem

def _conversations_col():
    return get_collections()["conversations"]

def _agents_col():
    return get_collections()["agents"]


async def stream_agent_response(
    agent_name: str, 
    prompt: str, 
    session_prefix: str = None,
    user_id: str = None,
    tenant_id: str = None
) -> AsyncGenerator[str, None]:
    """Stream agent response using Server-Sent Events format."""
    
    # Generate correlation ID
    correlation_id = str(uuid.uuid4())
    
    # Load agent configuration from database
    try:
        agent_doc = await _agents_col().find_one({
            "tenantId": tenant_id,
            "name": agent_name
        })
        
        if not agent_doc:
            yield f"data: {json.dumps({'error': f'Agent {agent_name} not found'})}\n\n"
            return
            
        # Get agent configuration
        agent_config = agent_doc.get('config', {})
        
        # Add session collection if provided
        if session_prefix:
            agent_config['session_collection'] = session_prefix
        
        # Build the agent
        agent = agent_manager.build_agent_from_config(agent_config, user_id)
        
        # Create event queue for streaming
        event_queue = asyncio.Queue()
        stream_complete = asyncio.Event()
        
        def send_event(event_type: str, payload: Any, corr_id: str = None):
            """Send event to the stream queue."""
            try:
                event_data = {
                    'type': event_type,
                    'payload': payload,
                    'correlation_id': corr_id
                }
                asyncio.create_task(event_queue.put(event_data))
            except Exception as e:
                logger.error(f"Error sending event: {e}")
        
        def send_error(event_type: str, corr_id: str, status_code: int, details: Dict[str, Any]):
            """Send error event to the stream queue."""
            error_data = {
                'type': 'error',
                'error': event_type,
                'correlation_id': corr_id,
                'status_code': status_code,
                'details': details
            }
            asyncio.create_task(event_queue.put(error_data))
            asyncio.create_task(event_queue.put(None))  # Signal completion
        
        # Create callbacks
        callbacks = RunCallbacks(send=send_event, send_error=send_error)
        
        # Start agent run in background
        def run_complete_callback():
            asyncio.create_task(event_queue.put(None))  # Signal completion
        
        # Override the callbacks to signal completion
        original_send = callbacks.send
        def enhanced_send(event_type: str, payload: Any, corr_id: str = None):
            original_send(event_type, payload, corr_id)
            if event_type in ['agent_run_complete', 'agent_run_cancelled']:
                run_complete_callback()
        
        callbacks.send = enhanced_send
        
        # Start the agent run
        try:
            yield f"data: {json.dumps({'type': 'agent_run_started', 'correlation_id': correlation_id, 'payload': {'file': agent_name}})}\n\n"
            
            agent_manager.start_run(
                correlation_id=correlation_id,
                agent=agent,
                prompt=prompt,
                callbacks=callbacks
            )
            
            # Stream events as they come
            while True:
                try:
                    # Wait for next event with timeout
                    event = await asyncio.wait_for(event_queue.get(), timeout=30.0)
                    
                    if event is None:  # Completion signal
                        break
                        
                    # Send event as SSE
                    yield f"data: {json.dumps(event)}\n\n"
                    
                except asyncio.TimeoutError:
                    # Send keepalive
                    yield f"data: {json.dumps({'type': 'keepalive'})}\n\n"
                    continue
                    
        except Exception as e:
            logger.error(f"Error in agent run: {e}")
            yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"
            
    except Exception as e:
        logger.error(f"Error loading agent {agent_name}: {e}")
        yield f"data: {json.dumps({'error': f'Failed to load agent: {str(e)}'})}\n\n"


@router.post("/run")
async def run_agent(body: Dict[str, Any], user: dict = Depends(verify_token_middleware)):
    """Stream agent responses using Server-Sent Events.

    body: { agent_name, prompt, session_prefix? }
    """
    agent_name = (body.get("agent_name") or body.get("file") or "").strip()
    prompt = (body.get("prompt") or "").strip()
    session_prefix = body.get("session_prefix")
    
    if not agent_name:
        raise HTTPException(status_code=400, detail="agent_name is required")
    if not prompt:
        raise HTTPException(status_code=400, detail="prompt is required")

    tenant_id = user.get("tenantId") or "system"
    user_id = user.get("id") or user.get("userId")
    
    return StreamingResponse(
        stream_agent_response(
            agent_name=agent_name,
            prompt=prompt, 
            session_prefix=session_prefix,
            user_id=user_id,
            tenant_id=tenant_id
        ),
        media_type="text/plain",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )


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
