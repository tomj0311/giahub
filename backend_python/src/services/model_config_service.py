"""
Model Configuration Service

This service handles all model configuration business logic including
model management, provider configurations, and model-related operations.
"""

from datetime import datetime
from typing import List, Optional, Dict, Any
from fastapi import HTTPException, status

from ..utils.log import logger
from ..utils.mongo_storage import MongoStorageService


class ModelConfigService:
    """Service for managing model configurations"""
    
    @staticmethod
    async def validate_tenant_access(user: dict) -> str:
        """Validate tenant access and return tenant_id"""
        logger.debug(f"[MODEL] Validating tenant access for user: {user.get('id')}")
        tenant_id = user.get("tenantId")
        if not tenant_id:
            logger.warning(f"[MODEL] Missing tenant information for user: {user.get('id')}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User tenant information missing. Please re-login."
            )
        logger.debug(f"[MODEL] Tenant access validated: {tenant_id}")
        return tenant_id
    
    @classmethod
    async def list_model_configs(cls, user: dict) -> List[Dict[str, Any]]:
        """List model configurations for current tenant"""
        tenant_id = await cls.validate_tenant_access(user)
        logger.info(f"[MODEL] Listing model configs for tenant: {tenant_id}")
        
        try:
            logger.debug(f"[MODEL] Querying database for model configs - tenant: {tenant_id}")
            docs = await MongoStorageService.find_many("modelConfig", {}, tenant_id=tenant_id, sort_field="name", sort_order=1)
            logger.debug(f"[MODEL] Found {len(docs)} model configs for tenant: {tenant_id}")
            
            configs = []
            for doc in docs:
                config = {
                    "id": str(doc["_id"]),
                    "name": doc.get("name"),
                    "provider": doc.get("provider"),
                    "model": doc.get("model"),
                    "embedding": doc.get("embedding"),  # Include embedding data
                    "category": doc.get("category", ""),
                    "description": doc.get("description", ""),
                    "parameters": doc.get("parameters", {}),
                    "api_key_configured": bool(doc.get("api_key")),
                    "created_at": doc.get("created_at"),
                    "updated_at": doc.get("updated_at"),
                    "is_active": doc.get("is_active", True)
                }
                configs.append(config)
            
            logger.info(f"[MODEL] Found {len(configs)} model configurations")
            return configs
            
        except Exception as e:
            logger.error(f"[MODEL] Failed to list model configs: {e}")
            raise HTTPException(status_code=500, detail="Failed to retrieve model configurations")

    @classmethod
    async def list_model_configs_paginated(
        cls, 
        user: dict, 
        page: int = 1, 
        page_size: int = 8,
        category: Optional[str] = None,
        search: Optional[str] = None,
        sort_by: str = "name",
        sort_order: str = "asc"
    ) -> Dict[str, Any]:
        """List model configurations with pagination, filtering, and sorting"""
        tenant_id = await cls.validate_tenant_access(user)
        logger.info(f"[MODEL] Listing model configs with pagination for tenant: {tenant_id}")
        
        try:
            # Build filter query
            filter_query = {}
            
            if category:
                filter_query["category"] = category
            
            if search:
                filter_query["$or"] = [
                    {"name": {"$regex": search, "$options": "i"}},
                    {"description": {"$regex": search, "$options": "i"}}
                ]
            
            # Calculate pagination
            skip = (page - 1) * page_size
            
            # Get total count
            total_count = await MongoStorageService.count_documents("modelConfig", filter_query, tenant_id=tenant_id)
            
            # Calculate pagination info
            total_pages = (total_count + page_size - 1) // page_size  # Ceiling division
            has_next = page < total_pages
            has_prev = page > 1
            
            # Determine sort order
            sort_direction = -1 if sort_order == "desc" else 1
            
            # Get paginated results
            docs = await MongoStorageService.find_many(
                "modelConfig", 
                filter_query,
                tenant_id=tenant_id,
                sort_field=sort_by,
                sort_order=sort_direction,
                skip=skip,
                limit=page_size
            )
            
            logger.debug(f"[MODEL] Found {len(docs)} model configs for tenant: {tenant_id}")
            
            configs = []
            for doc in docs:
                config = {
                    "id": str(doc["_id"]),
                    "name": doc.get("name"),
                    "provider": doc.get("provider"),
                    "model": doc.get("model"),
                    "embedding": doc.get("embedding"),  # Include embedding data
                    "category": doc.get("category", ""),
                    "description": doc.get("description", ""),
                    "parameters": doc.get("parameters", {}),
                    "api_key_configured": bool(doc.get("api_key")),
                    "created_at": doc.get("created_at"),
                    "updated_at": doc.get("updated_at"),
                    "is_active": doc.get("is_active", True)
                }
                configs.append(config)
            
            # Build response with pagination metadata
            result = {
                "configurations": configs,
                "pagination": {
                    "page": page,
                    "page_size": page_size,
                    "total": total_count,
                    "total_pages": total_pages,
                    "has_next": has_next,
                    "has_prev": has_prev
                }
            }
            
            logger.info(f"[MODEL] Returning {len(configs)} configs, page {page}/{total_pages}")
            return result
            
        except Exception as e:
            logger.error(f"[MODEL] Failed to list model configs with pagination: {e}")
            raise HTTPException(status_code=500, detail="Failed to retrieve model configurations")
    
    @classmethod
    async def get_model_config(cls, config_name: str, user: dict) -> Dict[str, Any]:
        """Get specific model configuration"""
        tenant_id = await cls.validate_tenant_access(user)
        
        try:
            doc = await MongoStorageService.find_one("modelConfig", {
                "tenantId": tenant_id,
                "name": config_name
            })
            
            if not doc:
                raise HTTPException(status_code=404, detail="Model configuration not found")
            
            config = {
                "id": str(doc["_id"]),
                "name": doc.get("name"),
                "provider": doc.get("provider"),
                "model": doc.get("model"),
                "embedding": doc.get("embedding"),  # Include embedding data
                "category": doc.get("category", ""),
                "description": doc.get("description", ""),
                "parameters": doc.get("parameters", {}),
                "api_key_configured": bool(doc.get("api_key")),
                "created_at": doc.get("created_at"),
                "updated_at": doc.get("updated_at"),
                "is_active": doc.get("is_active", True)
            }
            
            return config
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"[MODEL] Failed to get model config {config_name}: {e}")
            raise HTTPException(status_code=500, detail="Failed to retrieve model configuration")
    
    @classmethod
    async def get_model_config_by_id(cls, config_id: str, user: dict) -> Dict[str, Any]:
        # Return raw document (no flattening/normalization) per user request.
        from bson import ObjectId
        tenant_id = await cls.validate_tenant_access(user)
        logger.debug(f"[MODEL] get_model_config_by_id (raw) - tenant_id: {tenant_id}, config_id: {config_id}")
        try:
            doc = await MongoStorageService.find_one(
                "modelConfig",
                {"_id": ObjectId(config_id), "tenantId": tenant_id},
                tenant_id=tenant_id
            )
            if not doc:
                raise HTTPException(status_code=404, detail="Model configuration not found")
            return doc  # raw document (may contain ObjectId, caller must handle serialization)
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"[MODEL] Failed to get model config {config_id}: {e}")
            raise HTTPException(status_code=500, detail="Failed to retrieve model configuration")

    @classmethod
    async def create_model_config(cls, config_data: Dict[str, Any], user: dict) -> Dict[str, str]:
        """Create new model configuration"""
        tenant_id = await cls.validate_tenant_access(user)
        user_id = user.get("id") or user.get("userId")
        
        name = config_data.get("name", "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="Name is required")
        
        logger.info(f"[MODEL] Creating model config '{name}' for tenant: {tenant_id}")
        
        try:
            # Check if config already exists
            existing = await MongoStorageService.find_one("modelConfig", {
                "tenantId": tenant_id,
                "name": name
            })
            
            if existing:
                raise HTTPException(status_code=409, detail="Model configuration with this name already exists")
            
            # Accept frontend structure as-is and only add required backend fields
            record = dict(config_data)  # Preserve original structure
            record.update({
                "tenantId": tenant_id,
                "userId": user_id,
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow()
            })
            
            await MongoStorageService.insert_one("modelConfig", record, tenant_id=tenant_id)
            
            logger.info(f"[MODEL] Successfully created model config '{name}'")
            return {"message": "Model configuration created", "name": name}
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"[MODEL] Failed to create model config '{name}': {e}")
            raise HTTPException(status_code=500, detail="Failed to create model configuration")
    
    @classmethod
    async def update_model_config(cls, config_name: str, config_data: Dict[str, Any], user: dict) -> Dict[str, str]:
        """Update existing model configuration"""
        tenant_id = await cls.validate_tenant_access(user)
        
        logger.info(f"[MODEL] Updating model config '{config_name}' for tenant: {tenant_id}")
        
        try:
            # Accept frontend structure as-is and only add/update backend fields
            update_data = dict(config_data)  # Preserve original structure
            update_data["updated_at"] = datetime.utcnow()
            
            result = await MongoStorageService.update_one(
                "modelConfig",
                {
                    "tenantId": tenant_id,
                    "name": config_name
                },
                {"$set": update_data},
                tenant_id=tenant_id
            )
            
            if not result:
                raise HTTPException(status_code=404, detail="Model configuration not found")
            
            logger.info(f"[MODEL] Successfully updated model config '{config_name}'")
            return {"message": "Model configuration updated"}
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"[MODEL] Failed to update model config '{config_name}': {e}")
            raise HTTPException(status_code=500, detail="Failed to update model configuration")
    
    @classmethod
    async def delete_model_config(cls, config_name: str, user: dict) -> Dict[str, str]:
        """Delete model configuration"""
        tenant_id = await cls.validate_tenant_access(user)
        
        logger.info(f"[MODEL] Deleting model config '{config_name}' for tenant: {tenant_id}")
        
        try:
            # Check if config is being used by any agents
            agents_using_config = await MongoStorageService.count_documents("agents", {
                "tenantId": tenant_id,
                "model.name": config_name
            })
            
            if agents_using_config > 0:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Cannot delete model configuration. It is being used by {agents_using_config} agent(s)"
                )
            
            result = await MongoStorageService.delete_one("modelConfig", {
                "tenantId": tenant_id,
                "name": config_name
            }, tenant_id=tenant_id)
            
            if not result:
                raise HTTPException(status_code=404, detail="Model configuration not found")
            
            logger.info(f"[MODEL] Successfully deleted model config '{config_name}'")
            return {"message": f"Model configuration '{config_name}' deleted"}
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"[MODEL] Failed to delete model config '{config_name}': {e}")
            raise HTTPException(status_code=500, detail="Failed to delete model configuration")
    
    # ID-based methods (preferred)
    @classmethod
    async def update_model_config_by_id(cls, config_id: str, config_data: Dict[str, Any], user: dict) -> Dict[str, str]:
        """Update existing model configuration by ID"""
        from bson import ObjectId
        tenant_id = await cls.validate_tenant_access(user)
        
        logger.info(f"[MODEL] Updating model config '{config_id}' for tenant: {tenant_id}")
        
        try:
            object_id = ObjectId(config_id)
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid configuration ID"
            )
        
        try:
            # Accept frontend structure as-is and only add/update backend fields
            update_data = dict(config_data)  # Preserve original structure
            update_data["updated_at"] = datetime.utcnow()
            
            result = await MongoStorageService.update_one(
                "modelConfig",
                {"_id": object_id},
                {"$set": update_data},
                tenant_id=tenant_id
            )
            
            if not result:
                raise HTTPException(status_code=404, detail="Model configuration not found")
            
            logger.info(f"[MODEL] Successfully updated model config '{config_id}'")
            return {"message": "Model configuration updated"}
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"[MODEL] Failed to update model config '{config_id}': {e}")
            raise HTTPException(status_code=500, detail="Failed to update model configuration")
    
    @classmethod
    async def delete_model_config_by_id(cls, config_id: str, user: dict) -> Dict[str, str]:
        """Delete model configuration by ID"""
        from bson import ObjectId
        tenant_id = await cls.validate_tenant_access(user)
        
        logger.info(f"[MODEL] Deleting model config '{config_id}' for tenant: {tenant_id}")
        
        try:
            # First get the config to check if it exists and get its name
            doc = await MongoStorageService.find_one(
                "modelConfig",
                {"_id": ObjectId(config_id), "tenantId": tenant_id},
                tenant_id=tenant_id  # ensure tenant enforcement
            )
            
            if not doc:
                raise HTTPException(status_code=404, detail="Model configuration not found")
            
            config_name = doc.get("name")
            
            # Check if config is being used by any agents
            agents_using_config = await MongoStorageService.count_documents("agents", {
                "tenantId": tenant_id,
                "model.name": config_name
            })
            
            if agents_using_config > 0:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Cannot delete model configuration. It is being used by {agents_using_config} agent(s)"
                )
            
            result = await MongoStorageService.delete_one("modelConfig", {
                "_id": ObjectId(config_id),
                "tenantId": tenant_id
            }, tenant_id=tenant_id)
            
            if not result:
                raise HTTPException(status_code=404, detail="Model configuration not found")
            
            logger.info(f"[MODEL] Successfully deleted model config '{config_id}'")
            return {"message": f"Model configuration deleted"}
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"[MODEL] Failed to delete model config '{config_id}': {e}")
            raise HTTPException(status_code=500, detail="Failed to delete model configuration")
    
    @staticmethod
    def _validate_provider_model(provider: str, model: str):
        """Validate provider and model combination"""
        # Define supported providers and their models
        supported_configs = {
            "openai": ["gpt-4", "gpt-4-turbo", "gpt-3.5-turbo", "gpt-4o", "gpt-4o-mini"],
            "anthropic": ["claude-3-5-sonnet-20241022", "claude-3-opus-20240229", "claude-3-sonnet-20240229", "claude-3-haiku-20240307"],
            "google": ["gemini-pro", "gemini-pro-vision", "gemini-1.5-pro", "gemini-1.5-flash"],
            "groq": ["llama-3.1-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"],
            "ollama": ["llama3.1", "llama3", "mixtral", "codellama"],
            "together": ["meta-llama/Llama-3-70b-chat-hf", "meta-llama/Llama-3-8b-chat-hf"],
            "mistral": ["mistral-large-latest", "mistral-medium-latest", "mistral-small-latest"]
        }
        
        if provider not in supported_configs:
            raise HTTPException(
                status_code=400, 
                detail=f"Unsupported provider: {provider}. Supported providers: {', '.join(supported_configs.keys())}"
            )
        
        if model not in supported_configs[provider]:
            raise HTTPException(
                status_code=400, 
                detail=f"Unsupported model '{model}' for provider '{provider}'. Supported models: {', '.join(supported_configs[provider])}"
            )
    
    @classmethod
    async def get_available_providers(cls) -> Dict[str, List[str]]:
        """Get list of available providers and their models"""
        return {
            "openai": ["gpt-4", "gpt-4-turbo", "gpt-3.5-turbo", "gpt-4o", "gpt-4o-mini"],
            "anthropic": ["claude-3-5-sonnet-20241022", "claude-3-opus-20240229", "claude-3-sonnet-20240229", "claude-3-haiku-20240307"],
            "google": ["gemini-pro", "gemini-pro-vision", "gemini-1.5-pro", "gemini-1.5-flash"],
            "groq": ["llama-3.1-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"],
            "ollama": ["llama3.1", "llama3", "mixtral", "codellama"],
            "together": ["meta-llama/Llama-3-70b-chat-hf", "meta-llama/Llama-3-8b-chat-hf"],
            "mistral": ["mistral-large-latest", "mistral-medium-latest", "mistral-small-latest"]
        }

    @classmethod
    async def discover_model_components(cls, folder: str = "ai.models") -> List[Dict[str, Any]]:
        """Discover available model components"""
        try:
            from src.utils.component_discovery import discover_components, get_detailed_class_info
            
            components = discover_components(folder=folder)
            result = []
            
            for comp in components:
                try:
                    module_path = f"{folder}.{comp}"
                    class_info = get_detailed_class_info(module_path, comp)
                    
                    if class_info and class_info.get("classes"):
                        result.append({
                            "name": comp,
                            "module_path": module_path,
                            "class_info": class_info
                        })
                except Exception as e:
                    logger.warning(f"[MODEL_CONFIG] Failed to introspect {comp}: {e}")
                    result.append({
                        "name": comp,
                        "module_path": f"{folder}.{comp}",
                        "error": str(e)
                    })
            
            return result
            
        except Exception as e:
            logger.error(f"[MODEL_CONFIG] Failed to discover components: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to discover model components"
            )

    @classmethod
    async def introspect_model(cls, module_path: str, kind: str = "model") -> Dict[str, Any]:
        """Introspect a model to get its parameters and class information"""
        try:
            from src.utils.component_discovery import get_detailed_class_info

            # Extract component name from module path
            component_name = module_path.split('.')[-1]

            class_info = get_detailed_class_info(module_path, component_name)

            if not class_info:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"No class information found for {module_path}"
                )

            # Flatten formatted_params for frontend compatibility (like ToolConfig)
            # If only one class, put its formatted_params at top level
            if "classes" in class_info and class_info["classes"]:
                first_class = next(iter(class_info["classes"].values()))
                class_info["class_name"] = first_class.get("class_name", "")
                class_info["formatted_params"] = first_class.get("formatted_params", [])

            return class_info
            
        except Exception as e:
            logger.error(f"[MODEL_CONFIG] Failed to introspect model {module_path}: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to introspect model: {str(e)}"
            )

    @classmethod
    async def get_model_categories(cls, user: dict) -> List[str]:
        """Get all unique categories for model configurations in user's tenant"""
        tenant_id = await cls.validate_tenant_access(user)
        
        try:
            categories = await MongoStorageService.distinct("modelConfig", "category", {}, tenant_id=tenant_id)
            
            # Filter out empty categories and sort
            categories = [cat for cat in categories if cat and cat.strip()]
            return sorted(categories)
            
        except Exception as e:
            logger.error(f"[MODEL_CONFIG] Failed to get categories: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to get model categories"
            )
