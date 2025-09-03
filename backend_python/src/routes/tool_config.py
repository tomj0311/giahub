"""
Tool Configuration CRUD routes for MongoDB operations
Handles tool configurations stored in MongoDB with categories
"""

from fastapi import APIRouter, HTTPException, Depends, status
from typing import Optional
from datetime import datetime

from ..db import get_collections
from ..utils.auth import verify_token_middleware
from src.utils.component_discovery import discover_components, get_detailed_class_info
from ..utils.log import logger

router = APIRouter(prefix="/api/tool-config", tags=["tool-config"]) 


@router.post("/configs", status_code=status.HTTP_201_CREATED)
async def create_tool_config(
    config: dict,
    user: dict = Depends(verify_token_middleware)
):
    """Create a new tool configuration"""
    try:
        collections = get_collections()

        if not config.get("name"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Name is required"
            )

        if not config.get("tool") and not config.get("function"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Tool (module path) is required"
            )

        # Use unified key 'tool' (alias for function module path)
        tool_module = config.get("tool") or config.get("function")

        # Ensure unique name
        existing = await collections['toolConfig'].find_one({"name": config.get("name")})
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Tool configuration with name '{config.get('name')}' already exists"
            )

        doc = {
            "name": config.get("name"),
            "category": config.get("category", ""),
            "tool": tool_module,
            "tool_params": config.get("tool_params", {}),
            "type": "toolConfig",
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "created_by": user.get("id", user.get("username"))
        }

        res = await collections['toolConfig'].insert_one(doc)
        created = await collections['toolConfig'].find_one({"_id": res.inserted_id})

        return {
            "id": str(created["_id"]),
            "name": created["name"],
            "category": created.get("category", ""),
            "tool": created["tool"],
            "tool_params": created.get("tool_params", {}),
            "type": created["type"],
            "created_at": created["created_at"],
            "updated_at": created["updated_at"]
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating tool config: {e}")
        raise HTTPException(status_code=500, detail="Failed to create tool configuration")


@router.get("/configs")
async def get_tool_configs(
    category: Optional[str] = None,
    user: dict = Depends(verify_token_middleware)
):
    """List tool configurations"""
    try:
        collections = get_collections()
        query = {"type": "toolConfig"}
        if category:
            query["category"] = category
        cursor = collections['toolConfig'].find(query)
        configs = await cursor.to_list(length=None)
        return {
            "configurations": [
                {
                    "id": str(c["_id"]),
                    "name": c["name"],
                    "category": c.get("category", ""),
                    "tool": c["tool"],
                    "tool_params": c.get("tool_params", {}),
                    "type": c["type"],
                    "created_at": c["created_at"],
                    "updated_at": c["updated_at"],
                } for c in configs
            ]
        }
    except Exception as e:
        logger.error(f"Error fetching tool configs: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch tool configurations")


@router.get("/configs/{config_id}")
async def get_tool_config(config_id: str, user: dict = Depends(verify_token_middleware)):
    try:
        collections = get_collections()
        from bson import ObjectId
        c = await collections['toolConfig'].find_one({"_id": ObjectId(config_id)})
        if not c:
            raise HTTPException(status_code=404, detail=f"Tool configuration with ID '{config_id}' not found")
        return {
            "id": str(c["_id"]),
            "name": c["name"],
            "category": c.get("category", ""),
            "tool": c["tool"],
            "tool_params": c.get("tool_params", {}),
            "type": c["type"],
            "created_at": c["created_at"],
            "updated_at": c["updated_at"]
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching tool config {config_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch tool configuration")


@router.put("/configs/{config_id}")
async def update_tool_config(config_id: str, config_update: dict, user: dict = Depends(verify_token_middleware)):
    try:
        collections = get_collections()
        from bson import ObjectId
        existing = await collections['toolConfig'].find_one({"_id": ObjectId(config_id)})
        if not existing:
            raise HTTPException(status_code=404, detail=f"Tool configuration with ID '{config_id}' not found")

        update_doc = {"updated_at": datetime.utcnow()}
        if "name" in config_update:
            conflict = await collections['toolConfig'].find_one({
                "name": config_update["name"],
                "_id": {"$ne": ObjectId(config_id)}
            })
            if conflict:
                raise HTTPException(status_code=409, detail=f"Tool configuration with name '{config_update['name']}' already exists")
            update_doc["name"] = config_update["name"]
        if "category" in config_update:
            update_doc["category"] = config_update["category"]
        if "tool" in config_update:
            update_doc["tool"] = config_update["tool"]
        if "tool_params" in config_update:
            update_doc["tool_params"] = config_update["tool_params"]

        await collections['toolConfig'].update_one({"_id": ObjectId(config_id)}, {"$set": update_doc})
        updated = await collections['toolConfig'].find_one({"_id": ObjectId(config_id)})

        return {
            "id": str(updated["_id"]),
            "name": updated["name"],
            "category": updated.get("category", ""),
            "tool": updated["tool"],
            "tool_params": updated.get("tool_params", {}),
            "type": updated["type"],
            "created_at": updated["created_at"],
            "updated_at": updated["updated_at"]
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating tool config {config_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to update tool configuration")


@router.delete("/configs/{config_id}")
async def delete_tool_config(config_id: str, user: dict = Depends(verify_token_middleware)):
    try:
        collections = get_collections()
        from bson import ObjectId
        existing = await collections['toolConfig'].find_one({"_id": ObjectId(config_id)})
        if not existing:
            raise HTTPException(status_code=404, detail=f"Tool configuration with ID '{config_id}' not found")
        await collections['toolConfig'].delete_one({"_id": ObjectId(config_id)})
        return {"message": f"Tool configuration '{existing['name']}' deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting tool config {config_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete tool configuration")


@router.get("/categories")
async def get_tool_categories(user: dict = Depends(verify_token_middleware)):
    try:
        collections = get_collections()
        cats = await collections['toolConfig'].distinct("category")
        cats = [c for c in cats if c and c.strip()]
        cats.sort()
        return {"categories": cats}
    except Exception as e:
        logger.error(f"Error fetching tool categories: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch categories")


@router.get("/components")
async def get_tool_components(folder: str = "functions", user: dict = Depends(verify_token_middleware)):
    """Discover available tool components from ai.functions"""
    try:
        components = discover_components(folder=folder)
        return {"components": components, "message": "OK"}
    except Exception as e:
        logger.error(f"Error discovering tool components: {e}")
        raise HTTPException(status_code=500, detail="Failed to discover tool components")


@router.post("/introspect")
async def introspect_tool_component(request: dict, user: dict = Depends(verify_token_middleware)):
    try:
        module_path = request.get("module_path")
        kind = request.get("kind", "tool")
        if not module_path:
            raise HTTPException(status_code=400, detail="module_path is required")
        info = get_detailed_class_info(module_path, kind)
        if not info or not info.get("classes"):
            raise HTTPException(status_code=404, detail=f"No valid class found in module: {module_path}")
        main_class = list(info["classes"].values())[0]
        return {
            "module_path": info["module_path"],
            "class_name": main_class["class_name"],
            "formatted_params": main_class["formatted_params"],
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error introspecting tool component: {e}")
        raise HTTPException(status_code=500, detail="Failed to introspect tool component")
