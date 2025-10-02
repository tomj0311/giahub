"""
API endpoints for the Dynamic Function Execution System.
This module provides FastAPI endpoints to interact with the function executor.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, Optional, List
import os
import sys

# Add the dynamic_functions directory to the path
sys.path.insert(0, os.path.dirname(__file__))

from function_executor import DynamicFunctionExecutor


# Initialize the router
router = APIRouter(prefix="/dynamic-functions", tags=["Dynamic Functions"])

# Initialize the function executor
executor = DynamicFunctionExecutor()


class FunctionExecutionRequest(BaseModel):
    module_name: str
    function_name: str
    parameters: Dict[str, Any] = {}


class FunctionExecutionResponse(BaseModel):
    success: bool
    result: Any = None
    error: Optional[str] = None
    execution_time: Optional[float] = None


@router.get("/modules")
async def list_modules() -> List[str]:
    """
    Get a list of all available modules.
    
    Returns:
        List of module names
    """
    try:
        modules = executor.discover_modules()
        return modules
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error discovering modules: {str(e)}")


@router.get("/modules/{module_name}/functions")
async def list_module_functions(module_name: str) -> Dict[str, Dict[str, Any]]:
    """
    Get all functions available in a specific module.
    
    Args:
        module_name: Name of the module
        
    Returns:
        Dictionary of functions with their signatures and metadata
    """
    try:
        functions = executor.get_module_functions(module_name)
        
        # Remove the callable objects for JSON serialization
        serializable_functions = {}
        for func_name, func_info in functions.items():
            serializable_info = func_info.copy()
            del serializable_info['callable']  # Remove non-serializable callable
            serializable_functions[func_name] = serializable_info
            
        return serializable_functions
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Module '{module_name}' not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error listing functions: {str(e)}")


@router.get("/functions")
async def list_all_functions() -> Dict[str, Dict[str, Dict[str, Any]]]:
    """
    Get all functions from all available modules.
    
    Returns:
        Dictionary with module names as keys and their functions as values
    """
    try:
        all_functions = executor.list_all_functions()
        
        # Remove callable objects for JSON serialization
        serializable_all = {}
        for module_name, functions in all_functions.items():
            serializable_functions = {}
            for func_name, func_info in functions.items():
                serializable_info = func_info.copy()
                del serializable_info['callable']
                serializable_functions[func_name] = serializable_info
            serializable_all[module_name] = serializable_functions
            
        return serializable_all
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error listing all functions: {str(e)}")


@router.get("/modules/{module_name}/functions/{function_name}")
async def get_function_signature(module_name: str, function_name: str) -> Dict[str, Any]:
    """
    Get the signature and metadata for a specific function.
    
    Args:
        module_name: Name of the module
        function_name: Name of the function
        
    Returns:
        Function signature and metadata
    """
    try:
        signature = executor.get_function_signature(module_name, function_name)
        
        # Remove callable for JSON serialization
        serializable_signature = {}
        for func_name, func_info in signature.items():
            serializable_info = func_info.copy()
            del serializable_info['callable']
            serializable_signature[func_name] = serializable_info
            
        return serializable_signature
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Module '{module_name}' not found")
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting function signature: {str(e)}")


@router.post("/execute")
async def execute_function(request: FunctionExecutionRequest) -> FunctionExecutionResponse:
    """
    Execute a function dynamically.
    
    Args:
        request: Function execution request containing module name, function name, and parameters
        
    Returns:
        Function execution result
    """
    import time
    
    start_time = time.time()
    
    try:
        result = executor.execute_function(
            module_name=request.module_name,
            function_name=request.function_name,
            **request.parameters
        )
        
        execution_time = time.time() - start_time
        
        return FunctionExecutionResponse(
            success=True,
            result=result,
            execution_time=execution_time
        )
        
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Module '{request.module_name}' not found")
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except TypeError as e:
        raise HTTPException(status_code=400, detail=f"Parameter error: {str(e)}")
    except Exception as e:
        execution_time = time.time() - start_time
        return FunctionExecutionResponse(
            success=False,
            error=str(e),
            execution_time=execution_time
        )


# Health check endpoint
@router.get("/health")
async def health_check():
    """
    Check if the dynamic function system is working properly.
    
    Returns:
        Health status information
    """
    try:
        modules = executor.discover_modules()
        total_functions = 0
        
        for module_name in modules:
            try:
                functions = executor.get_module_functions(module_name)
                total_functions += len(functions)
            except:
                pass
        
        return {
            "status": "healthy",
            "modules_count": len(modules),
            "total_functions": total_functions,
            "available_modules": modules
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Health check failed: {str(e)}")