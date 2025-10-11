import os
import importlib.util
import inspect
from typing import Dict, List, Any, Callable
import pkgutil
from pathlib import Path


class DynamicFunctionExecutor:
    """
    A system for dynamically discovering and executing functions from modules.
    """
    
    def __init__(self, modules_directory: str = None):
        """
        Initialize the function executor.
        
        Args:
            modules_directory: Path to the directory containing function modules
        """
        if modules_directory is None:
            modules_directory = os.path.dirname(__file__)
        
        self.modules_directory = Path(modules_directory)
        self.loaded_modules = {}
        self.function_registry = {}
        
    def discover_modules(self) -> List[str]:
        """
        Discover all Python modules in the modules directory.
        
        Returns:
            List of module names (without .py extension)
        """
        modules = []
        
        # Look for .py files in the directory
        for file_path in self.modules_directory.glob("*.py"):
            if file_path.name.startswith("__") or file_path.name == "function_executor.py":
                continue
            
            module_name = file_path.stem
            modules.append(module_name)
            
        return sorted(modules)
    
    def load_module(self, module_name: str) -> Any:
        """
        Dynamically load a module by name.
        
        Args:
            module_name: Name of the module to load
            
        Returns:
            The loaded module object
        """
        if module_name in self.loaded_modules:
            return self.loaded_modules[module_name]
        
        module_path = self.modules_directory / f"{module_name}.py"
        
        if not module_path.exists():
            raise FileNotFoundError(f"Module '{module_name}' not found at {module_path}")
        
        # Load the module dynamically
        spec = importlib.util.spec_from_file_location(module_name, module_path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        
        # Cache the loaded module
        self.loaded_modules[module_name] = module
        
        return module
    
    def get_module_functions(self, module_name: str) -> Dict[str, Dict[str, Any]]:
        """
        Get all functions from a module with their signatures.
        
        Args:
            module_name: Name of the module
            
        Returns:
            Dictionary containing function names and their metadata
        """
        module = self.load_module(module_name)
        functions = {}
        
        # Get all functions from the module
        for name, obj in inspect.getmembers(module, inspect.isfunction):
            # Skip private functions
            if name.startswith("_"):
                continue
                
            # Get function signature
            signature = inspect.signature(obj)
            
            # Get function docstring
            docstring = inspect.getdoc(obj) or "No description available"
            
            # Get parameter information
            parameters = {}
            for param_name, param in signature.parameters.items():
                param_info = {
                    "name": param_name,
                    "type": str(param.annotation) if param.annotation != inspect.Parameter.empty else "Any",
                    "default": str(param.default) if param.default != inspect.Parameter.empty else None,
                    "required": param.default == inspect.Parameter.empty
                }
                parameters[param_name] = param_info
            
            # Get return type
            return_type = str(signature.return_annotation) if signature.return_annotation != inspect.Signature.empty else "Any"
            
            functions[name] = {
                "signature": str(signature),
                "docstring": docstring,
                "parameters": parameters,
                "return_type": return_type,
                "callable": obj
            }
        
        return functions
    
    def list_all_functions(self) -> Dict[str, Dict[str, Dict[str, Any]]]:
        """
        List all available functions from all modules.
        
        Returns:
            Dictionary with module names as keys and their functions as values
        """
        all_functions = {}
        modules = self.discover_modules()
        
        for module_name in modules:
            try:
                functions = self.get_module_functions(module_name)
                if functions:  # Only include modules that have functions
                    all_functions[module_name] = functions
            except Exception as e:
                print(f"Error loading module '{module_name}': {e}")
        
        return all_functions
    
    def execute_function(self, module_name: str, function_name: str, **kwargs) -> Any:
        """
        Execute a function from a specific module.
        
        Args:
            module_name: Name of the module containing the function
            function_name: Name of the function to execute
            **kwargs: Arguments to pass to the function
            
        Returns:
            The result of the function execution
        """
        functions = self.get_module_functions(module_name)
        
        if function_name not in functions:
            available_functions = list(functions.keys())
            raise ValueError(f"Function '{function_name}' not found in module '{module_name}'. "
                           f"Available functions: {available_functions}")
        
        function_callable = functions[function_name]["callable"]
        
        try:
            result = function_callable(**kwargs)
            return result
        except TypeError as e:
            # Provide better error message for parameter mismatches
            signature_info = functions[function_name]["signature"]
            raise TypeError(f"Error calling {function_name}{signature_info}: {e}")
    
    def get_function_signature(self, module_name: str, function_name: str = None) -> Dict[str, Any]:
        """
        Get the signature of a specific function or all functions in a module.
        
        Args:
            module_name: Name of the module
            function_name: Name of the function (optional)
            
        Returns:
            Function signature information
        """
        functions = self.get_module_functions(module_name)
        
        if function_name is None:
            return functions
        
        if function_name not in functions:
            available_functions = list(functions.keys())
            raise ValueError(f"Function '{function_name}' not found in module '{module_name}'. "
                           f"Available functions: {available_functions}")
        
        return {function_name: functions[function_name]}