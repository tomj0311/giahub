"""
Model Configuration CRUD routes for MongoDB operations
Handles model configurations stored in MongoDB with categories
"""

from fastapi import APIRouter, HTTPException, Depends, status
from typing import Dict, List, Any, Optional
from datetime import datetime

from ..db import get_collections
from ..utils.auth import verify_token_middleware
from src.utils.component_discovery import discover_components, get_detailed_class_info
from ..utils.log import logger

router = APIRouter(prefix="/api/model-config", tags=["model-config"])


@router.post("/configs", status_code=status.HTTP_201_CREATED)
async def create_model_config(
    config: dict,
    user: dict = Depends(verify_token_middleware)
):
    """Create a new model configuration"""
    logger.info(f"[MODEL_CONFIG] Creating model config: {config.get('name')} by user: {user.get('id', user.get('username'))}")
    
    try:
        collections = get_collections()
        
        # Validate required fields
        if not config.get("name"):
            logger.warning(f"[MODEL_CONFIG] Missing name field in config creation")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Name is required"
            )
        
        if not config.get("model"):
            logger.warning(f"[MODEL_CONFIG] Missing model field in config creation")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Model is required"
            )
        
        logger.debug(f"[MODEL_CONFIG] Checking for existing config with name: {config.get('name')}")
        # Check if config with same name already exists
        existing = await collections['modelConfig'].find_one({"name": config.get("name")})
        if existing:
            logger.warning(f"[MODEL_CONFIG] Config with name '{config.get('name')}' already exists")
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Model configuration with name '{config.get('name')}' already exists"
            )
        
        # Create the config document
        config_doc = {
            "name": config.get("name"),
            "category": config.get("category", ""),
            "model": config.get("model"),
            "model_params": config.get("model_params", {}),
            "type": "model_config",
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "created_by": user.get("id", user.get("username"))
        }
        
        logger.debug(f"[MODEL_CONFIG] Inserting config into database")
        # Insert into MongoDB
        result = await collections['modelConfig'].insert_one(config_doc)
        
        # Retrieve the created document
        created_config = await collections['modelConfig'].find_one({"_id": result.inserted_id})
        
        # Convert MongoDB document to response format
        response_config = {
            "id": str(created_config["_id"]),
            "name": created_config["name"],
            "category": created_config["category"],
            "model": created_config["model"],
            "model_params": created_config["model_params"],
            "type": created_config["type"],
            "created_at": created_config["created_at"],
            "updated_at": created_config["updated_at"]
        }
        
        logger.info(f"[MODEL_CONFIG] Successfully created model config: {config.get('name')} (ID: {str(result.inserted_id)})")
        return response_config
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[MODEL_CONFIG] Error creating model config: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create model configuration"
        )


@router.get("/configs")
async def get_model_configs(
    category: Optional[str] = None,
    user: dict = Depends(verify_token_middleware)
):
    """Get all model configurations, optionally filtered by category"""
    logger.info(f"[MODEL_CONFIG] Getting model configs (category: {category}) for user: {user.get('id', user.get('username'))}")
    
    try:
        collections = get_collections()
        
        # Build query
        query = {"type": "model_config"}
        if category:
            query["category"] = category
        
        # Fetch configurations
        cursor = collections['modelConfig'].find(query)
        configs = await cursor.to_list(length=None)
        
        # Convert to response format
        response_configs = []
        for config in configs:
            response_configs.append({
                "id": str(config["_id"]),
                "name": config["name"],
                "category": config.get("category", ""),
                "model": config["model"],
                "model_params": config.get("model_params", {}),
                "type": config["type"],
                "created_at": config["created_at"],
                "updated_at": config["updated_at"]
            })
        
        logger.info(f"Retrieved {len(response_configs)} model configs")
        return {"configurations": response_configs}
        
    except Exception as e:
        logger.error(f"Error fetching model configs: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch model configurations"
        )


@router.get("/configs/{config_id}")
async def get_model_config(
    config_id: str,
    user: dict = Depends(verify_token_middleware)
):
    """Get a specific model configuration by ID"""
    try:
        collections = get_collections()
        
        from bson import ObjectId
        
        # Fetch the configuration
        config = await collections['modelConfig'].find_one({"_id": ObjectId(config_id)})
        
        if not config:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Model configuration with ID '{config_id}' not found"
            )
        
        # Convert to response format
        response_config = {
            "id": str(config["_id"]),
            "name": config["name"],
            "category": config.get("category", ""),
            "model": config["model"],
            "model_params": config.get("model_params", {}),
            "type": config["type"],
            "created_at": config["created_at"],
            "updated_at": config["updated_at"]
        }
        
        return response_config
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching model config {config_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch model configuration"
        )


