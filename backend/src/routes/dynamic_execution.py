"""
Dynamic execution API routes.
"""
from typing import Dict, Any
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..services.module_service import ModuleService
from ..utils.log import logger

router = APIRouter()
module_service = ModuleService()


class ExecuteRequest(BaseModel):
    module_name: str
    function_name: str
    parameters: Dict[str, Any] = {}


@router.get("/modules")
async def get_modules():
    """Get all available modules."""
    try:
        modules = module_service.discover_modules()
        return {"success": True, "data": modules}
    except Exception as e:
        logger.error(f"Error getting modules: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/modules/{module_name}/functions")
async def get_module_functions(module_name: str):
    """Get functions in a specific module."""
    try:
        functions = module_service.get_module_functions(module_name)
        
        # Remove callable for JSON response
        serializable_functions = {}
        for func_name, func_info in functions.items():
            serializable_info = func_info.copy()
            del serializable_info['callable']
            serializable_functions[func_name] = serializable_info
        
        return {"success": True, "data": serializable_functions}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Module '{module_name}' not found")
    except Exception as e:
        logger.error(f"Error getting functions for {module_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/execute")
async def execute_function(request: ExecuteRequest):
    """Execute a function dynamically."""
    try:
        result = module_service.execute_function(
            module_name=request.module_name,
            function_name=request.function_name,
            **request.parameters
        )
        return {"success": True, "data": result}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Module '{request.module_name}' not found")
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except TypeError as e:
        raise HTTPException(status_code=400, detail=f"Parameter error: {str(e)}")
    except Exception as e:
        logger.error(f"Error executing function: {e}")
        raise HTTPException(status_code=500, detail=str(e))