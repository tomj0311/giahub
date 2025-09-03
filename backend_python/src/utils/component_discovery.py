"""Component discovery & introspection helpers extracted from the original app."""
from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List
import ast

from .log import logger

BASE_NAMESPACE = "ai"
MAPPING = {
    "models": f"{BASE_NAMESPACE}.models",
    "functions": f"{BASE_NAMESPACE}.functions", 
    "memory": f"{BASE_NAMESPACE}.memory",
    "knowledge": f"{BASE_NAMESPACE}.knowledge",
    "chunking": f"{BASE_NAMESPACE}.document.chunking",
}

_DISCOVERY_CACHE: Dict[str, List[str]] = {}


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


def discover_components(folder: str = None) -> Dict[str, List[str]]:
    # Clear cache to force fresh discovery
    global _DISCOVERY_CACHE
    _DISCOVERY_CACHE.clear()
    
    if folder:
        # Handle both short names and full paths
        if folder in MAPPING:
            # Short name like "models" -> "ai.models"
            module_path = MAPPING[folder]
            folder_key = folder
        elif folder.startswith(BASE_NAMESPACE + "."):
            # Full path like "ai.models" -> use as is
            module_path = folder
            # Find the corresponding short key
            folder_key = None
            for k, v in MAPPING.items():
                if v == folder:
                    folder_key = k
                    break
            if folder_key is None:
                # Create a key from the last part of the path
                folder_key = folder.split('.')[-1]
        else:
            # Unknown folder
            logger.warning(f"Unknown folder: {folder}")
            return {}
            
        children = _list_children(module_path)
        full_paths = [f"{module_path}.{c}" for c in children]
        logger.info(f"Discovered {folder_key}: {full_paths}")
        return {folder_key: full_paths, folder: full_paths}
    
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
    return discovered


def get_detailed_class_info(module_path: str, kind: str = "model", force_reload: bool = False) -> Dict[str, Any]:
    """Get detailed information ONLY from what's written in the specific file."""
    import time
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
                            
                            # Skip parameters with Optional in their type
                            if "Optional" in param_type:
                                continue
                            
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


def clear_caches():
    """Clear all caches for debugging or when modules change."""
    global _DISCOVERY_CACHE
    _DISCOVERY_CACHE.clear()
    logger.info("All introspection caches cleared")
