import asyncio
import ast
import importlib
import json
import os
import uuid
import base64
from typing import Dict, Any, Optional, AsyncGenerator, List
from datetime import datetime
from fastapi import HTTPException, status
from ..utils.log import logger
from ..utils.mongo_storage import MongoStorageService
from .agent_service import AgentService
from .file_service import FileService

def module_loader(module_path: str):
    if not module_path:
        return None
    try:
        module = importlib.import_module(module_path)
        module_file = getattr(module, "__file__", None)
        class_name = None
        if module_file and module_file.endswith(".py"):
            with open(module_file, 'r', encoding='utf-8') as file:
                tree = ast.parse(file.read())
            for node in ast.walk(tree):
                if isinstance(node, ast.ClassDef):
                    class_name = node.name
                    break
        if class_name:
            logger.info(f"module_loader found class {class_name} in {module_path}")
            return getattr(module, class_name)
        else:
            logger.error(f"module_loader could not find any class in {module_path}")
    except Exception as e:
        logger.error(f"module_loader failed for {module_path}: {e}")
    return None

def _create_multi_collection_retriever(collection_names: list = None, conv_id: str = None, embedder = None):
    """Create a custom retriever that searches across multiple collections"""
    def multi_collection_retriever(agent, query: str, num_documents: int = None, **kwargs):
        """Custom retriever that searches across multiple existing collections"""
        from typing import List, Dict, Any
        
        # List of collections to search
        collections_to_search = []
        
        # Add all collection names from the list
        if collection_names:
            collections_to_search.extend(collection_names)
        
        # Add conv_id collection if provided
        if conv_id:
            collections_to_search.append(conv_id)
        
        if not collections_to_search:
            return None
        
        all_results = []
        
        for collection in collections_to_search:
            try:
                # Create vector DB connection for this collection
                from ai.vectordb.qdrant import Qdrant
                
                # Get Qdrant configuration from environment variables
                qdrant_host = os.getenv('QDRANT_HOST', 'localhost')
                qdrant_port = int(os.getenv('QDRANT_PORT', 8805))
                
                vector_db = Qdrant(
                    collection=collection,
                    host=qdrant_host,
                    port=qdrant_port,
                    embedder=embedder
                )
                
                # Check if collection exists
                if vector_db.exists():
                    # Search this collection
                    results = vector_db.search(query=query, limit=num_documents or 5)
                    # Convert to dict format and add collection info
                    for doc in results:
                        doc_dict = doc.to_dict()
                        doc_dict['source_collection'] = collection  # Track which collection
                        all_results.append(doc_dict)
                else:
                    logger.warning(f'retriever.collection_not_found: collection={collection} does not exist, skipping')
                        
            except Exception as e:
                if "404" in str(e) or "not found" in str(e).lower():
                    logger.warning(f'retriever.collection_not_found: collection={collection}, error={str(e)}')
                else:
                    logger.error(f'retriever.collection_search_error: collection={collection}, error={str(e)}')
                continue
        
        # Sort by relevance score and limit results
        if num_documents:
            all_results = all_results[:num_documents]
        
        return all_results if all_results else None
    
    return multi_collection_retriever

