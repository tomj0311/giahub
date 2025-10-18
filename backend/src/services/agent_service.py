"""
Agent Service

This service handles all agent-related business logic including CRUD operations,
validation, and agent-specific functionality.
"""

from datetime import datetime
from typing import Optional, Dict, Any, List
from fastapi import HTTPException, status

from ..utils.log import logger
from ..utils.mongo_storage import MongoStorageService


class AgentService:
    """Service for managing agents"""
    
    @staticmethod
    async def validate_tenant_access(user: dict) -> str:
        """Validate tenant access and return tenant_id"""
        tenant_id = user.get("tenantId")
        if not tenant_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User tenant information missing. Please re-login."
            )
        return tenant_id
    
    @classmethod
    async def list_agents_paginated(
        cls, 
        user: dict, 
        page: int = 1, 
        page_size: int = 8,
        category: Optional[str] = None,
        search: Optional[str] = None,
        sort_by: str = "created_at",
        sort_order: str = "desc"
    ) -> Dict[str, Any]:
        """List agents with pagination, filtering, and sorting"""
        tenant_id = await cls.validate_tenant_access(user)
        
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
            total_count = await MongoStorageService.count_documents("agents", filter_query, tenant_id=tenant_id)
            
            # Calculate pagination info
            total_pages = (total_count + page_size - 1) // page_size  # Ceiling division
            has_next = page < total_pages
            has_prev = page > 1
            
            # Determine sort order
            sort_direction = -1 if sort_order == "desc" else 1
            
            # Get paginated results
            docs = await MongoStorageService.find_many(
                "agents", 
                filter_query,
                tenant_id=tenant_id,
                sort_field=sort_by,
                sort_order=sort_direction,
                skip=skip,
                limit=page_size
            )
            
            items: List[Dict[str, Any]] = []
            for d in docs:
                # Get model config if model ID is present
                model_data = d.get("model")
                if model_data and isinstance(model_data, dict) and model_data.get("id"):
                    try:
                        from bson import ObjectId
                        model_config = await MongoStorageService.find_one("modelConfig", {"_id": ObjectId(model_data["id"])}, tenant_id=tenant_id)
                        if model_config:
                            # Convert ObjectId to string
                            if "_id" in model_config:
                                model_config["id"] = str(model_config.pop("_id"))
                            model_data = model_config
                    except Exception as e:
                        logger.warning(f"[AGENTS] Failed to populate model config {model_data.get('id')}: {e}")
                
                # Get tool configs if tool IDs are present
                tools_data = d.get("tools", {})
                populated_tools = {}
                for tool_id, tool_config in tools_data.items():
                    try:
                        from bson import ObjectId
                        # tool_id is the actual ID, look it up in toolConfig collection
                        tool_ref = await MongoStorageService.find_one("toolConfig", {"_id": ObjectId(tool_id)}, tenant_id=tenant_id)
                        if tool_ref:
                            # Convert ObjectId to string and add name
                            if "_id" in tool_ref:
                                tool_ref["id"] = str(tool_ref.pop("_id"))
                            # Merge any existing config with the fetched tool data
                            populated_tools[tool_id] = {**tool_ref, **tool_config}
                        else:
                            # If tool not found, keep original config with ID
                            populated_tools[tool_id] = {"id": tool_id, **tool_config}
                    except Exception as e:
                        logger.warning(f"[AGENTS] Failed to populate tool config {tool_id}: {e}")
                        populated_tools[tool_id] = {"id": tool_id, **tool_config}
                
                # Get knowledge collections if collection IDs are present
                collections_data = d.get("collections", {})
                populated_collections = {}
                for collection_id, collection_config in collections_data.items():
                    try:
                        from bson import ObjectId
                        # collection_id is the actual ID, look it up in knowledgeConfig collection
                        knowledge_ref = await MongoStorageService.find_one("knowledgeConfig", {"_id": ObjectId(collection_id)}, tenant_id=tenant_id)
                        if knowledge_ref:
                            # Convert ObjectId to string and add name
                            if not knowledge_ref.get("name") and knowledge_ref.get("collection"):
                                knowledge_ref["name"] = knowledge_ref["collection"]
                            if "_id" in knowledge_ref:
                                knowledge_ref["id"] = str(knowledge_ref.pop("_id"))
                            # Merge any existing config with the fetched knowledge data
                            populated_collections[collection_id] = {**knowledge_ref, **collection_config}
                        else:
                            # If knowledge collection not found, keep original config with ID
                            populated_collections[collection_id] = {"id": collection_id, **collection_config}
                    except Exception as e:
                        logger.warning(f"[AGENTS] Failed to populate knowledge config {collection_id}: {e}")
                        populated_collections[collection_id] = {"id": collection_id, **collection_config}
                
                # Handle backward compatibility for old single collection field
                collection_data = d.get("collection", "")
                if collection_data and not populated_collections:
                    try:
                        from bson import ObjectId
                        if ObjectId.is_valid(collection_data):
                            knowledge_config = await MongoStorageService.find_one("knowledgeConfig", {"_id": ObjectId(collection_data)}, tenant_id=tenant_id)
                            if knowledge_config:
                                # Convert ObjectId to string
                                if "_id" in knowledge_config:
                                    knowledge_config["id"] = str(knowledge_config.pop("_id"))
                                collection_data = knowledge_config
                    except Exception as e:
                        logger.warning(f"[AGENTS] Failed to populate knowledge config {collection_data}: {e}")
                
                item = {
                    "id": str(d.get("_id")),
                    "name": d.get("name"),
                    "category": d.get("category", ""),
                    "description": d.get("description", ""),
                    "instructions": d.get("instructions", ""),
                    "model": model_data,
                    "tools": populated_tools,
                    "collections": populated_collections,
                    "collection": collection_data,  # Keep for backward compatibility
                    "memory": d.get("memory", {}),
                    "stream": d.get("stream", True),  # Default to True if not set
                    "created_at": d.get("created_at"),
                    "updated_at": d.get("updated_at"),
                }
                items.append(item)
            
            result = {
                "agents": items,
                "pagination": {
                    "page": page,
                    "page_size": page_size,
                    "total": total_count,
                    "total_pages": total_pages,
                    "has_next": has_next,
                    "has_prev": has_prev
                }
            }
            
            return result
        except Exception as e:
            logger.error(f"[AGENTS] Failed to list agents for tenant {tenant_id}: {e}")
            raise HTTPException(status_code=500, detail="Failed to retrieve agents")

    @classmethod
    async def list_agents(cls, user: dict) -> List[Dict[str, Any]]:
        """List agents for current tenant with populated references"""
        tenant_id = await cls.validate_tenant_access(user)
        
        try:
            docs = await MongoStorageService.find_many("agents", {}, tenant_id=tenant_id, sort_field="created_at", sort_order=-1)
            
            items: List[Dict[str, Any]] = []
            for d in docs:
                # Get model config if model ID is present
                model_data = d.get("model")
                if model_data and isinstance(model_data, dict) and model_data.get("id"):
                    try:
                        from bson import ObjectId
                        model_config = await MongoStorageService.find_one("modelConfig", {"_id": ObjectId(model_data["id"])}, tenant_id=tenant_id)
                        if model_config:
                            # Convert ObjectId to string
                            if "_id" in model_config:
                                model_config["id"] = str(model_config.pop("_id"))
                            model_data = model_config
                    except Exception as e:
                        logger.warning(f"[AGENTS] Failed to populate model config {model_data.get('id')}: {e}")
                
                # Get tool configs if tool IDs are present
                tools_data = d.get("tools", {})
                populated_tools = {}
                for tool_id, tool_config in tools_data.items():
                    try:
                        from bson import ObjectId
                        # tool_id is the actual ID, look it up in toolConfig collection
                        tool_ref = await MongoStorageService.find_one("toolConfig", {"_id": ObjectId(tool_id)}, tenant_id=tenant_id)
                        if tool_ref:
                            # Convert ObjectId to string and add name
                            if "_id" in tool_ref:
                                tool_ref["id"] = str(tool_ref.pop("_id"))
                            # Merge any existing config with the fetched tool data
                            populated_tools[tool_id] = {**tool_ref, **tool_config}
                        else:
                            # If tool not found, keep original config with ID
                            populated_tools[tool_id] = {"id": tool_id, **tool_config}
                    except Exception as e:
                        logger.warning(f"[AGENTS] Failed to populate tool config {tool_id}: {e}")
                        populated_tools[tool_id] = {"id": tool_id, **tool_config}
                
                # Get knowledge collections if collection IDs are present
                collections_data = d.get("collections", {})
                populated_collections = {}
                for collection_id, collection_config in collections_data.items():
                    try:
                        from bson import ObjectId
                        # collection_id is the actual ID, look it up in knowledgeConfig collection
                        knowledge_ref = await MongoStorageService.find_one("knowledgeConfig", {"_id": ObjectId(collection_id)}, tenant_id=tenant_id)
                        if knowledge_ref:
                            # Convert ObjectId to string and add name
                            if not knowledge_ref.get("name") and knowledge_ref.get("collection"):
                                knowledge_ref["name"] = knowledge_ref["collection"]
                            if "_id" in knowledge_ref:
                                knowledge_ref["id"] = str(knowledge_ref.pop("_id"))
                            # Merge any existing config with the fetched knowledge data
                            populated_collections[collection_id] = {**knowledge_ref, **collection_config}
                        else:
                            # If knowledge collection not found, keep original config with ID
                            populated_collections[collection_id] = {"id": collection_id, **collection_config}
                    except Exception as e:
                        logger.warning(f"[AGENTS] Failed to populate knowledge config {collection_id}: {e}")
                        populated_collections[collection_id] = {"id": collection_id, **collection_config}
                
                # Handle backward compatibility for old single collection field
                collection_data = d.get("collection", "")
                if collection_data and not populated_collections:
                    try:
                        from bson import ObjectId
                        if ObjectId.is_valid(collection_data):
                            knowledge_config = await MongoStorageService.find_one("knowledgeConfig", {"_id": ObjectId(collection_data)}, tenant_id=tenant_id)
                            if knowledge_config:
                                # Convert ObjectId to string
                                if "_id" in knowledge_config:
                                    knowledge_config["id"] = str(knowledge_config.pop("_id"))
                                collection_data = knowledge_config
                    except Exception as e:
                        logger.warning(f"[AGENTS] Failed to populate knowledge config {collection_data}: {e}")
                
                item = {
                    "id": str(d.get("_id")),
                    "name": d.get("name"),
                    "category": d.get("category", ""),
                    "description": d.get("description", ""),
                    "instructions": d.get("instructions", ""),
                    "model": model_data,
                    "tools": populated_tools,
                    "collections": populated_collections,
                    "collection": collection_data,  # Keep for backward compatibility
                    "memory": d.get("memory", {}),
                    "stream": d.get("stream", True),  # Default to True if not set
                    "created_at": d.get("created_at"),
                    "updated_at": d.get("updated_at"),
                }
                items.append(item)
            
            return items
        except Exception as e:
            logger.error(f"[AGENTS] Failed to list agents for tenant {tenant_id}: {e}")
            raise HTTPException(status_code=500, detail="Failed to retrieve agents")
    
    @classmethod
    async def list_all_agents_minimal(
        cls,
        user: dict,
        active_only: bool = True
    ) -> Dict[str, Any]:
        """Get all agents with minimal fields for dropdowns"""
        tenant_id = await cls.validate_tenant_access(user)
        
        try:
            # Build filter query
            filter_query = {}
            if active_only:
                filter_query["is_active"] = {"$ne": False}  # Include docs without is_active field
            
            # Only project essential fields
            projection = {
                "_id": 1,
                "name": 1,
                "category": 1,
                "description": 1
            }
            
            # Get all agents sorted by name
            docs = await MongoStorageService.find_many(
                "agents",
                filter_query,
                tenant_id=tenant_id,
                sort_field="name",
                sort_order=1,
                projection=projection
            )
            
            agents = []
            for doc in docs:
                agents.append({
                    "id": str(doc["_id"]),
                    "name": doc.get("name", ""),
                    "category": doc.get("category", ""),
                    "description": doc.get("description", "")
                })
            
            return {
                "agents": agents,
                "total": len(agents)
            }
        except Exception as e:
            logger.error(f"[AGENTS] Failed to list all agents minimal for tenant {tenant_id}: {e}")
            raise HTTPException(status_code=500, detail="Failed to retrieve agents")
    
    @classmethod
    async def get_agent_by_name(cls, name: str, user: dict) -> Dict[str, Any]:
        """Get a specific agent by name"""
        tenant_id = await cls.validate_tenant_access(user)
        logger.info(f"[AGENTS] Getting agent '{name}' for tenant: {tenant_id}")
        
        # Trim whitespace from search term
        trimmed_name = name.strip()
        
        try:
            # First try exact match
            doc = await MongoStorageService.find_one("agents", {"name": trimmed_name}, tenant_id=tenant_id)
            
            # If not found, try with regex to handle whitespace variations
            if not doc:
                # Use regex to match with optional leading/trailing whitespace
                import re
                pattern = f"^\\s*{re.escape(trimmed_name)}\\s*$"
                doc = await MongoStorageService.find_one("agents", {"name": {"$regex": pattern}}, tenant_id=tenant_id)
            
            if not doc:
                logger.warning(f"[AGENTS] Agent '{name}' not found for tenant: {tenant_id}")
                raise HTTPException(status_code=404, detail=f"Agent '{name}' not found")
            
            doc["id"] = str(doc.pop("_id"))
            logger.info(f"[AGENTS] Successfully retrieved agent '{name}' for tenant: {tenant_id}")
            return doc
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"[AGENTS] Failed to get agent '{name}' for tenant {tenant_id}: {e}")
            raise HTTPException(status_code=500, detail="Failed to retrieve agent")
    
    @classmethod
    async def upsert_agent(cls, payload: dict, user: dict) -> Dict[str, str]:
        """Create or update agent by name (unique per tenant)"""
        name = (payload.get("name") or "").strip()
        if not name:
            logger.warning("[AGENTS] Upsert agent failed - name is required")
            raise HTTPException(status_code=400, detail="name is required")

        tenant_id = await cls.validate_tenant_access(user)
        user_id = user.get("id") or user.get("userId") or "unknown"
        logger.info(f"[AGENTS] Upserting agent '{name}' for tenant: {tenant_id}, user: {user_id}")

        try:
            # Store the payload as-is with just tenant/user metadata and timestamps
            record = {
                **payload,  # Store entire payload as-is
                "tenantId": tenant_id,
                "userId": user_id,
                "updated_at": datetime.utcnow(),
            }
            # Normalize name (trim whitespace) before saving to enforce consistency
            record["name"] = name

            # Try exact match first
            existing = await MongoStorageService.find_one("agents", {"name": name}, tenant_id=tenant_id)
            # If not found, try whitespace-insensitive match to catch names stored with extra spaces
            if not existing:
                import re
                pattern = f"^\\s*{re.escape(name)}\\s*$"
                existing = await MongoStorageService.find_one(
                    "agents",
                    {"name": {"$regex": pattern}},
                    tenant_id=tenant_id,
                )
            if existing:
                await MongoStorageService.update_one("agents", {"_id": existing["_id"]}, {"$set": record}, tenant_id=tenant_id)
                action = "updated"
            else:
                record["created_at"] = datetime.utcnow()
                await MongoStorageService.insert_one("agents", record, tenant_id=tenant_id)
                action = "created"

            logger.info(f"[AGENTS] Successfully {action} agent '{name}' for tenant: {tenant_id}")
            return {"message": f"Agent {action}", "name": name}
        except Exception as e:
            logger.error(f"[AGENTS] Failed to upsert agent '{name}' for tenant {tenant_id}: {e}")
            raise HTTPException(status_code=500, detail="Failed to save agent")
    
    @classmethod
    async def delete_agent(cls, name: str, user: dict) -> Dict[str, str]:
        """Delete an agent by name"""
        tenant_id = await cls.validate_tenant_access(user)
        logger.info(f"[AGENTS] Deleting agent '{name}' for tenant: {tenant_id}")
        
        try:
            result = await MongoStorageService.delete_one("agents", {"name": name}, tenant_id=tenant_id)
            if not result:
                logger.warning(f"[AGENTS] Agent '{name}' not found for deletion in tenant: {tenant_id}")
                raise HTTPException(status_code=404, detail="Agent not found")
            
            logger.info(f"[AGENTS] Successfully deleted agent '{name}' for tenant: {tenant_id}")
            return {"message": f"Agent '{name}' deleted"}
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"[AGENTS] Failed to delete agent '{name}' for tenant {tenant_id}: {e}")
            raise HTTPException(status_code=500, detail="Failed to delete agent")
    
    @classmethod
    async def delete_agent_by_id(cls, agent_id: str, user: dict) -> Dict[str, str]:
        """Delete an agent by ID"""
        from bson import ObjectId
        from bson.errors import InvalidId
        
        try:
            object_id = ObjectId(agent_id)
        except InvalidId:
            logger.warning(f"[AGENTS] Invalid agent ID format: {agent_id}")
            raise HTTPException(status_code=400, detail="Invalid agent ID format")
        
        tenant_id = await cls.validate_tenant_access(user)
        logger.info(f"[AGENTS] Deleting agent by ID '{agent_id}' for tenant: {tenant_id}")
        
        try:
            result = await MongoStorageService.delete_one("agents", {"_id": object_id}, tenant_id=tenant_id)
            if not result:
                logger.warning(f"[AGENTS] Agent with ID '{agent_id}' not found for deletion in tenant: {tenant_id}")
                raise HTTPException(status_code=404, detail="Agent not found")
            
            logger.info(f"[AGENTS] Successfully deleted agent by ID '{agent_id}' for tenant: {tenant_id}")
            return {"message": f"Agent deleted"}
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"[AGENTS] Failed to delete agent by ID '{agent_id}' for tenant {tenant_id}: {e}")
            raise HTTPException(status_code=500, detail="Failed to delete agent")
