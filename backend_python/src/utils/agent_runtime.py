"""Agent runtime utilities: loading, instantiation, streaming runs, cancellation.

This module centralises the logic that was previously embedded inside ``ws.py``
so that the WebSocket handler focuses on transport concerns only.

Thread-safety: A single ``AgentRunManager`` instance protects mutable shared
state (active runs, cancellation flags, generators) with a ``threading.Lock``.
The public API is intentionally small and side-effect free aside from logging
and background thread spawning.

Test change for autoreload.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from functools import partial
import importlib
import inspect
import json
import os
import threading
import uuid
from typing import Any, Callable, Dict, Iterable, Iterator, List, Optional, Set, Type

from .log import logger

# Lazy imports of heavy ai.* modules only when first needed
from typing import TYPE_CHECKING
if TYPE_CHECKING:  # pragma: no cover - type checking only
    from ai.agent import Agent as _Agent  # type: ignore
    from ai.model.base import Model as _Model  # type: ignore
    # Base Tool/Toolkit classes remain in ai.tools; discovery/paths may now point to ai.functions
    from ai.tools import Tool as _Tool, Toolkit as _Toolkit  # type: ignore
else:  # runtime lightweight names (resolved lazily in functions)
    _Agent = Any  # type: ignore
    _Model = Any  # type: ignore
    _Tool = Any  # type: ignore
    _Toolkit = Any  # type: ignore

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_images_from_minio_buckets(collection_name: str = None, session_collection: str = None, user_id: str = None) -> List[Any]:
    """Get list of Image objects from MinIO buckets matching collection names."""
    from .config import CONFIG
    
    log_event('agent.images_search_start', collection_name=collection_name, session_collection=session_collection, user_id=user_id)
    
    images = []
    image_extensions = {'.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'}
    
    # Create MinIO URL base
    protocol = "https" if CONFIG.minio_secure else "http"
    minio_base_url = f"{protocol}://{CONFIG.minio_host}:{CONFIG.minio_port}"
    
    # Build search paths based on user-specific structure
    search_paths = []
    if user_id and collection_name:
        safe_user = ''.join(c for c in user_id if c.isalnum() or c in ('_','-','.','@')) or "unknown_user"
        search_paths.append(f"uploads/{safe_user}/knowledge/{collection_name}/")
    if user_id and session_collection:
        safe_user = ''.join(c for c in user_id if c.isalnum() or c in ('_','-','.','@')) or "unknown_user"
        search_paths.append(f"uploads/{safe_user}/chat_sessions/{session_collection}/")
    
    # Fallback to legacy paths if no user_id provided
    if not user_id:
        if collection_name:
            search_paths.append(f"uploads/{collection_name}/")
        if session_collection:
            search_paths.append(f"uploads/{session_collection}/")
    
    try:
        from ai.storage.minio_client import MinioClient
        from ai.model.content import Image
        import uuid
        
        minio_client = MinioClient()
        
        for prefix in search_paths:
            log_event('agent.images_checking_path', prefix=prefix)
            try:
                # List all objects in uploads bucket with the prefix
                log_event('agent.images_listing_prefix', prefix=prefix)
                for object_name in minio_client.list(prefix=prefix, recursive=True, bucket="uploads"):
                    log_event('agent.images_found_object', object_name=object_name)
                    # Check if it's an image file
                    file_ext = os.path.splitext(object_name.lower())[1]
                    if file_ext in image_extensions:
                        log_event('agent.images_found_image', object_name=object_name, file_ext=file_ext)
                        # Create full URL for the image
                        image_url = f"{minio_base_url}/uploads/{object_name}"
                        
                        # Try to download and get base64 data
                        base_64_image = None
                        try:
                            import httpx
                            import base64
                            
                            response = httpx.get(image_url)
                            response.raise_for_status()
                            image_data = response.content
                            base_64_image = base64.b64encode(image_data).decode("utf-8")
                            log_event('agent.images_downloaded_base64', object_name=object_name, base64_length=len(base_64_image))
                        except Exception as e:
                            log_event('agent.images_download_failed', object_name=object_name, error=str(e))
                        
                        # Create Image object with both URL and base64 data
                        # Extract meaningful alt text from path
                        path_parts = object_name.split('/')
                        if len(path_parts) >= 3:
                            source_info = f"{path_parts[-3]}/{path_parts[-2]}"  # e.g., "user@email/knowledge" or "session_id"
                        else:
                            source_info = prefix.strip('/')
                            
                        image_obj = Image(
                            id=str(uuid.uuid4()),
                            url=image_url,
                            alt_text=f"Image from {source_info}: {os.path.basename(object_name)}",
                            base_64_image=base_64_image
                        )
                        images.append(image_obj)
                        log_event('agent.images_added_image', image_url=image_url, has_base64=bool(base_64_image), total_count=len(images))
                        
            except Exception as e:
                log_event('minio.path_list_error', prefix=prefix, error=str(e))
                continue
                
    except Exception as e:
        log_event('minio.client_error', error=str(e))
    
    log_event('agent.images_search_complete', total_images=len(images))
    return images


def _extract_agent_run_data(agent: _Agent, correlation_id: str, prompt: str, completed: bool = False) -> dict:
    """Extract comprehensive agent data for MongoDB storage.
    
    Args:
        agent: The agent instance
        correlation_id: Unique identifier for this run
        prompt: The user prompt/input
        completed: Whether this is the final data extraction after completion
        
    Returns:
        Dictionary containing all agent run data for storage
    """
    from datetime import datetime
    
    try:
        # Basic run information
        run_data = {
            "correlation_id": correlation_id,
            "run_id": getattr(agent, 'run_id', None),
            "agent_id": getattr(agent, 'agent_id', None),
            "session_id": getattr(agent, 'session_id', None),
            "user_id": getattr(agent, 'user_id', None),
            "user_prompt": prompt,
            "status": "completed" if completed else "running",
        }
        
        # Only set created_at for new runs, not for updates
        if not completed:
            run_data["created_at"] = datetime.utcnow()
        
        # Agent basic information
        run_data.update({
            "agent_name": getattr(agent, 'name', None),
            "agent_description": getattr(agent, 'description', None),
            "agent_instructions": getattr(agent, 'instructions', None),
            "session_name": getattr(agent, 'session_name', None),
        })
        
        # Model information
        model = getattr(agent, 'model', None)
        if model:
            model_data = {
                "model_id": getattr(model, 'id', None),
                "model_name": getattr(model, 'name', None),
                "model_provider": getattr(model, 'provider', None),
            }
            
            # Extract model metrics if available
            model_metrics = getattr(model, 'metrics', {})
            if model_metrics:
                model_data["model_metrics"] = model_metrics
                
            run_data["model"] = model_data
        
        # Memory and session information
        memory = getattr(agent, 'memory', None)
        if memory:
            memory_data = {
                "add_history_to_messages": getattr(agent, 'add_history_to_messages', False),
                "num_history_responses": getattr(agent, 'num_history_responses', 3),
            }
            
            # Extract memory runs and messages
            runs = getattr(memory, 'runs', [])
            if runs:
                memory_data["total_runs"] = len(runs)
                # Get the latest run for detailed metrics
                if runs:
                    latest_run = runs[-1]
                    if hasattr(latest_run, 'response'):
                        response = latest_run.response
                        if hasattr(response, 'metrics'):
                            memory_data["latest_run_metrics"] = response.metrics
            
            messages = getattr(memory, 'messages', [])
            if messages:
                memory_data["total_messages"] = len(messages)
                
            run_data["memory"] = memory_data
        
        # Tools information
        tools = getattr(agent, 'tools', None)
        if tools:
            tools_data = []
            for tool in tools:
                # Be defensive: never let a single tool break data extraction
                try:
                    cls = getattr(tool, '__class__', None)
                    name = getattr(cls, '__name__', None) or str(type(tool))
                    tool_type = "toolkit" if hasattr(tool, 'tools') else "tool"
                    tools_data.append({"name": name, "type": tool_type})
                except Exception as e:  # pragma: no cover
                    # Fallback entry capturing the error for diagnostics
                    tools_data.append({
                        "name": str(type(tool)),
                        "type": "tool",
                        "error": str(e)
                    })
            run_data["tools"] = tools_data
        
        # Knowledge and retrieval information
        run_data.update({
            "search_knowledge": getattr(agent, 'search_knowledge', False),
            "add_context": getattr(agent, 'add_context', False),
            "add_references": getattr(agent, 'add_references', False),
            "resolve_context": getattr(agent, 'resolve_context', False),
        })
        
        # Images and media
        images = getattr(agent, 'images', [])
        if images:
            run_data["images_count"] = len(images)
            run_data["has_images"] = True
        
        videos = getattr(agent, 'videos', None)
        if videos:
            run_data["has_videos"] = True
            
        audio = getattr(agent, 'audio', None)
        if audio:
            run_data["has_audio"] = True
        
        # Configuration and settings
        run_data.update({
            "markdown": getattr(agent, 'markdown', True),
            "show_tool_calls": getattr(agent, 'show_tool_calls', False),
            "tool_call_limit": getattr(agent, 'tool_call_limit', None),
            "reasoning": getattr(agent, 'reasoning', False),
            "debug_mode": getattr(agent, 'debug_mode', False),
            "monitoring": getattr(agent, 'monitoring', False),
            "telemetry": getattr(agent, 'telemetry', True),
        })
        
        # Response information (only available when completed)
        if completed:
            run_response = getattr(agent, 'run_response', None)
            if run_response:
                response_data = {
                    "content": getattr(run_response, 'content', None),
                    "content_type": getattr(run_response, 'content_type', None),
                }
                
                # Extract metrics from response
                response_metrics = getattr(run_response, 'metrics', {})
                if response_metrics:
                    # Convert defaultdict to regular dict for MongoDB
                    if hasattr(response_metrics, 'default_factory'):
                        response_metrics = dict(response_metrics)
                    response_data["metrics"] = response_metrics
                    
                    # Calculate aggregate metrics for easy querying
                    aggregate_metrics = {}
                    if 'total_tokens' in response_metrics:
                        aggregate_metrics["total_tokens"] = sum(response_metrics['total_tokens']) if isinstance(response_metrics['total_tokens'], list) else response_metrics['total_tokens']
                    if 'input_tokens' in response_metrics:
                        aggregate_metrics["total_input_tokens"] = sum(response_metrics['input_tokens']) if isinstance(response_metrics['input_tokens'], list) else response_metrics['input_tokens']
                    if 'output_tokens' in response_metrics:
                        aggregate_metrics["total_output_tokens"] = sum(response_metrics['output_tokens']) if isinstance(response_metrics['output_tokens'], list) else response_metrics['output_tokens']
                    if 'time' in response_metrics:
                        aggregate_metrics["total_response_time"] = sum(response_metrics['time']) if isinstance(response_metrics['time'], list) else response_metrics['time']
                    if 'time_to_first_token' in response_metrics:
                        avg_ttft = response_metrics['time_to_first_token']
                        if isinstance(avg_ttft, list) and avg_ttft:
                            aggregate_metrics["avg_time_to_first_token"] = sum(avg_ttft) / len(avg_ttft)
                        elif isinstance(avg_ttft, (int, float)):
                            aggregate_metrics["avg_time_to_first_token"] = avg_ttft
                    
                    run_data["metrics"] = aggregate_metrics
                
                run_data["response"] = response_data
        
        return run_data
        
    except Exception as e:
        log_event('agent.extract_data_error', correlation_id=correlation_id, error=str(e))
        # Return minimal data if extraction fails
        error_data = {
            "correlation_id": correlation_id,
            "user_prompt": prompt,
            "status": "error_extracting_data",
            "error": str(e),
        }
        
        # Only set created_at for new runs, not for updates
        if not completed:
            error_data["created_at"] = datetime.utcnow()
        
        return error_data


def _create_multi_collection_retriever(collection_name: str = None, session_collection: str = None):
    """Create a custom retriever that searches across multiple collections"""
    def multi_collection_retriever(agent, query: str, num_documents: int = None, **kwargs):
        """Custom retriever that searches across multiple existing collections"""
        from typing import List, Dict, Any
        from .config import CONFIG
        
        # List of collections to search
        collections_to_search = []
        if collection_name:
            collections_to_search.append(collection_name)
        if session_collection:
            collections_to_search.append(session_collection)
        
        if not collections_to_search:
            return None
        
        all_results = []
        
        for collection in collections_to_search:
            try:
                # Create vector DB connection for this collection
                from ai.vectordb.qdrant import Qdrant
                vector_db = Qdrant(
                    collection=collection,
                    host=CONFIG.qdrant_host,
                    port=CONFIG.qdrant_port,
                    https=CONFIG.qdrant_https,
                    api_key=CONFIG.qdrant_api_key,
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
                log_event('retriever.collection_search_error', collection=collection, error=str(e))
                continue
        
        # Sort by relevance score and limit results
        if num_documents:
            all_results = all_results[:num_documents]
        
        return all_results if all_results else None
    
    return multi_collection_retriever

def _find_subclass_in_module(module_path: str, base_cls: Type) -> Type | None:
    try:
        try:
            mod = importlib.import_module(module_path)
        except Exception:
            # Fallback 1: ai.tools.* -> ai.functions.*
            if module_path.startswith('ai.tools.'):
                alt_path = module_path.replace('ai.tools.', 'ai.functions.', 1)
                mod = importlib.import_module(alt_path)
                module_path = alt_path
            # Fallback 2: ai.functions.* -> ai.tools.*
            elif module_path.startswith('ai.functions.'):
                alt_path = module_path.replace('ai.functions.', 'ai.tools.', 1)
                mod = importlib.import_module(alt_path)
                module_path = alt_path
            else:
                raise
    except Exception as e:  # pragma: no cover
        log_event('agent.import_failed', module=module_path, error=str(e))
        return None
    for attr_name in dir(mod):
        attr = getattr(mod, attr_name)
        try:
            if inspect.isclass(attr) and issubclass(attr, base_cls) and attr is not base_cls:
                return attr  # type: ignore
        except Exception:  # pragma: no cover
            continue
    return None


def _instantiate_model(cfg: dict) -> _Model:
    from ai.model.base import Model as _ModelReal  # local import for optional dependency
    
    # Handle new configuration name format
    model_ref = cfg.get('model')
    if isinstance(model_ref, dict) and 'name' in model_ref:
        # Load model configuration from MongoDB
        try:
            from .mongo_storage import model_config_get
            model_config = model_config_get(model_ref['name'])
            if model_config is None:
                raise ValueError(f'Model configuration "{model_ref["name"]}" not found in MongoDB')
            
            mpath = model_config.get('model')
            if not mpath:
                raise ValueError(f'Model configuration "{model_ref["name"]}" missing model path')
                
            cls = _find_subclass_in_module(mpath, _ModelReal)
            if cls is None:
                raise ValueError(f'No Model subclass in {mpath}')
                
            # Merge config params with any override params from agent config
            params = {k: v for k, v in (model_config.get('model_params') or {}).items() if v is not None}
            override_params = {k: v for k, v in model_ref.items() if k != 'name' and v is not None}
            params.update(override_params)
            
            return cls(**params)  # type: ignore
        except Exception as e:
            log_event('agent.model_config_load_error', config_name=model_ref['name'], error=str(e))
            raise ValueError(f'Failed to load model configuration "{model_ref["name"]}": {str(e)}')
    
    # Handle legacy format (fallback)
    mpath = cfg.get('model')
    if not mpath:
        raise ValueError('missing model path or configuration name')
    cls = _find_subclass_in_module(mpath, _ModelReal)
    if cls is None:
        raise ValueError(f'no Model subclass in {mpath}')
    params = {k: v for k, v in (cfg.get('model_params') or {}).items() if v is not None}
    return cls(**params)  # type: ignore


def _instantiate_tools(cfg: dict):  # -> List[_Tool | _Toolkit]
    from ai.tools import Tool as _ToolReal, Toolkit as _ToolkitReal  # local import
    out: List[Any] = []
    
    # Handle new configuration name format
    tools_dict = cfg.get('tools')
    if isinstance(tools_dict, dict):
        # Tools are now stored as {config_name: {...}} format
        for config_name, override_params in tools_dict.items():
            try:
                from .mongo_storage import tools_config_get
                tools_config = tools_config_get(config_name)
                if tools_config is None:
                    log_event('agent.tools_config_missing', config_name=config_name)
                    continue
                
                # Get the actual tool modules from the configuration
                tool_modules = tools_config.get('tools', [])
                tool_params_all = tools_config.get('tool_params', {})
                tool_keys_all = tools_config.get('tool_keys', {})
                
                # Instantiate each tool in this configuration
                for module_path in tool_modules:
                    cls: Type | None = _find_subclass_in_module(module_path, _ToolkitReal)
                    base_used = 'Toolkit'
                    if cls is None:
                        cls = _find_subclass_in_module(module_path, _ToolReal)
                        base_used = 'Tool'
                    if cls is None:
                        log_event('agent.tool_missing', module=module_path, config=config_name)
                        continue
                    
                    # Build parameters: config params + tool-specific params + override params
                    params = dict(tool_params_all.get(module_path) or {})
                    tool_key = tool_keys_all.get(module_path)
                    
                    # Apply tool-specific key if available
                    try:
                        sig = inspect.signature(cls.__init__)
                        for candidate in ('api_key','key','token'):
                            if candidate in sig.parameters and candidate not in params and tool_key:
                                params[candidate] = tool_key
                    except Exception:  # pragma: no cover
                        pass
                    
                    # Apply any override parameters from agent config
                    if isinstance(override_params, dict):
                        params.update({k: v for k, v in override_params.items() if v is not None})
                    
                    try:
                        out.append(cls(**params))  # type: ignore
                        log_event('agent.tool_instantiated', module=module_path, base=base_used, config=config_name)
                    except Exception as e:  # pragma: no cover
                        log_event('agent.tool_error', module=module_path, config=config_name, error=str(e))
                        
            except Exception as e:  # pragma: no cover
                log_event('agent.tools_config_load_error', config_name=config_name, error=str(e))
                
        return out
    
    # Handle legacy format (fallback)
    tool_modules: List[str] = cfg.get('tools') or []
    tool_keys: dict[str, str] = cfg.get('tool_keys') or {}
    tool_params: dict[str, dict] = cfg.get('tool_params') or {}
    for module_path in tool_modules:
        cls: Type | None = _find_subclass_in_module(module_path, _ToolkitReal)
        base_used = 'Toolkit'
        if cls is None:
            cls = _find_subclass_in_module(module_path, _ToolReal)
            base_used = 'Tool'
        if cls is None:
            log_event('agent.tool_missing', module=module_path)
            continue
        params = dict(tool_params.get(module_path) or {})
        key_val = tool_keys.get(module_path)
        try:
            sig = inspect.signature(cls.__init__)
            for candidate in ('api_key','key','token'):
                if candidate in sig.parameters and candidate not in params and key_val:
                    params[candidate] = key_val
        except Exception:  # pragma: no cover
            pass
        try:
            out.append(cls(**params))  # type: ignore
            log_event('agent.tool_instantiated', module=module_path, base=base_used)
        except Exception as e:  # pragma: no cover
            log_event('agent.tool_error', module=module_path, error=str(e))
    return out


def _normalize_config(raw: dict) -> dict:
    """Normalize both legacy and new concise schema into legacy-style flat keys.

    New concise schema example:
    {
      "model": {"name": "my-gpt4-config"},
      "tools": {"my-tools-config": {}},
      "memory": {"history": {"enabled": true, "num": 3}},
      "knowledge": {"sources": {"ai.knowledge.text": {"path": "users/x/knowledge"}},
                      "chunk": {"strategy": "semantic", "size": 800, "overlap": 80},
                      "add_context": true, "search": true}
    }
    
    Legacy format is also supported for backward compatibility.
    """
    cfg = dict(raw)  # shallow copy
    
    # Model - handle both new config name format and legacy path format
    mval = cfg.get('model')
    if isinstance(mval, dict):
        if 'name' in mval:
            # New format: keep as-is for _instantiate_model to handle
            pass
        elif 'path' in mval:
            # Legacy format: convert to old flat format for fallback
            path = mval.get('path')
            cfg['model'] = path
            params = {k: v for k, v in mval.items() if k != 'path' and v is not None}
            if params:
                cfg['model_params'] = params
    elif isinstance(mval, str):
        # String could be either a config name or a legacy module path
        # If it contains dots, treat as legacy module path; otherwise as config name
        if '.' in mval:
            # Legacy module path format: keep as string for fallback
            pass
        else:
            # Configuration name format: convert to new format
            cfg['model'] = {'name': mval}
    
    # Tools - handle both new config name format and legacy module list format
    tval = cfg.get('tools')
    if isinstance(tval, dict):
        # New format: tools = {"config_name": {...}} - keep as-is
        # _instantiate_tools will handle this format
        pass
    elif isinstance(tval, list):
        # Legacy format: convert to old flat format for fallback
        cfg['tools'] = tval
        # tool_params and tool_keys are already in the right format
    elif isinstance(tval, str):
        # Single tool config name as string: convert to dict format
        if '.' in tval:
            # Legacy module path: convert to list for fallback
            cfg['tools'] = [tval]
        else:
            # Configuration name: convert to new dict format
            cfg['tools'] = {tval: {}}
    
    # Memory
    mem = cfg.get('memory')
    if isinstance(mem, dict):
        hist = mem.get('history') or {}
        if hist.get('enabled'):
            cfg['add_history_to_messages'] = True
            if isinstance(hist.get('num'), int):
                cfg['num_history_responses'] = hist.get('num')
    
    # Knowledge
    kn = cfg.get('knowledge')
    if isinstance(kn, dict):
        sources = kn.get('sources') or {}
        if isinstance(sources, dict):
            cfg['knowledge'] = list(sources.keys())
            k_params = {k: v for k, v in sources.items() if isinstance(v, dict) and v}
            if k_params:
                cfg['knowledge_params'] = k_params
        chunk = kn.get('chunk') or {}
        if isinstance(chunk, dict):
            if 'strategy' in chunk: cfg['chunk_strategy'] = chunk['strategy']
            if 'size' in chunk: cfg['chunk_size'] = chunk['size']
            if 'overlap' in chunk: cfg['chunk_overlap'] = chunk['overlap']
        if kn.get('add_context'): cfg['add_context'] = True
        if kn.get('search'): cfg['search_knowledge'] = True
        # Handle vector_db configuration for existing collections
        vector_db_cfg = kn.get('vector_db')
        if isinstance(vector_db_cfg, dict) and vector_db_cfg.get('collection'):
            cfg['vector_db_collection'] = vector_db_cfg['collection']
            cfg['vector_db_provider'] = vector_db_cfg.get('provider', 'qdrant')
    return cfg


def _build_agent(config: dict, user_id: str = None) -> _Agent:
    from ai.agent import Agent as _AgentReal  # local import
    # Normalize config first (supports new concise schema and legacy)
    norm = _normalize_config(config)
    model_obj = _instantiate_model(norm)
    tools = _instantiate_tools(norm)
    add_hist = bool(norm.get('add_history_to_messages'))
    num_hist = norm.get('num_history_responses', 3)
    # Get collection names for custom retriever
    collection_name = norm.get('collection') or norm.get('prefix')
    session_collection = norm.get('session_collection')  # For uploaded files
    
    # Get Image objects from MinIO buckets
    images = _get_images_from_minio_buckets(collection_name, session_collection, user_id)
    log_event('agent.images_retrieved', collection_name=collection_name, session_collection=session_collection, user_id=user_id, image_count=len(images))
    
    # Create custom retriever instead of knowledge_base
    custom_retriever = None
    if collection_name or session_collection:
        custom_retriever = _create_multi_collection_retriever(collection_name, session_collection)
    
    # If session_collection is present, enable knowledge features
    search_knowledge = bool(norm.get('search_knowledge', False))
    add_context = bool(norm.get('add_context', False))
    add_references = bool(norm.get('add_references', False))
    resolve_context = bool(norm.get('resolve_context', False))
    
    if session_collection:
        search_knowledge = True
        add_context = True
        add_references = True
        resolve_context = True
      
    agent = _AgentReal(
        name=norm.get('name'),
        description=norm.get('description'),
        instructions=norm.get('instructions'),
        model=model_obj,
        tools=tools or None,
        markdown=bool(norm.get('markdown', True)),
        show_tool_calls=bool(norm.get('show_tool_calls', False)),
        add_history_to_messages=add_hist or False,
        num_history_responses=num_hist,
        images=images,
        retriever=custom_retriever,  # Use custom retriever instead of knowledge_base
        search_knowledge=search_knowledge,
        add_context=add_context,
        add_references=add_references,
        resolve_context=resolve_context,
    )
    
    return agent

# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

@dataclass
class RunCallbacks:
    send: Callable[[str, Any, str | None], None]
    send_error: Callable[[str, str | None, int, Dict[str, Any]], None]

@dataclass
class ActiveRun:
    correlation_id: str
    agent: Any
    prompt: str
    iterator: Optional[Iterator[Any]] = None
    cancelled: bool = False
    thread: Optional[threading.Thread] = None
    created_ts: float = field(default_factory=lambda: threading.get_native_id())  # lightweight identifier

# ---------------------------------------------------------------------------
# Manager
# ---------------------------------------------------------------------------

class AgentRunManager:
    """Encapsulates agent listing/loading and run lifecycle (start, stream, cancel)."""

    def __init__(self, agents_dir: str):
        self.agents_dir = agents_dir
        # _agent_cache stores per agent file: {'agent': AgentInstance, 'mtime': float}
        self._agent_cache = {}
        self._runs = {}
        self._lock = threading.Lock()

    # ---- Agent discovery / loading -------------------------------------------------
    def build_agent_from_config(self, config: dict, user_id: str = None):
        """Construct an Agent instance directly from a config dict.

        This bypasses any filesystem lookups and is intended for Mongo-backed
        agent storage flows.
        """
        return _build_agent(config, user_id)

    # ---- Run lifecycle -------------------------------------------------------------
    def start_run(self, *, correlation_id: str, agent: Any, prompt: str, callbacks: RunCallbacks):
        """Start a streaming run in a background thread.

        The provided callbacks are used for emitting events back to the transport
        layer (usually the WebSocket handler). The callbacks MUST be thread-safe
        (i.e. they should marshal to the IOLoop when necessary).
        """
        run = ActiveRun(correlation_id=correlation_id, agent=agent, prompt=prompt)
        with self._lock:
            self._runs[correlation_id] = run

        def _worker():
            try:
                # Get the agent's images and convert them to format expected by models
                agent_images = getattr(agent, 'images', None)
                images_for_run = []
                
                if agent_images:
                    for img in agent_images:
                        if hasattr(img, 'base_64_image') and img.base_64_image:
                            # Use base64 data if available
                            mime_type = "image/jpeg"  # default
                            data_url = f"data:{mime_type};base64,{img.base_64_image}"
                            images_for_run.append(data_url)
                        elif hasattr(img, 'url') and img.url:
                            # Use URL if no base64 data
                            images_for_run.append(img.url)
                        else:
                            # Handle other formats (strings, etc)
                            images_for_run.append(str(img))
                
                log_event('agent.run_start', correlation_id=correlation_id, images_count=len(images_for_run))
                
                # Pass converted images to the run method
                run.iterator = iter(agent.run(message=prompt, stream=True, images=images_for_run if images_for_run else None))
                
                # Log initial agent run data
                agent_run_data = _extract_agent_run_data(agent, correlation_id, prompt)
                try:
                    from .mongo_storage import agent_run_upsert, agent_run_update_status
                    agent_run_upsert(agent_run_data)
                except Exception as e:
                    log_event('agent.run_log_error', correlation_id=correlation_id, error=str(e))
                
                while True:
                    if self._is_cancelled(correlation_id):
                        try:
                            from .mongo_storage import agent_run_update_status
                            agent_run_update_status(correlation_id, "cancelled")
                        except:
                            pass
                        callbacks.send('agent_run_cancelled', {'reason': 'client_request'}, correlation_id)
                        break
                    try:
                        chunk = next(run.iterator)
                    except StopIteration:
                        if not self._is_cancelled(correlation_id):
                            # Update final agent data with completion details
                            final_agent_data = _extract_agent_run_data(agent, correlation_id, prompt, completed=True)
                            try:
                                from .mongo_storage import agent_run_update_status
                                agent_run_update_status(correlation_id, "completed")
                                # Update the existing document with final complete agent state
                                from .mongo_storage import agent_run_upsert
                                agent_run_upsert(final_agent_data)
                            except Exception as e:
                                log_event('agent.final_log_error', correlation_id=correlation_id, error=str(e))
                            
                            callbacks.send('agent_run_complete', {'status': 'done'}, correlation_id)
                            log_event('agent.run_complete', correlation_id=correlation_id)
                        else:
                            log_event('agent.run_complete_after_cancel_flag', correlation_id=correlation_id)
                        break
                    except Exception as e:  # pragma: no cover
                        try:
                            from .mongo_storage import agent_run_update_status
                            agent_run_update_status(correlation_id, "failed", str(e))
                        except:
                            pass
                        log_event('agent.run_iter_error', correlation_id=correlation_id, error=str(e))
                        callbacks.send_error('agent_run_failed', correlation_id, 500, {'message': str(e)})
                        break
                    if self._is_cancelled(correlation_id):
                        try:
                            from .mongo_storage import agent_run_update_status
                            agent_run_update_status(correlation_id, "cancelled")
                        except:
                            pass
                        callbacks.send('agent_run_cancelled', {'reason': 'client_request'}, correlation_id)
                        break
                    content = getattr(chunk, 'content', None) or getattr(chunk, 'response', None)
                    if content:
                        callbacks.send('agent_chunk', {'content': content}, correlation_id)
            except Exception as e:  # pragma: no cover
                try:
                    from .mongo_storage import agent_run_update_status
                    agent_run_update_status(correlation_id, "failed", str(e))
                except:
                    pass
                log_event('agent.run_error', error=str(e), correlation_id=correlation_id)
                callbacks.send_error('agent_run_failed', correlation_id, 500, {'message': str(e)})
            finally:
                self._cleanup_run(correlation_id)

        t = threading.Thread(target=_worker, name=f'agent-run-{correlation_id[:8]}', daemon=True)
        run.thread = t
        t.start()

    def request_cancel(self, correlation_id: str) -> bool:
        run = self._runs.get(correlation_id)
        if not run:
            return False
        run.cancelled = True
        # Attempt to proactively close iterator (if the underlying generator supports it)
        it = run.iterator
        if it is not None:
            close_fn = getattr(it, 'close', None)
            if callable(close_fn):
                try:
                    close_fn()
                    log_event('agent.cancel_iterator_closed', correlation_id=correlation_id)
                except Exception as e:  # pragma: no cover
                    log_event('agent.cancel_iterator_close_error', correlation_id=correlation_id, error=str(e))
        return True

    # ---- Internal ---------------------------------------------------------------
    def _is_cancelled(self, correlation_id: str) -> bool:
        run = self._runs.get(correlation_id)
        return bool(run and run.cancelled)

    def _cleanup_run(self, correlation_id: str):
        with self._lock:
            self._runs.pop(correlation_id, None)

    # ---- Introspection / status ------------------------------------------------
    def is_running(self, correlation_id: str) -> bool:
        return correlation_id in self._runs


__all__ = [
    'AgentRunManager',
    'RunCallbacks',
    '_get_images_from_minio_buckets',
]