class AgentRuntimeService:
    
    @classmethod
    async def _search_images_for_agent(cls, user: Dict[str, Any], conv_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """Search for images in MinIO for the agent to use"""
        images = []
        
        try:
            # Image file extensions to search for
            image_extensions = {'.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.tiff', '.ico'}
            
            # Build search paths
            search_paths = []
            user_id = user.get("id")
            tenant_id = user.get("tenantId")
            
            if conv_id and user_id:
                # Search only for conversation-specific images
                conv_path = f"uploads/{user_id}/{conv_id}/"
                search_paths.append(conv_path)
            
            if not search_paths:
                logger.debug("[AGENT] No search paths configured for image search")
                return images
            
            # Get MinIO base URL for image URLs
            minio_host = os.getenv('MINIO_HOST', 'localhost')
            minio_port = os.getenv('MINIO_PORT', '8803')
            minio_secure = os.getenv('MINIO_SECURE', 'false').lower() == 'true'
            protocol = 'https' if minio_secure else 'http'
            minio_base_url = f"{protocol}://{minio_host}:{minio_port}"
            
            logger.info(f"[AGENT] Searching for images in paths: {search_paths}")
            
            for prefix in search_paths:
                logger.debug(f"[AGENT] Checking images in prefix: {prefix}")
                try:
                    # List all files in this path using FileService
                    file_list = await FileService.list_files_at_path(prefix)
                    
                    for file_path in file_list:
                        logger.debug(f"[AGENT] Found file: {file_path}")
                        
                        # Check if it's an image file
                        file_ext = os.path.splitext(file_path.lower())[1]
                        if file_ext in image_extensions:
                            logger.info(f"[AGENT] Found image: {file_path} (type: {file_ext})")
                            
                            # Create full URL for the image
                            # Check if file_path already starts with 'uploads/' to avoid double 'uploads/'
                            if file_path.startswith('uploads/'):
                                image_url = f"{minio_base_url}/{file_path}"
                            else:
                                image_url = f"{minio_base_url}/uploads/{file_path}"
                            
                            # Try to download and get base64 data
                            base_64_image = None
                            try:
                                image_data = await FileService.get_file_content_from_path(file_path)
                                base_64_image = base64.b64encode(image_data).decode("utf-8")
                                logger.debug(f"[AGENT] Downloaded base64 data for {file_path}, length: {len(base_64_image)}")
                            except Exception as e:
                                logger.warning(f"[AGENT] Failed to download image {file_path}: {e}")
                            
                            # Create simple image dict (since we don't need the AI model)
                            # Extract meaningful alt text from path
                            path_parts = file_path.split('/')
                            if len(path_parts) >= 3:
                                source_info = f"{path_parts[-3]}/{path_parts[-2]}"  # e.g., "tenant_id/conv_id"
                            else:
                                source_info = prefix.strip('/')
                                
                            image_obj = {
                                "id": str(uuid.uuid4()),
                                "url": image_url,
                                "alt_text": f"Image from {source_info}: {os.path.basename(file_path)}",
                                "base_64_image": base_64_image
                            }
                            images.append(image_obj)
                            logger.info(f"[AGENT] Added image to agent context: {image_url} (has_base64: {bool(base_64_image)})")
                            
                except Exception as e:
                    logger.error(f"[AGENT] Error listing images in prefix {prefix}: {e}")
                    continue
                    
        except Exception as e:
            logger.error(f"[AGENT] Error in image search: {e}")
        
        logger.info(f"[AGENT] Image search complete. Found {len(images)} images")
        return images
    
    @classmethod
    async def build_agent_from_config(cls, agent_config: Dict[str, Any], user: Dict[str, Any]) -> Any:
        conv_id = agent_config.get("conv_id")
        try:
            logger.debug(f"Building new agent from config for conv_id: {conv_id}")
            
            from ai.agent.agent import Agent
            from .model_config_service import ModelConfigService
            from .tool_config_service import ToolConfigService
            from .knowledge_service import KnowledgeService
            
            # Load model configuration
            model = None
            model_ref = agent_config.get("model")
            
            if model_ref:
                try:
                    model_id = model_ref if isinstance(model_ref, str) else model_ref.get("id")
                    if model_id:
                        logger.debug(f"Loading model config for ID: {model_id}")
                        model_config = await ModelConfigService.get_model_config_by_id(model_id, user)
                        if model_config:
                            model_strategy = model_config.get("model", {}).get("strategy")
                            model_params = model_config.get("model", {}).get("params", {})
                            
                            if model_strategy:
                                model_class = module_loader(model_strategy)
                                if model_class:
                                    model = model_class(**model_params)
                                    logger.debug(f"Model created successfully")
                except Exception as e:
                    logger.warning(f"Failed to load model {model_ref}: {e}")
                    import traceback
                    logger.debug(f"Model loading traceback: {traceback.format_exc()}")
            
            # Load tools configurations
            tools = []
            tools_config = agent_config.get("tools", {})
            
            if tools_config:
                for tool_id in tools_config.keys():
                    try:
                        if tool_id:
                            tool_config = await ToolConfigService.get_tool_config_by_id(tool_id, user)
                            if tool_config:
                                tool_strategy = tool_config.get("tool", {}).get("strategy")
                                tool_params = tool_config.get("tool", {}).get("params", {})
                                if tool_strategy:
                                    tool_class = module_loader(tool_strategy)
                                    if tool_class:
                                        tool_instance = tool_class(**tool_params)
                                        tools.append(tool_instance)
                                        logger.debug(f"Tool loaded: {type(tool_instance)}")
                    except Exception as e:
                        logger.warning(f"Failed to load tool {tool_id}: {e}")
                        import traceback
                        logger.debug(f"Tool loading traceback: {traceback.format_exc()}")
            
            # Load knowledge collection names and create custom retriever
            collection_names = []
            embedder_config = None
            conv_id = agent_config.get("conv_id")
            
            logger.debug(f"Processing collections for conv_id: {conv_id}")
            
            # Handle collections object with multiple collection IDs
            collections_config = agent_config.get("collections", {})
            if collections_config:
                for collection_id in collections_config.keys():
                    try:
                        if collection_id:
                            knowledge_config = await KnowledgeService.get_collection_by_id(collection_id, user)
                            if knowledge_config:
                                vector_collection_name = knowledge_config.get("vector_collection")
                                collection_names.append(vector_collection_name)
                                logger.debug(f"Added collection: {vector_collection_name}")
                                
                    except Exception as e:
                        logger.warning(f"Failed to load knowledge collection {collection_id}: {e}")
            
            # Build embedder if config exists
            if not embedder_config and model_config.get("embedding"):
                embedder_config = model_config.get("embedding")

            embedder = None
            if embedder_config:
                try:
                    embedder_strategy = embedder_config.get("strategy")
                    embedder_params = embedder_config.get("params", {})
                    if embedder_strategy:
                        embedder_class = module_loader(embedder_strategy)
                        if embedder_class:
                            embedder = embedder_class(**embedder_params)
                            logger.debug(f"Embedder created successfully")
                except Exception as e:
                    logger.warning(f"Failed to load embedder: {e}")
            
            # Create custom retriever
            custom_retriever = None
            session_collection = f"{conv_id}_{agent_config.get('userId')}"
            if collection_names or conv_id:
                logger.debug(f"Creating custom retriever with {len(collection_names)} collections")
                custom_retriever = _create_multi_collection_retriever(collection_names, session_collection, embedder)
            
            memory_config = agent_config.get("memory", {})
            history_config = memory_config.get("history", {})
            
            logger.debug(f"Creating Agent instance...")
            
            # Use agent config as-is and add runtime-specific parameters
            kwargs = {
                **agent_config,  # Use entire agent config as-is
                "markdown": True,
                "model": model,
                "tools": tools,
                "retriever": custom_retriever,  # Use custom retriever instead of knowledge_base
                "search_knowledge": True,
                "add_context": True,
                "add_references": True,
                "resolve_context": True,
                "add_history_to_messages": False,
            }
            
            # Use conv_id directly
            if conv_id:
                kwargs["session_id"] = conv_id
            
            try:
                agent = Agent(**kwargs)
                logger.debug(f"Agent created successfully")
            except Exception as e:
                logger.error(f"Error creating Agent: {e}")
                import traceback
                logger.error(f"Agent creation traceback: {traceback.format_exc()}")
                raise
                
            logger.info(f"Created new agent for conv_id: {conv_id}")
            return agent
        except Exception as e:
            logger.error(f"Failed to build agent: {e}")
            import traceback
            logger.error(f"Build agent traceback: {traceback.format_exc()}")
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

    @classmethod
    async def run_agent_stream(cls, agent: Any, prompt: str, user: Dict[str, Any], conv_id: Optional[str] = None, cancel_event: Optional[asyncio.Event] = None, stream: bool = True) -> AsyncGenerator[Dict[str, Any], None]:
        try:
            logger.debug(f"Starting run_agent_stream with agent type: {type(agent)}")
            
            # Search for images to include with the agent run
            agent_images = await cls._search_images_for_agent(user, conv_id)
            images_for_run = []
            
            # Convert image objects to format expected by agent
            if agent_images:
                logger.debug(f"Processing {len(agent_images)} images")
                for img in agent_images:
                    if img.get('base_64_image'):
                        # Use base64 data if available
                        mime_type = "image/jpeg"  # default
                        data_url = f"data:{mime_type};base64,{img['base_64_image']}"
                        images_for_run.append(data_url)
                    elif img.get('url'):
                        # Use URL if no base64 data
                        images_for_run.append(img['url'])
                    else:
                        # Handle other formats (strings, etc)
                        images_for_run.append(str(img))
            
            logger.info(f"[AGENT] Starting run with {len(images_for_run)} images")
            
            # Run the agent with images if available
            run_kwargs = {"stream": stream}
            if images_for_run:
                run_kwargs["images"] = images_for_run
            
            # Get the streaming generator or direct response based on stream parameter
            try:
                if stream:
                    agent_generator = agent.run(prompt, **run_kwargs)
                    logger.debug(f"Agent run started successfully with streaming")
                else:
                    agent_response = agent.run(prompt, **run_kwargs)
                    logger.debug(f"Agent run started successfully without streaming")
            except Exception as e:
                logger.error(f"Error calling agent.run(): {e}")
                import traceback
                logger.error(f"Traceback: {traceback.format_exc()}")
                raise
            
            if stream:
                # Consume the generator and yield responses
                logger.debug(f"[AGENT_DEBUG] Starting to iterate over agent generator...")
                response_count = 0
                try:
                    for response in agent_generator:
                        response_count += 1
                        # Log only at significant milestones to reduce verbosity
                        if response_count % 1000 == 0:
                            logger.debug(f"[AGENT_DEBUG] Processed {response_count} responses")
                        
                        if cancel_event and cancel_event.is_set():
                            logger.info("Streaming cancelled by user.")
                            yield {"type": "cancelled", "timestamp": asyncio.get_event_loop().time()}
                            return
                        
                        raw_content = getattr(response, 'content', getattr(response, 'message', str(response)))
                        
                        # Normalize to a JSON-serializable string so the frontend always receives text
                        if isinstance(raw_content, (dict, list)):
                            try:
                                content = json.dumps(raw_content, ensure_ascii=False)
                            except Exception:
                                content = str(raw_content)
                        else:
                            content = str(raw_content)
                        
                        yield {"type": "agent_chunk", "payload": {"content": content}, "timestamp": asyncio.get_event_loop().time()}
                        await asyncio.sleep(0)
                        
                except Exception as e:
                    logger.error(f"Error iterating over agent generator at response #{response_count}: {e}")
                    import traceback
                    logger.error(f"Traceback: {traceback.format_exc()}")
                    raise
                
                logger.debug(f"[AGENT_DEBUG] Generator iteration completed. Total responses: {response_count}")
            else:
                # Handle non-streaming response
                logger.debug(f"[AGENT_DEBUG] Processing non-streaming response...")
                try:
                    if cancel_event and cancel_event.is_set():
                        logger.info("Non-streaming run cancelled by user.")
                        yield {"type": "cancelled", "timestamp": asyncio.get_event_loop().time()}
                        return
                    
                    # Extract content from the response
                    raw_content = getattr(agent_response, 'content', getattr(agent_response, 'message', str(agent_response)))
                    
                    # Normalize to a JSON-serializable string
                    if isinstance(raw_content, (dict, list)):
                        try:
                            content = json.dumps(raw_content, ensure_ascii=False)
                        except Exception:
                            content = str(raw_content)
                    else:
                        content = str(raw_content)
                    
                    # Yield the complete response
                    yield {"type": "agent_response", "payload": {"content": content}, "timestamp": asyncio.get_event_loop().time()}
                    
                except Exception as e:
                    logger.error(f"Error processing non-streaming response: {e}")
                    import traceback
                    logger.error(f"Traceback: {traceback.format_exc()}")
                    raise
            
            # At this point, the generator is exhausted and agent should have final run_response with metrics
            if hasattr(agent, 'run_response') and agent.run_response:
                logger.debug(f"Agent run completed with metrics")
            else:
                logger.debug(f"Agent completed with no run_response")
            
            logger.debug(f"[AGENT_DEBUG] Yielding agent_run_complete...")
            yield {"type": "agent_run_complete", "timestamp": asyncio.get_event_loop().time()}
            
        except Exception as e:
            logger.error(f"Error in agent run: {e}")
            import traceback
            logger.error(f"Full traceback: {traceback.format_exc()}")
            yield {"type": "error", "error": str(e), "timestamp": asyncio.get_event_loop().time()}

    @classmethod
    async def _log_agent_execution_results(cls, agent: Any, user: Dict[str, Any], agent_name: str, conv_id: Optional[str] = None):
        """Log agent execution results for audit and calculation purposes"""
        try:
            run_response = getattr(agent, 'run_response', None)
            logger.debug(f"Agent run_response exists: {run_response is not None}")
            
            if run_response:
                logger.debug(f"Run response content length: {len(str(getattr(run_response, 'content', '')))}")
                logger.debug(f"Run response content type: {getattr(run_response, 'content_type', 'None')}")
                logger.debug(f"Run response metrics type: {type(getattr(run_response, 'metrics', None))}")
                logger.debug(f"Run response metrics content: {getattr(run_response, 'metrics', None)}")
                
                run_data = {
                    "user_id": user.get("id"),
                    "agent_name": agent_name,
                    "conv_id": conv_id,
                    "completed": True
                }
                
                response_data = {
                    "content": getattr(run_response, 'content', None),
                    "content_type": getattr(run_response, 'content_type', None),
                }
                
                # Extract metrics from response and model 
                response_metrics = getattr(run_response, 'metrics', {}) or {}
                model_metrics = getattr(agent.model, 'metrics', {}) if hasattr(agent, 'model') and agent.model else {}
                
                logger.debug(f"[METRICS_DEBUG] response_metrics type: {type(response_metrics)}, value: {response_metrics}")
                logger.debug(f"[METRICS_DEBUG] model_metrics type: {type(model_metrics)}, value: {model_metrics}")
                
                # Use model metrics as primary source since response_metrics aggregation is failing
                final_metrics = {}
                if model_metrics:
                    final_metrics = dict(model_metrics)  # Convert to regular dict
                    logger.debug(f"[METRICS_DEBUG] Using model_metrics as primary source")
                elif response_metrics:
                    # Convert defaultdict to regular dict for MongoDB
                    if hasattr(response_metrics, 'default_factory'):
                        logger.debug(f"[METRICS_DEBUG] Converting response_metrics defaultdict to dict")
                        final_metrics = dict(response_metrics)
                    else:
                        final_metrics = response_metrics
                    logger.debug(f"[METRICS_DEBUG] Using response_metrics as fallback")
                
                if final_metrics:
                    response_data["metrics"] = final_metrics
                    
                    # Calculate aggregate metrics for easy querying from the final metrics
                    aggregate_metrics = {}
                    
                    # Handle total_tokens (could be direct value or list)
                    if 'total_tokens' in final_metrics:
                        total_tokens = final_metrics['total_tokens']
                        aggregate_metrics["total_tokens"] = sum(total_tokens) if isinstance(total_tokens, list) else total_tokens
                    
                    # Handle input_tokens (could be direct value or list)
                    if 'input_tokens' in final_metrics:
                        input_tokens = final_metrics['input_tokens']
                        aggregate_metrics["total_input_tokens"] = sum(input_tokens) if isinstance(input_tokens, list) else input_tokens
                    
                    # Handle output_tokens (could be direct value or list)
                    if 'output_tokens' in final_metrics:
                        output_tokens = final_metrics['output_tokens']
                        aggregate_metrics["total_output_tokens"] = sum(output_tokens) if isinstance(output_tokens, list) else output_tokens
                    
                    # Handle response_times (could be 'time' or 'response_times')
                    if 'response_times' in final_metrics:
                        response_times = final_metrics['response_times']
                        aggregate_metrics["total_response_time"] = sum(response_times) if isinstance(response_times, list) else response_times
                    elif 'time' in final_metrics:
                        time_val = final_metrics['time']
                        aggregate_metrics["total_response_time"] = sum(time_val) if isinstance(time_val, list) else time_val
                    
                    # Handle time_to_first_token
                    if 'time_to_first_token' in final_metrics:
                        ttft = final_metrics['time_to_first_token']
                        if isinstance(ttft, list) and ttft:
                            aggregate_metrics["avg_time_to_first_token"] = sum(ttft) / len(ttft)
                        elif isinstance(ttft, (int, float)):
                            aggregate_metrics["avg_time_to_first_token"] = ttft
                    
                    run_data["metrics"] = aggregate_metrics
                    logger.debug(f"[METRICS_DEBUG] Final aggregate_metrics: {aggregate_metrics}")
                else:
                    logger.warning(f"[METRICS_DEBUG] No metrics found in response or model")
                
                run_data["response"] = response_data
                
                # Store in MongoDB agent_runs collection
                tenant_id = user.get("tenantId")
                if tenant_id:
                    document_id = await MongoStorageService.insert_one(
                        collection_name="agent_runs",
                        document=run_data,
                        tenant_id=tenant_id
                    )
                    if document_id:
                        logger.info(f"Agent execution results stored in MongoDB: {document_id}")
                    else:
                        logger.error("Failed to store agent execution results in MongoDB")
                else:
                    logger.warning("No tenant_id found, cannot store agent execution results")
                
                # Also log for immediate visibility it is commnted becuase itisalraedy stored in mongo
                # logger.info(f"Agent execution completed: {json.dumps(run_data, default=str)}")
            else:
                logger.warning(f"Agent run_response is None. Agent type: {type(agent)}, Agent attributes: {dir(agent) if agent else 'None'}")
                
        except Exception as e:
            logger.error(f"Failed to log agent execution results: {e}")

    @classmethod
    async def _save_conversation_to_history(cls, conv_id: str, agent_name: str, user_prompt: str, agent_response: str, user: Dict[str, Any], completed: bool = True):
        """Save conversation to history automatically after agent execution"""
        try:
            tenant_id = user.get("tenantId")
            if not tenant_id:
                logger.warning("No tenant_id found, cannot save conversation to history")
                return
            
            user_id = user.get("id") or user.get("userId") or "unknown"
            
            # Create message objects in the same format as frontend
            user_message = {
                "role": "user",
                "content": user_prompt,
                "ts": int(datetime.utcnow().timestamp() * 1000)
            }
            
            agent_message = {
                "role": "agent", 
                "content": agent_response,
                "ts": int(datetime.utcnow().timestamp() * 1000)
            }
            
            messages = [user_message, agent_message]
            
            # Generate conversation title from first user message (same logic as frontend)
            title = None
            if user_prompt:
                words = user_prompt.strip().split()
                if len(words) > 25:
                    title = " ".join(words[:25]) + "..."
                else:
                    title = user_prompt.strip()
            
            # Check if conversation already exists
            existing = await MongoStorageService.find_one(
                "conversations", 
                {"conversation_id": conv_id}, 
                tenant_id=tenant_id
            )
            
            if existing:
                # Update existing conversation by appending new messages
                existing_messages = existing.get("messages", [])
                
                # Check if this user message already exists (to avoid duplicates)
                user_msg_exists = any(
                    msg.get("role") == "user" and msg.get("content") == user_prompt 
                    for msg in existing_messages
                )
                
                if not user_msg_exists:
                    # Append new messages to existing conversation
                    updated_messages = existing_messages + messages
                    
                    update_data = {
                        "messages": updated_messages,
                        "updated_at": datetime.utcnow(),
                        "title": title or existing.get("title", "Conversation")
                    }
                    
                    await MongoStorageService.update_one(
                        "conversations",
                        {"conversation_id": conv_id},
                        update_data,
                        tenant_id=tenant_id
                    )
                    
                    logger.info(f"Updated existing conversation {conv_id} with new messages")
                else:
                    logger.debug(f"User message already exists in conversation {conv_id}, skipping duplicate")
            else:
                # Create new conversation
                conversation_data = {
                    "conversation_id": conv_id,
                    "agent_name": agent_name,
                    "messages": messages,
                    "uploaded_files": [],
                    "conv_id": conv_id,
                    "title": title or "Conversation",
                    "tenantId": tenant_id,
                    "userId": user_id,
                    "created_at": datetime.utcnow(),
                    "updated_at": datetime.utcnow()
                }
                
                await MongoStorageService.insert_one(
                    "conversations", 
                    conversation_data, 
                    tenant_id=tenant_id
                )
                
                logger.info(f"Created new conversation {conv_id} in history")
                
        except Exception as e:
            logger.error(f"Failed to save conversation to history: {e}")

    @classmethod
    async def execute_agent(cls, agent_name: str, prompt: str, user: Dict[str, Any], conv_id: Optional[str] = None, cancel_event: Optional[asyncio.Event] = None, stream: bool = True) -> AsyncGenerator[Dict[str, Any], None]:
        agent = None
        completed = False
        agent_response_content = ""
        
        try:
            # Handle the case where agent is not found
            try:
                agent_doc = await AgentService.get_agent_by_name(agent_name, user)
            except HTTPException as http_ex:
                if http_ex.status_code == 404:
                    yield {"type": "error", "error": f"Agent '{agent_name}' not found"}
                    return
                else:
                    raise http_ex
            
            if not agent_doc:
                yield {"type": "error", "error": f"Agent '{agent_name}' not found"}
                return
                
            # Generate conversation ID if not provided
            if not conv_id:
                conv_id = f"conv_{int(datetime.utcnow().timestamp() * 1000)}"
            
            # Use agent document as-is with minimal runtime additions
            agent_config = {
                **agent_doc,  # Use entire agent document as-is
            }
            if conv_id:
                agent_config["conv_id"] = conv_id
            agent = await cls.build_agent_from_config(agent_config, user)
            
            # Stream agent responses and collect the content
            async for response in cls.run_agent_stream(agent, prompt, user, conv_id, cancel_event=cancel_event, stream=stream):
                # Collect agent response content for conversation saving
                if response.get("type") == "agent_chunk" and response.get("payload", {}).get("content"):
                    agent_response_content += response["payload"]["content"]
                elif response.get("type") == "agent_run_complete":
                    completed = True
                    
                yield response
                
        except Exception as e:
            logger.error(f"Failed to execute agent '{agent_name}': {e}")
            error_message = f"Failed to execute agent: {str(e)}"
            agent_response_content = f"Error: {error_message}"
            yield {"type": "error", "error": error_message}
        finally:
            # Automatically save conversation to history when execution completes
            if conv_id and prompt.strip():
                await cls._save_conversation_to_history(
                    conv_id=conv_id,
                    agent_name=agent_name,
                    user_prompt=prompt,
                    agent_response=agent_response_content,
                    user=user,
                    completed=completed
                )
            
            # Log results after execution completion
            if completed and agent:
                await cls._log_agent_execution_results(agent, user, agent_name, conv_id)
