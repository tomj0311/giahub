"""Component discovery & introspection helpers extracted from the original app."""
from __future__ import annotations

import importlib
import inspect
import pkgutil
import os
from pathlib import Path
from typing import Any, Dict, List, Tuple, Union, Optional, get_args, get_origin

# from .logging_utils import log_event  # Comment out potentially missing import
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
        current_file_path = Path(__file__).parent.parent.parent.parent  # Go up to giahub root
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
        # log_event("discover.components", **{f"count_{k}": len(v) for k, v in discovered.items()})  # Comment out
        pass
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
    import sys
    import os
    start_time = time.time()
    
    if not module_path:
        logger.warning("No module_path provided.")
        return ("", [])
    
    logger.info(f"🎯 LOADING SINGLE MODULE: {module_path} (kind: {kind})")
    
    cache_key = (module_path, kind)
    if cache_key in _PARAM_CACHE and not force_reload:
        logger.info(f"✅ Cache hit for {module_path} (took {time.time() - start_time:.3f}s)")
        return _PARAM_CACHE[cache_key]


def get_detailed_class_info(module_path: str, kind: str = "model", force_reload: bool = False) -> Dict[str, Any]:
    """Get detailed information ONLY from what's written in the specific file."""
    import time
    import sys
    import ast
    start_time = time.time()
    
    if not module_path:
        logger.warning("No module_path provided.")
        return {}
    
    logger.info(f"🎯 READING FILE DIRECTLY: {module_path}")
    
    # Get the file path
    current_file_path = Path(__file__).parent.parent.parent.parent  # Go up to giahub root
    module_parts = module_path.split('.')
    file_path = current_file_path
    for part in module_parts:
        file_path = file_path / part
    file_path = file_path.with_suffix('.py')
    
    logger.info(f"Reading file: {file_path}")
    
    try:
        # Read the file content directly
        with open(file_path, 'r') as f:
            content = f.read()
        
        # Parse the AST to find class definitions
        tree = ast.parse(content)
        
        module_info = {
            "module_path": module_path,
            "classes": {}
        }
        
        for node in ast.walk(tree):
            if isinstance(node, ast.ClassDef):
                class_name = node.name
                logger.info(f"📋 Found class definition: {class_name}")
                
                class_info = {
                    "class_name": class_name,
                    "parameters": {},
                    "formatted_params": []
                }
                
                # Find __init__ method
                for item in node.body:
                    if isinstance(item, ast.FunctionDef) and item.name == "__init__":
                        logger.info(f"Found __init__ for {class_name}")
                        
                        # Get parameters from __init__ signature
                        for arg in item.args.args:
                            if arg.arg == "self":
                                continue
                            
                            param_name = arg.arg
                            
                            # Get type annotation
                            param_type = "Any"
                            if arg.annotation:
                                if isinstance(arg.annotation, ast.Name):
                                    param_type = arg.annotation.id
                                elif isinstance(arg.annotation, ast.Constant):
                                    param_type = str(arg.annotation.value)
                                else:
                                    param_type = ast.unparse(arg.annotation) if hasattr(ast, 'unparse') else "Any"
                            
                            # Get default value
                            default_value = "None"
                            defaults = item.args.defaults
                            kwdefaults = item.args.kw_defaults or []
                            
                            # Calculate which default corresponds to this parameter
                            total_args = len(item.args.args) - 1  # excluding self
                            defaults_start = total_args - len(defaults)
                            arg_index = item.args.args.index(arg) - 1  # excluding self
                            
                            if arg_index >= defaults_start and defaults:
                                default_idx = arg_index - defaults_start
                                if default_idx < len(defaults):
                                    default_node = defaults[default_idx]
                                    if isinstance(default_node, ast.Constant):
                                        default_value = repr(default_node.value)
                                    elif isinstance(default_node, ast.Name) and default_node.id == 'None':
                                        default_value = "None"
                                    else:
                                        default_value = ast.unparse(default_node) if hasattr(ast, 'unparse') else "None"
                            
                            # Get description from docstring
                            docstring = ast.get_docstring(node) or ""
                            description = ""
                            if "Args:" in docstring:
                                args_section = docstring.split("Args:")[1].split("\n\n")[0] if "\n\n" in docstring.split("Args:")[1] else docstring.split("Args:")[1]
                                for line in args_section.split("\n"):
                                    line = line.strip()
                                    if line.startswith(param_name + ":"):
                                        description = line.split(":", 1)[1].strip()
                                        break
                            
                            # Format the parameter
                            formatted = f"{param_name}: {param_type} = {default_value}"
                            if description:
                                formatted += f" - {description}"
                            
                            class_info["parameters"][param_name] = {
                                "name": param_name,
                                "type": param_type,
                                "default": default_value,
                                "description": description,
                                "formatted": formatted
                            }
                            class_info["formatted_params"].append(formatted)
                
                module_info["classes"][class_name] = class_info
        
        logger.info(f"✅ File parsing complete! (took {time.time() - start_time:.3f}s)")
        return module_info
        
    except Exception as e:
        logger.error(f"❌ Failed to parse {file_path}: {e}")
        import traceback
        logger.error(f"Full traceback: {traceback.format_exc()}")
        return {}


def get_required_params_for_single_module(module_path: str, kind: str, force_reload: bool = False) -> Tuple[str, List[str]]:
    """Backward compatibility wrapper that maintains the old interface."""
    return get_required_params(module_path, kind)


# Alias for backward compatibility
def get_required_params(module_path: str, kind: str) -> Tuple[str, List[str]]:
    """Backward compatibility wrapper - now uses detailed class info."""
    detailed_info = get_detailed_class_info(module_path, kind)
    if not detailed_info or not detailed_info.get("classes"):
        return ("", [])
    
    # Get the first class and its required parameters
    first_class = list(detailed_info["classes"].values())[0]
    class_name = first_class["class_name"]
    required_params = first_class["required_parameters"]
    
    return (class_name, required_params)


def get_param_defaults(module_path: str, kind: str) -> Dict[str, Any]:
    """Get parameter defaults using detailed class info."""
    detailed_info = get_detailed_class_info(module_path, kind)
    if not detailed_info or not detailed_info.get("classes"):
        return {}
    
    # Get the first class and extract defaults
    first_class = list(detailed_info["classes"].values())[0]
    defaults = {}
    
    for param_name, param_info in first_class["parameters"].items():
        if param_info.get("has_default") and param_info.get("default") is not None:
            defaults[param_name] = param_info["default"]
    
    return defaults


def clear_caches():
    """Clear all caches for debugging or when modules change."""
    global _PARAM_CACHE, _PARAM_DEFAULT_CACHE, _DISCOVERY_CACHE
    _PARAM_CACHE.clear()
    _PARAM_DEFAULT_CACHE.clear()
    _DISCOVERY_CACHE.clear()
    logger.info("All introspection caches cleared")
