"""Component discovery & introspection helpers extracted from the original app."""
from __future__ import annotations

import importlib
import inspect
import pkgutil
import os
from pathlib import Path
from typing import Any, Dict, List, Tuple, Union, Optional, get_args, get_origin

from .logging_utils import log_event
import logging

# Set up simple logging
logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

BASE_NAMESPACE = "ai"
MAPPING = {
    "models": f"{BASE_NAMESPACE}.models",
    "functions": f"{BASE_NAMESPACE}.functions", 
    "memory": f"{BASE_NAMESPACE}.memory",
    "knowledge": f"{BASE_NAMESPACE}.knowledge",
    "chunking": f"{BASE_NAMESPACE}.document.chunking",
}

_PARAM_CACHE: Dict[Tuple[str, str], Tuple[str, List[str]]] = {}
_PARAM_DEFAULT_CACHE: Dict[Tuple[str, str], Dict[str, Any]] = {}
_BASE_EXCLUDES = {
    "base",
}


def _list_children(module_path: str) -> List[str]:
    """Fast listing by scanning filesystem without loading modules."""
    try:
        # Convert module path to filesystem path
        module_parts = module_path.split('.')
        # Start from the project root directory (go up from backend_python/src/utils/)
        current_file_path = Path(__file__).parent.parent.parent.parent  # Go up to gia_platform root
        current_dir = current_file_path / "ai"
        
        logger.info(f"Starting from directory: {current_dir}")
        
        # Navigate to the target directory
        for part in module_parts[1:]:  # Skip 'ai' as we already have it
            current_dir = current_dir / part
            logger.info(f"Navigating to: {current_dir}")
        
        if not current_dir.exists():
            logger.warning(f"Directory does not exist: {current_dir}")
            return []
        
        logger.info(f"Scanning directory: {current_dir}")
        
        # Find all Python files (excluding __init__.py and __pycache__)
        names = []
        for item in current_dir.iterdir():
            logger.info(f"Found item: {item.name}, is_file: {item.is_file()}, is_dir: {item.is_dir()}")
            if item.is_file() and item.suffix == '.py' and item.name != '__init__.py':
                # Remove .py extension to get module name
                module_name = item.stem
                names.append(module_name)
                logger.info(f"Added Python file: {module_name}")
            elif item.is_dir() and not item.name.startswith('__'):
                # Check if it's a package (has __init__.py)
                if (item / '__init__.py').exists():
                    names.append(item.name)
                    logger.info(f"Added package: {item.name}")
        
        names.sort()
        logger.info(f"Listed children for module {module_path}: {names}")
        return names
    except Exception as e:
        logger.error(f"Failed to list children for module {module_path}: {e}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        return []


_DISCOVERY_CACHE: Dict[str, List[str]] = {}

def discover_components(folder: str = None) -> Dict[str, List[str]]:
    # Clear cache to force fresh discovery
    global _DISCOVERY_CACHE
    _DISCOVERY_CACHE.clear()
    
    if folder:
        # Only discover components in the specified folder
        module_path = f"{BASE_NAMESPACE}.{folder}"
        children = _list_children(module_path)
        full_paths = [f"{module_path}.{c}" for c in children]
        logger.info(f"Discovered {folder}: {full_paths}")
        return {folder: full_paths}
    
    # Default behavior - discover all
    discovered: Dict[str, List[str]] = {k: [] for k in MAPPING}
    for k, module_path in MAPPING.items():
        # Check cache first
        if module_path in _DISCOVERY_CACHE:
            discovered[k] = _DISCOVERY_CACHE[module_path]
            logger.info(f"Cache hit for discovery of {k}: {discovered[k]}")
            continue
            
        children = _list_children(module_path)
        full_paths = [f"{module_path}.{c}" for c in children]
        discovered[k] = full_paths
        _DISCOVERY_CACHE[module_path] = full_paths
        logger.info(f"Discovered {k}: {discovered[k]}")
    try:
        log_event("discover.components", **{f"count_{k}": len(v) for k, v in discovered.items()})
    except Exception as e:
        logger.warning(f"log_event failed in discover_components: {e}")
    return discovered


def _is_optional_type(annotation: Any) -> bool:
    if annotation is None:
        return True
    
    # Import Optional for comparison
    from typing import Optional
    
    try:
        # Check if it's directly Optional[X] which is Union[X, None]
        origin = get_origin(annotation)
        if origin is Union:
            args = get_args(annotation)
            # Optional[X] is Union[X, None], so check if None is one of the args
            return type(None) in args
        
        # Also check string representations for edge cases
        str_annotation = str(annotation)
        if 'Optional[' in str_annotation or 'Union[' in str_annotation and 'NoneType' in str_annotation:
            return True
            
    except Exception as e:
        logger.debug(f"Error checking optional type for {annotation}: {e}")
        return False
    
    return False


def get_required_params_for_single_module(module_path: str, kind: str, force_reload: bool = False) -> Tuple[str, List[str]]:
    """Load ONLY the specified module and get its parameters. No bulk loading."""
    import time
    start_time = time.time()
    
    if not module_path:
        logger.warning("No module_path provided.")
        return ("", [])
    
    logger.info(f"🎯 LOADING SINGLE MODULE: {module_path} (kind: {kind})")
    
    cache_key = (module_path, kind)
    if cache_key in _PARAM_CACHE and not force_reload:
        logger.info(f"✅ Cache hit for {module_path} (took {time.time() - start_time:.3f}s)")
        return _PARAM_CACHE[cache_key]

    # NO BASE CLASS IMPORTS - just work with the target module directly
    use_pydantic_fields = (kind == "model")

    # Import ONLY this specific module
    try:
        logger.info(f"⚡ Importing ONLY module: {module_path}")
        mod = importlib.import_module(module_path)
        logger.info(f"✅ Module {module_path} imported successfully (took {time.time() - start_time:.3f}s)")
        logger.info(f"📋 Module attributes: {[attr for attr in dir(mod) if not attr.startswith('_')]}")
    except Exception as e:
        logger.error(f"❌ Failed to import {module_path}: {e}")
        import traceback
        logger.error(f"Full traceback: {traceback.format_exc()}")
        _PARAM_CACHE[cache_key] = ("", [])
        return _PARAM_CACHE[cache_key]
    # Find ANY class in the module (no inheritance checking needed)
    module_name = module_path.split('.')[-1]
    
    target_cls = None
    logger.info(f"🔍 Scanning all classes in module {module_name}")
    
    # List all classes in the module
    all_classes = []
    for attr_name in dir(mod):
        if not attr_name.startswith('_'):  # Skip private attributes
            try:
                attr = getattr(mod, attr_name)
                if inspect.isclass(attr):
                    all_classes.append(attr_name)
                    logger.info(f"📋 Found class: {attr_name}")
            except:
                continue
    
    logger.info(f"📋 All classes in module: {all_classes}")
    
    # Look for the main class - try common patterns
    potential_names = [
        module_name.upper(),  # openai -> OPENAI -> OpenAI  
        module_name.capitalize(),  # openai -> Openai
        ''.join(word.capitalize() for word in module_name.split('_')),  # snake_case -> PascalCase
    ]
    
    for class_name in potential_names:
        if hasattr(mod, class_name):
            attr = getattr(mod, class_name)
            if inspect.isclass(attr):
                target_cls = attr
                logger.info(f"🎯 Found target class: {class_name}")
                break
    
    # If no match, take the first class we find
    if target_cls is None and all_classes:
        first_class_name = all_classes[0]
        target_cls = getattr(mod, first_class_name)
        logger.info(f"🎯 Using first available class: {first_class_name}")
    
    if target_cls is None:
        logger.error(f"❌ No valid class found in {module_path}")
        _PARAM_CACHE[cache_key] = ("", [])
        return _PARAM_CACHE[cache_key]

    # Extract parameters quickly
    required: List[str] = []
    defaults: Dict[str, Any] = {}
    
    logger.info(f"📋 Extracting parameters from {target_cls.__name__}")
    
    if use_pydantic_fields:
        model_fields = getattr(target_cls, "model_fields", {}) or {}
        # Don't filter by base class - just get all fields
        
        for fname, finfo in model_fields.items():
            if fname in _BASE_EXCLUDES:
                continue
            if not _is_optional_type(getattr(finfo, "annotation", None)):
                required.append(fname)
                try:
                    dval = getattr(finfo, "default", inspect._empty)
                    if dval is not inspect._empty and dval is not None:
                        defaults[fname] = dval
                except:
                    pass

    # Check constructor parameters - FOR MODELS, INCLUDE ALL PARAMETERS
    try:
        sig = inspect.signature(target_cls.__init__)
        for pname, param in sig.parameters.items():
            if pname == "self" or pname in _BASE_EXCLUDES:
                continue
            if param.kind in (inspect.Parameter.VAR_KEYWORD, inspect.Parameter.VAR_POSITIONAL):
                continue
            
            # Only include parameters that are truly required (no default value)
            # A parameter is required if it has no default value AND is not optional
            is_required = (param.default is inspect._empty and 
                          not _is_optional_type(param.annotation))
            
            if is_required and pname not in required:
                required.append(pname)
            
            # Store defaults for all parameters that have them
            if param.default is not inspect._empty:
                try:
                    # Handle JSON serialization issues
                    import json
                    json.dumps(param.default)  # Test if serializable
                    defaults[pname] = param.default
                except (TypeError, ValueError):
                    # For non-serializable defaults, use None or skip
                    if param.default is None:
                        defaults[pname] = None
                    else:
                        logger.debug(f"Skipping non-serializable default for {pname}: {type(param.default)}")
    except Exception as e:
        logger.error(f"Error extracting constructor parameters: {e}")

    total_time = time.time() - start_time
    logger.info(f"✅ DONE! {target_cls.__name__} params: {required} (took {total_time:.3f}s)")
    
    _PARAM_CACHE[cache_key] = (target_cls.__name__, required)
    _PARAM_DEFAULT_CACHE[cache_key] = defaults
    return _PARAM_CACHE[cache_key]


# Alias for backward compatibility
def get_required_params(module_path: str, kind: str) -> Tuple[str, List[str]]:
    """Backward compatibility wrapper - now uses single module loading."""
    return get_required_params_for_single_module(module_path, kind)


def get_param_defaults(module_path: str, kind: str) -> Dict[str, Any]:
    cache_key = (module_path, kind)
    if cache_key not in _PARAM_DEFAULT_CACHE:
        get_required_params_for_single_module(module_path, kind)
    return _PARAM_DEFAULT_CACHE.get(cache_key, {})


def clear_caches():
    """Clear all caches for debugging or when modules change."""
    global _PARAM_CACHE, _PARAM_DEFAULT_CACHE, _DISCOVERY_CACHE
    _PARAM_CACHE.clear()
    _PARAM_DEFAULT_CACHE.clear()
    _DISCOVERY_CACHE.clear()
    logger.info("All introspection caches cleared")
