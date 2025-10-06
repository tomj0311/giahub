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
from fastapi import APIRouter, Depends, HTTPException, status, Query, Form, File, UploadFile
from fastapi.responses import StreamingResponse

from ..utils.auth import verify_token_middleware
from ..utils.log import logger
from ..utils.mongo_storage import MongoStorageService
from ..services.agent_service import AgentService
from ..services.agent_runtime_service import AgentRuntimeService
from ..services.file_service import FileService

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
async def run_agent(
    agent_name: str = Form(...),
    prompt: str = Form(...),
    conv_id: Optional[str] = Form(None),
    files: List[UploadFile] = File(default=[]),
    user: dict = Depends(verify_token_middleware)
):
    """Stream agent responses using Server-Sent Events with optional file uploads.

    Form data:
    - agent_name: Name of the agent to run
    - prompt: User prompt/message
    - conv_id: Optional conversation ID
    - files: Optional list of files to upload
    """
    agent_name = agent_name.strip()
    prompt = prompt.strip()
    
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
    
    # Handle file uploads if provided
    uploaded_file_names = []
    if files and len(files) > 0:
        # Filter out empty files
        valid_files = [f for f in files if f.filename and f.size > 0]
        
        if valid_files:
            logger.info(f"[AGENT_RUNTIME] Processing {len(valid_files)} uploaded files")
            
            # Use conversation ID as collection name for file storage
            collection_name = conv_id or f"conv_{uuid.uuid4()}"
            if not conv_id:
                conv_id = collection_name
            
            try:
                # Upload files using FileService
                for file in valid_files:
                    file_info = await FileService.upload_file_to_storage(
                        file=file,
                        tenant_id=tenant_id,
                        user_id=user_id,
                        collection=collection_name
                    )
                    uploaded_file_names.append(file_info["filename"])
                    logger.info(f"[AGENT_RUNTIME] Successfully uploaded file: {file_info['filename']}")
                
                logger.info(f"[AGENT_RUNTIME] All files uploaded successfully: {uploaded_file_names}")
                
            except Exception as e:
                logger.error(f"[AGENT_RUNTIME] File upload failed: {str(e)}")
                raise HTTPException(
                    status_code=500, 
                    detail=f"File upload failed: {str(e)}"
                )
    
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
    sort_order: str = Query("desc", regex="^(asc|desc)$", description="Sort order"),
    agent_name: Optional[str] = Query(None, description="Filter by agent name")
):
    """List conversations for current tenant with pagination and sorting."""
    # CRITICAL: tenant_id is required - no fallbacks allowed
    tenant_id = user.get("tenantId")
    
    if not tenant_id:
        logger.error(f"[AGENT_RUNTIME] CRITICAL: No tenant ID found in user object: {user}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User tenant information missing. Please re-login."
        )
    
    try:
        logger.info(f"[CONVERSATIONS] Fetching conversations - page: {page}, page_size: {page_size}, tenant: {tenant_id}, agent_name: {agent_name}")
        
        # Calculate pagination
        skip = (page - 1) * page_size
        logger.info(f"[CONVERSATIONS] Pagination - skip: {skip}, limit: {page_size}")
        
        # Build filter
        filter_dict = {}
        if agent_name:
            filter_dict["agent_name"] = agent_name
        
        # Get total count first for debugging
        total_count = await MongoStorageService.count_documents("conversations", filter_dict, tenant_id=tenant_id)
        logger.info(f"[CONVERSATIONS] Total conversations found: {total_count}")
        
        if total_count == 0:
            logger.warning(f"[CONVERSATIONS] No conversations found for tenant {tenant_id}")
        
        # Calculate pagination info
        total_pages = (total_count + page_size - 1) // page_size  # Ceiling division
        has_next = page < total_pages
        has_prev = page > 1
        
        # Determine sort order
        sort_direction = -1 if sort_order == "desc" else 1
        
        # Get paginated results
        docs = await MongoStorageService.find_many(
            "conversations", 
            filter_dict=filter_dict, 
            tenant_id=tenant_id, 
            sort_field=sort_by,
            sort_order=sort_direction,
            skip=skip,
            limit=page_size
        )
        
        logger.info(f"[CONVERSATIONS] Retrieved {len(docs)} conversations from database")
        
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

        logger.info(f"[CONVERSATIONS] Returning {len(items)} conversations for page {page}")
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
        "vector_collection_name": doc.get("vector_collection_name"),
        "session_collection": doc.get("session_collection"),
        "session_prefix": doc.get("session_prefix"),
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