@router.put("/configs/{config_id}")
async def update_model_config(
    config_id: str,
    config_update: dict,
    user: dict = Depends(verify_token_middleware)
):
    """Update a specific model configuration"""
    try:
        collections = get_collections()
        
        from bson import ObjectId
        
        # Check if config exists
        existing_config = await collections['modelConfig'].find_one({"_id": ObjectId(config_id)})
        if not existing_config:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Model configuration with ID '{config_id}' not found"
            )
        
        # Build update document
        update_doc = {"updated_at": datetime.utcnow()}
        
        # Only update provided fields
        if "name" in config_update:
            # Check if new name conflicts with existing configs
            existing_name = await collections['modelConfig'].find_one({
                "name": config_update["name"],
                "_id": {"$ne": ObjectId(config_id)}
            })
            if existing_name:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Model configuration with name '{config_update['name']}' already exists"
                )
            update_doc["name"] = config_update["name"]
            
        if "category" in config_update:
            update_doc["category"] = config_update["category"]
            
        if "model" in config_update:
            update_doc["model"] = config_update["model"]
            
        if "model_params" in config_update:
            update_doc["model_params"] = config_update["model_params"]
        
        # Update the document
        await collections['modelConfig'].update_one(
            {"_id": ObjectId(config_id)},
            {"$set": update_doc}
        )
        
        # Fetch updated document
        updated_config = await collections['modelConfig'].find_one({"_id": ObjectId(config_id)})
        
        # Convert to response format
        response_config = {
            "id": str(updated_config["_id"]),
            "name": updated_config["name"],
            "category": updated_config.get("category", ""),
            "model": updated_config["model"],
            "model_params": updated_config.get("model_params", {}),
            "type": updated_config["type"],
            "created_at": updated_config["created_at"],
            "updated_at": updated_config["updated_at"]
        }
        
        logger.info(f"Updated model config: {config_id}")
        return response_config
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating model config {config_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update model configuration"
        )


@router.delete("/configs/{config_id}")
async def delete_model_config(
    config_id: str,
    user: dict = Depends(verify_token_middleware)
):
    """Delete a specific model configuration"""
    try:
        collections = get_collections()
        
        from bson import ObjectId
        
        # Check if config exists
        existing_config = await collections['modelConfig'].find_one({"_id": ObjectId(config_id)})
        if not existing_config:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Model configuration with ID '{config_id}' not found"
            )
        
        # Delete the configuration
        await collections['modelConfig'].delete_one({"_id": ObjectId(config_id)})
        
        logger.info(f"Deleted model config: {config_id}")
        return {"message": f"Model configuration '{existing_config['name']}' deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting model config {config_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete model configuration"
        )


@router.get("/categories")
async def get_categories(user: dict = Depends(verify_token_middleware)):
    """Get distinct categories from model configurations"""
    try:
        collections = get_collections()
        
        # Get distinct categories
        categories = await collections['modelConfig'].distinct("category")
        
        # Filter out empty categories and sort
        categories = [cat for cat in categories if cat and cat.strip()]
        categories.sort()
        
        logger.info(f"Retrieved {len(categories)} categories")
        return {"categories": categories}
        
    except Exception as e:
        logger.error(f"Error fetching categories: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch categories"
        )


# Integration with component discovery
@router.get("/components")
async def get_model_components(
    folder: str = "models",
    user: dict = Depends(verify_token_middleware)
):
    """Get available model components using component discovery"""
    try:
        logger.info(f"Discovering components for folder: {folder}")
        components = discover_components(folder=folder)
        
        return {
            "components": components,
            "message": f"Discovered {sum(len(v) for v in components.values())} components"
        }
        
    except Exception as e:
        logger.error(f"Error discovering components: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to discover model components"
        )


@router.post("/introspect")
async def introspect_model_component(
    request: dict,
    user: dict = Depends(verify_token_middleware)
):
    """Introspect a model component to get its parameters"""
    try:
        module_path = request.get("module_path")
        kind = request.get("kind", "model")
        
        if not module_path:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="module_path is required"
            )
        
        logger.info(f"Introspecting module: {module_path} (kind: {kind})")
        
        # Use component discovery to get detailed class info
        detailed_info = get_detailed_class_info(module_path, kind)
        
        if not detailed_info or not detailed_info.get("classes"):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No valid class found in module: {module_path}"
            )
        
        # Return formatted params like discovery endpoint
        main_class = list(detailed_info["classes"].values())[0]
        
        return {
            "module_path": detailed_info["module_path"],
            "class_name": main_class["class_name"],
            "formatted_params": main_class["formatted_params"]
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error introspecting component: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to introspect model component"
        )
