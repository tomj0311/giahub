import asyncio
import ast
import importlib
import json
import os
from typing import Dict, Any, Optional, AsyncGenerator
from fastapi import HTTPException, status
from ..utils.log import logger
from .agent_service import AgentService

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

def _create_multi_collection_retriever(collection_names: list = None, session_collection: str = None, embedder = None):
    """Create a custom retriever that searches across multiple collections"""
    def multi_collection_retriever(agent, query: str, num_documents: int = None, **kwargs):
        """Custom retriever that searches across multiple existing collections"""
        from typing import List, Dict, Any
        
        # List of collections to search
        collections_to_search = []
        
        # Add all collection names from the list
        if collection_names:
            collections_to_search.extend(collection_names)
        
        # Add session collection if provided
        if session_collection:
            collections_to_search.append(session_collection)
        
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
                        
            except Exception as e:
                logger.error(f'retriever.collection_search_error: collection={collection}, error={str(e)}')
                continue
        
        # Sort by relevance score and limit results
        if num_documents:
            all_results = all_results[:num_documents]
        
        return all_results if all_results else None
    
    return multi_collection_retriever

class AgentRuntimeService:
    # Simple cache to store agents by session_id
    _agents = {}
    
    @staticmethod
    async def build_agent_from_config(agent_config: Dict[str, Any], user: Dict[str, Any]) -> Any:
        # Check if we already have this agent for this session
        session_id = agent_config.get("session_collection")
        if session_id and session_id in AgentRuntimeService._agents:
            logger.info(f"Reusing existing agent for session: {session_id}")
            return AgentRuntimeService._agents[session_id]
            
        try:
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
                        model_config = await ModelConfigService.get_model_config_by_id(model_id, user)
                        if model_config:
                            model_strategy = model_config.get("model", {}).get("strategy")
                            model_params = model_config.get("model", {}).get("params", {})
                            if model_strategy:
                                model_class = module_loader(model_strategy)
                                if model_class:
                                    model = model_class(**model_params)
                except Exception as e:
                    logger.warning(f"Failed to load model {model_ref}: {e}")
            
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
                    except Exception as e:
                        logger.warning(f"Failed to load tool {tool_id}: {e}")
            
            # Load knowledge collection names and create custom retriever
            collection_names = []
            embedder_config = None
            session_collection = agent_config.get("session_collection")
            
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
                except Exception as e:
                    logger.warning(f"Failed to load embedder: {e}")
            
            # Create custom retriever
            custom_retriever = None
            if collection_names or session_collection:
                custom_retriever = _create_multi_collection_retriever(collection_names, session_collection, embedder)
            
            memory_config = agent_config.get("memory", {})
            history_config = memory_config.get("history", {})
            
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
                "add_history_to_messages": history_config.get("enabled", False),
                "num_history_responses": history_config.get("num", 3),
            }
            
            # Use session_id instead of session_collection
            if agent_config.get("session_collection"):
                kwargs["session_id"] = agent_config["session_collection"]
                
            agent = Agent(**kwargs)
            
            # Cache the agent if we have a session_id
            if session_id:
                AgentRuntimeService._agents[session_id] = agent
                logger.info(f"Created and cached new agent for session: {session_id}")
                
            return agent
        except Exception as e:
            logger.error(f"Failed to build agent: {e}")
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

    @classmethod
    async def run_agent_stream(cls, agent: Any, prompt: str, cancel_event: Optional[asyncio.Event] = None) -> AsyncGenerator[Dict[str, Any], None]:
        try:
            for response in agent.run(prompt, stream=True):
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
            yield {"type": "agent_run_complete", "timestamp": asyncio.get_event_loop().time()}
        except Exception as e:
            logger.error(f"Error in agent run: {e}")
            yield {"type": "error", "error": str(e), "timestamp": asyncio.get_event_loop().time()}

    @classmethod
    async def execute_agent(cls, agent_name: str, prompt: str, user: Dict[str, Any], session_prefix: Optional[str] = None, cancel_event: Optional[asyncio.Event] = None) -> AsyncGenerator[Dict[str, Any], None]:
        try:
            agent_doc = await AgentService.get_agent_by_name(agent_name, user)
            if not agent_doc:
                yield {"type": "error", "error": f"Agent '{agent_name}' not found"}
                return
            # Use agent document as-is with minimal runtime additions
            agent_config = {
                **agent_doc,  # Use entire agent document as-is
            }
            if session_prefix:
                agent_config["session_collection"] = session_prefix
            agent = await cls.build_agent_from_config(agent_config, user)
            async for response in cls.run_agent_stream(agent, prompt, cancel_event=cancel_event):
                yield response
        except Exception as e:
            logger.error(f"Failed to execute agent '{agent_name}': {e}")
            yield {"type": "error", "error": f"Failed to execute agent: {str(e)}"}
