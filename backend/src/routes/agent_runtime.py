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
from ..services.vector_service import VectorService

router = APIRouter(prefix="/api/agent-runtime", tags=["agent-runtime"]) 


async def stream_agent_response(
    agent_name: str,
    prompt: str,
    conv_id: str | None = None,
    user_id: str | None = None,
    tenant_id: str | None = None
) -> AsyncGenerator[str, None]:
    """Stream agent response using Server-Sent Events format.
    
    Designed for non-blocking concurrent execution across multiple users.
    Uses asyncio.sleep(0) to yield control back to the event loop.
    """
    
    correlation_id = str(uuid.uuid4())
    
    try:
        user = {"id": user_id, "userId": user_id, "tenantId": tenant_id}
        
        yield f"data: {json.dumps({'type': 'agent_run_started', 'correlation_id': correlation_id, 'payload': {'file': agent_name}})}\n\n"
        
        # Yield control to allow other requests to be processed
        await asyncio.sleep(0)
        
        async for response in AgentRuntimeService.execute_agent(
            agent_name=agent_name,
            prompt=prompt,
            user=user,
            conv_id=conv_id
        ):
            response['correlation_id'] = correlation_id
            
            yield f"data: {json.dumps(response)}\n\n"
            
            # Critical: yield control after each chunk to prevent blocking
            await asyncio.sleep(0)
            
    except Exception as e:
        logger.error(f"Error in agent response stream: {e}")
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
    
    This endpoint is designed for concurrent multi-user access with non-blocking async execution.

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
    
    logger.info(f"[AGENT_RUN] Starting agent '{agent_name}' for user {user_id} (tenant: {tenant_id})")
    
    # Handle file uploads if provided (completely optional)
    uploaded_file_names = []
    if files:
        # Filter out empty files safely
        valid_files = []
        for f in files:
            if f and hasattr(f, 'filename') and f.filename and hasattr(f, 'size') and f.size > 0:
                valid_files.append(f)
        
        if valid_files:
            collection_name = conv_id or f"conv_{uuid.uuid4()}"
            if not conv_id:
                conv_id = collection_name
            
            try:
                # Process file uploads asynchronously without blocking
                async def process_file_upload():
                    for file in valid_files:
                        file_info = await FileService.upload_file_to_storage(
                            file=file,
                            tenant_id=tenant_id,
                            user_id=user_id,
                            collection=collection_name
                        )
                        uploaded_file_names.append(file_info["filename"])
                    
                    try:
                        model_id = None
                        try:
                            agent_doc = await AgentService.get_agent_by_name(agent_name, user)
                            if agent_doc and "model" in agent_doc and isinstance(agent_doc["model"], dict):
                                model_id = agent_doc["model"].get("id")
                        except Exception as e:
                            logger.error(f"Failed to get agent config: {str(e)}")
                        
                        vector_payload = {
                            "collection": collection_name,
                        }
                        
                        if model_id:
                            vector_payload["model_id"] = model_id
                        
                        await VectorService.index_knowledge_files(
                            user=user,
                            collection=collection_name,
                            payload=vector_payload
                        )
                            
                    except Exception as e:
                        logger.error(f"Vector indexing failed: {str(e)}")
                
                # Wait for file processing to complete before streaming
                await process_file_upload()
                    
            except Exception as e:
                logger.error(f"File upload failed: {str(e)}")
                raise HTTPException(
                    status_code=500, 
                    detail=f"File upload failed: {str(e)}"
                )
    
    # Return streaming response immediately - this allows concurrent requests
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
            "X-Accel-Buffering": "no",  # Disable nginx buffering for SSE
        }
    )


@router.get("/debug/conversations")
async def debug_conversations(user: dict = Depends(verify_token_middleware)):
    """Debug endpoint to check conversations and user info."""
    tenant_id = user.get("tenantId")
    
    try:
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
    agent_name: Optional[str] = Query(None, description="Filter by agent name"),
    user_id: Optional[str] = Query(None, description="Filter by user ID (admin only)"),
    username: Optional[str] = Query(None, description="Filter by username (admin only)"),
    email: Optional[str] = Query(None, description="Filter by email (admin only)")
):
    """List conversations for current user with pagination and sorting."""
    # CRITICAL: tenant_id is required - no fallbacks allowed
    tenant_id = user.get("tenantId")
    current_user_id = user.get("id") or user.get("userId")
    current_username = user.get("username")
    current_email = user.get("email")
    
    if not tenant_id:
        logger.error(f"[AGENT_RUNTIME] CRITICAL: No tenant ID found in user object: {user}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User tenant information missing. Please re-login."
        )
    
    try:
        logger.info(f"[CONVERSATIONS] Fetching conversations - page: {page}, page_size: {page_size}, tenant: {tenant_id}, agent_name: {agent_name}, current_user: {current_user_id}")
        
        # Calculate pagination
        skip = (page - 1) * page_size
        logger.info(f"[CONVERSATIONS] Pagination - skip: {skip}, limit: {page_size}")
        
        # Build filter - ALWAYS filter by current user for security
        filter_dict = {}
        
        # Add agent name filter if specified
        if agent_name:
            filter_dict["agent_name"] = agent_name
        
        # SECURITY: Always filter by current user's identity unless admin override
        # Check if admin is trying to filter by different user (admin functionality)
        is_admin_override = (user_id or username or email) and any([user_id, username, email])
        
        if is_admin_override:
            # Admin override - filter by specified user (implement admin check if needed)
            if user_id:
                filter_dict["userId"] = user_id
            elif username:
                filter_dict["username"] = username
            elif email:
                filter_dict["email"] = email
            logger.info(f"[CONVERSATIONS] Admin override - filtering by specified user")
        else:
            # Normal user - filter by current user's identity
            if current_user_id:
                filter_dict["userId"] = current_user_id
            elif current_username:
                filter_dict["username"] = current_username
            elif current_email:
                filter_dict["email"] = current_email
            else:
                logger.warning(f"[CONVERSATIONS] No user identification found for filtering: {user}")
                # Still continue but conversations won't be properly filtered by user
        
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
    current_user_id = user.get("id") or user.get("userId")
    
    if not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User tenant information missing. Please re-login."
        )
    
    # Build filter to ensure user can only access their own conversations
    filter_dict = {"conversation_id": conversation_id}
    if current_user_id:
        filter_dict["userId"] = current_user_id
    
    doc = await MongoStorageService.find_one(
        "conversations", 
        filter_dict, 
        tenant_id=tenant_id
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Conversation not found or access denied")
    # sanitize
    conv_id = doc.get("conv_id") or doc.get("conversation_id")
    return {
        "conversation_id": doc.get("conversation_id"),
        "agent_name": doc.get("agent_name"),
        "messages": doc.get("messages", []),
        "message_audio": doc.get("message_audio", {}),
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
    current_user_id = user.get("id") or user.get("userId")
    
    if not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User tenant information missing. Please re-login."
        )
    
    # Build filter to ensure user can only delete their own conversations
    filter_dict = {"conversation_id": conversation_id}
    if current_user_id:
        filter_dict["userId"] = current_user_id
    
    deleted = await MongoStorageService.delete_one(
        "conversations",
        filter_dict,
        tenant_id=tenant_id
    )
    if not deleted:
        raise HTTPException(status_code=404, detail="Conversation not found or access denied")
    return {"message": "deleted"}
