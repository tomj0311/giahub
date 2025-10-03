"""
Module service for dynamic function execution.
"""
import os
import importlib.util
import inspect
from typing import Dict, List, Any
from pathlib import Path

from ..utils.log import logger


class ModuleService:
    """Service for discovering and managing dynamic function modules."""
    
    def __init__(self):
        self.modules_directory = Path(__file__).parent / "modules"
        self.loaded_modules = {}
    
    def discover_modules(self) -> List[str]:
        """Discover all Python modules in the modules directory."""
        try:
            modules = []
            for file_path in self.modules_directory.glob("*.py"):
                if file_path.name.startswith("__"):
                    continue
                modules.append(file_path.stem)
            
            logger.info(f"Discovered {len(modules)} modules: {modules}")
            return sorted(modules)
        except Exception as e:
            logger.error(f"Error discovering modules: {e}")
            raise
    
    def load_module(self, module_name: str) -> Any:
        """Load a module by name."""
        if module_name in self.loaded_modules:
            return self.loaded_modules[module_name]
        
        module_path = self.modules_directory / f"{module_name}.py"
        
        if not module_path.exists():
            raise FileNotFoundError(f"Module '{module_name}' not found")
        
        try:
            spec = importlib.util.spec_from_file_location(module_name, module_path)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            
            self.loaded_modules[module_name] = module
            logger.info(f"Loaded module: {module_name}")
            return module
        except Exception as e:
            logger.error(f"Error loading module {module_name}: {e}")
            raise
    
    def get_module_functions(self, module_name: str) -> Dict[str, Dict[str, Any]]:
        """Get all functions from a module with their signatures."""
        try:
            module = self.load_module(module_name)
            functions = {}
            
            for name, obj in inspect.getmembers(module, inspect.isfunction):
                if name.startswith("_"):
                    continue
                
                signature = inspect.signature(obj)
                docstring = inspect.getdoc(obj) or "No description available"
                
                parameters = {}
                for param_name, param in signature.parameters.items():
                    param_info = {
                        "name": param_name,
                        "type": str(param.annotation) if param.annotation != inspect.Parameter.empty else "Any",
                        "default": str(param.default) if param.default != inspect.Parameter.empty else None,
                        "required": param.default == inspect.Parameter.empty
                    }
                    parameters[param_name] = param_info
                
                return_type = str(signature.return_annotation) if signature.return_annotation != inspect.Signature.empty else "Any"
                
                functions[name] = {
                    "signature": str(signature),
                    "docstring": docstring,
                    "parameters": parameters,
                    "return_type": return_type,
                    "callable": obj
                }
            
            return functions
        except Exception as e:
            logger.error(f"Error getting functions for module {module_name}: {e}")
            raise
    
    def execute_function(self, module_name: str, function_name: str, **kwargs) -> Any:
        """Execute a function from a module."""
        try:
            functions = self.get_module_functions(module_name)
            
            if function_name not in functions:
                available = list(functions.keys())
                raise ValueError(f"Function '{function_name}' not found. Available: {available}")
            
            function_callable = functions[function_name]["callable"]
            result = function_callable(**kwargs)
            
            logger.info(f"Executed {module_name}.{function_name} successfully")
            return result
        except Exception as e:
            logger.error(f"Error executing {module_name}.{function_name}: {e}")
            raise