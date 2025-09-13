"""
Agent Runtime routes for executing and man        async for chunk in AgentRuntimeService.execute_agent(
            agent_name=agent_name,
            prompt=prompt,
            user=user,
            conv_id=conv_id
        ):agent conversations.
Handles real-time agent interactions, streaming responses, and conversation management.
"""

from __future__ import annotations

import asyncio
import json
import uuid
from datetime import datetime
from typing import List, Dict, Any, AsyncGenerator, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
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
    conv_id: str | None = None,
    user_id: str | None = None,
    tenant_id: str | None = None
) -> AsyncGenerator[str, None]:
    """Stream agent response using Server-Sent Events format."""
    
    # Generate correlation ID
    correlation_id = str(uuid.uuid4())
    logger.info(f"[AGENT_RUNTIME] Starting agent response stream with correlation ID: {correlation_id}")
    logger.debug(f"[AGENT_RUNTIME] Request parameters - agent: {agent_name}, conv_id: {conv_id}, user: {user_id}, tenant: {tenant_id}")
    
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
            conv_id=conv_id
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

    body: { agent_name, prompt, conv_id }
    """
    agent_name = (body.get("agent_name") or body.get("file") or "").strip()
    prompt = (body.get("prompt") or "").strip()
    # Get conversation ID from frontend
    conv_id = body.get("conv_id") or body.get("session_collection")
    
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
            conv_id=conv_id,
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


@router.get("/debug/conversations")
async def debug_conversations(user: dict = Depends(verify_token_middleware)):
    """Debug endpoint to check conversations and user info."""
    tenant_id = user.get("tenantId")
    user_id = user.get("id") or user.get("userId")
    
    logger.info(f"[DEBUG] User object: {user}")
    logger.info(f"[DEBUG] Tenant ID: {tenant_id}")
    logger.info(f"[DEBUG] User ID: {user_id}")
    
    try:
        # Check total conversations without tenant filtering
        from ..utils.mongo_storage import MongoStorageService
        collections = MongoStorageService._get_collections()
        conversations_collection = collections.get("conversations")
        
        if conversations_collection is not None:
            total_all = await conversations_collection.count_documents({})
            all_docs = await conversations_collection.find({}).limit(5).to_list(5)
            
            if tenant_id:
                total_tenant = await conversations_collection.count_documents({"tenantId": tenant_id})
                tenant_docs = await conversations_collection.find({"tenantId": tenant_id}).limit(5).to_list(5)
            else:
                total_tenant = 0
                tenant_docs = []
            
            logger.info(f"[DEBUG] Total conversations: {total_all}")
            logger.info(f"[DEBUG] Tenant conversations: {total_tenant}")
            logger.info(f"[DEBUG] Sample all docs: {[{k: v for k, v in doc.items() if k != '_id'} for doc in all_docs[:2]]}")
            logger.info(f"[DEBUG] Sample tenant docs: {[{k: v for k, v in doc.items() if k != '_id'} for doc in tenant_docs[:2]]}")
            
            return {
                "user": user,
                "tenant_id": tenant_id,
                "total_conversations": total_all,
                "tenant_conversations": total_tenant,
                "sample_all": [str(doc.get("conversation_id", "NO_ID")) for doc in all_docs],
                "sample_tenant": [str(doc.get("conversation_id", "NO_ID")) for doc in tenant_docs]
            }
        else:
            return {"error": "Conversations collection not found"}
            
    except Exception as e:
        logger.error(f"[DEBUG] Debug query failed: {e}")
        return {"error": str(e)}


@router.get("/conversations")
async def list_conversations(
    user: dict = Depends(verify_token_middleware),
    page: int = Query(1, ge=1, description="Page number (1-based)"),
    page_size: int = Query(10, ge=1, le=100, description="Items per page"),
    sort_by: str = Query("updated_at", description="Sort field"),
    sort_order: str = Query("desc", regex="^(asc|desc)$", description="Sort order")
):
    """List conversations for current tenant with pagination and sorting."""
    # CRITICAL: tenant_id is required - no fallbacks allowed
    tenant_id = user.get("tenantId")
    logger.info(f"[AGENT_RUNTIME] List conversations request - user: {user.get('id', 'NO_ID')}, tenant: {tenant_id}")
    
    if not tenant_id:
        logger.error(f"[AGENT_RUNTIME] CRITICAL: No tenant ID found in user object: {user}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User tenant information missing. Please re-login."
        )
    
    logger.info(f"[AGENT_RUNTIME] Listing conversations for tenant - page: {page}, size: {page_size}")
    
    try:
        # DEBUG: Check total conversations in database (without tenant filter)
        try:
            from ..utils.mongo_storage import MongoStorageService
            collections = MongoStorageService._get_collections()
            conversations_collection = collections.get("conversations")
            if conversations_collection is not None:
                total_all_conversations = await conversations_collection.count_documents({})
                total_tenant_conversations = await conversations_collection.count_documents({"tenantId": tenant_id})
                logger.info(f"[AGENT_RUNTIME] DEBUG: Total conversations in DB: {total_all_conversations}, for tenant {tenant_id}: {total_tenant_conversations}")
            else:
                logger.warning(f"[AGENT_RUNTIME] DEBUG: Conversations collection not found")
        except Exception as debug_e:
            logger.error(f"[AGENT_RUNTIME] DEBUG query failed: {debug_e}")
        
        # Calculate pagination
        skip = (page - 1) * page_size
        
        # Get total count first for debugging
        total_count = await MongoStorageService.count_documents("conversations", {}, tenant_id=tenant_id)
        logger.info(f"[AGENT_RUNTIME] Total conversations count: {total_count} for tenant: {tenant_id}")
        
        if total_count == 0:
            logger.warning(f"[AGENT_RUNTIME] WARNING: No conversations found for tenant {tenant_id}. Check tenant ID or data.")
        
        # Calculate pagination info
        total_pages = (total_count + page_size - 1) // page_size  # Ceiling division
        has_next = page < total_pages
        has_prev = page > 1
        
        # Determine sort order
        sort_direction = -1 if sort_order == "desc" else 1
        
        logger.info(f"[AGENT_RUNTIME] Pagination: page={page}, size={page_size}, skip={skip}, total={total_count}, pages={total_pages}")
        
        # Get paginated results
        docs = await MongoStorageService.find_many(
            "conversations", 
            filter_dict={}, 
            tenant_id=tenant_id, 
            sort_field=sort_by,
            sort_order=sort_direction,
            skip=skip,
            limit=page_size
        )
        
        logger.info(f"[AGENT_RUNTIME] Retrieved {len(docs)} conversations from database")
        
        if len(docs) == 0 and total_count > 0:
            logger.error(f"[AGENT_RUNTIME] CRITICAL: Found {total_count} conversations but query returned 0. Pagination or filtering issue!")
        
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
            
            # Handle updated_at timestamp conversion safely
            updated_at = d.get("updated_at")
            if updated_at:
                try:
                    if hasattr(updated_at, 'timestamp'):
                        # It's a datetime object
                        timestamp = int(updated_at.timestamp() * 1000)
                    else:
                        # It might already be a timestamp
                        timestamp = int(updated_at)
                except:
                    timestamp = int(datetime.utcnow().timestamp() * 1000)
            else:
                timestamp = int(datetime.utcnow().timestamp() * 1000)
            
            items.append({
                "conversation_id": d.get("conversation_id"),
                "title": title,
                "agent_name": d.get("agent_name"),
                "updated_at": timestamp,
            })
        
        result = {
            "conversations": items,
            "pagination": {
                "page": page,
                "page_size": page_size,
                "total": total_count,
                "total_pages": total_pages,
                "has_next": has_next,
                "has_prev": has_prev
            }
        }

        logger.info(f"[AGENT_RUNTIME] Final result: {len(items)} conversations returned, total: {total_count}, page: {page}/{total_pages}")
        logger.info(f"[AGENT_RUNTIME] Response structure: conversations={len(result['conversations'])}, pagination_keys={list(result['pagination'].keys())}")
        
        # Log first conversation for debugging
        if items:
            first_conv = items[0]
            logger.info(f"[AGENT_RUNTIME] Sample conversation: id={first_conv.get('conversation_id')}, title='{first_conv.get('title', '')[:50]}...', agent={first_conv.get('agent_name')}")
        
        return result
        
    except Exception as e:
        logger.error(f"[AGENT_RUNTIME] Error listing conversations: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve conversations")


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
    conv_id = doc.get("conv_id") or doc.get("conversation_id")
    return {
        "conversation_id": doc.get("conversation_id"),
        "agent_name": doc.get("agent_name"),
        "messages": doc.get("messages", []),
        "uploaded_files": doc.get("uploaded_files", []),
        "conv_id": conv_id,
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
    conv_id = body.get("conv_id") or body.get("conversation_id") or ""
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
        "conv_id": conv_id,
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
