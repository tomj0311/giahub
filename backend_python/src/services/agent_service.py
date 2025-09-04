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
    async def list_agents(cls, user: dict) -> List[Dict[str, Any]]:
        """List agents for current tenant"""
        tenant_id = await cls.validate_tenant_access(user)
        logger.info(f"[AGENTS] Listing agents for tenant: {tenant_id}")
        
        try:
            docs = await MongoStorageService.find_many("agents", {}, tenant_id=tenant_id, sort_field="name", sort_order=1)
            logger.debug(f"[AGENTS] Found {len(docs)} agents for tenant: {tenant_id}")
            
            items: List[Dict[str, Any]] = []
            for d in docs:
                item = {
                    "id": str(d.get("_id")),
                    "name": d.get("name"),
                    "category": d.get("category", ""),
                    "description": d.get("description", ""),
                    "instructions": d.get("instructions", ""),
                    "model": d.get("model"),
                    "tools": d.get("tools", {}),
                    "collection": d.get("collection", ""),
                    "memory": d.get("memory", {}),
                    "created_at": d.get("created_at"),
                    "updated_at": d.get("updated_at"),
                }
                items.append(item)
            
            logger.info(f"[AGENTS] Successfully retrieved {len(items)} agents for tenant: {tenant_id}")
            return items
        except Exception as e:
            logger.error(f"[AGENTS] Failed to list agents for tenant {tenant_id}: {e}")
            raise HTTPException(status_code=500, detail="Failed to retrieve agents")
    
    @classmethod
    async def get_agent_by_name(cls, name: str, user: dict) -> Dict[str, Any]:
        """Get a specific agent by name"""
        tenant_id = await cls.validate_tenant_access(user)
        logger.info(f"[AGENTS] Getting agent '{name}' for tenant: {tenant_id}")
        
        try:
            doc = await MongoStorageService.find_one("agents", {"name": name}, tenant_id=tenant_id)
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
            record = {
                "tenantId": tenant_id,
                "userId": user_id,
                "name": name,
                "category": payload.get("category", ""),
                "description": payload.get("description", ""),
                "instructions": payload.get("instructions", ""),
                "model": payload.get("model") or {},
                "tools": payload.get("tools") or {},
                "collection": payload.get("collection", ""),
                "memory": payload.get("memory") or {},
                "updated_at": datetime.utcnow(),
            }

            existing = await MongoStorageService.find_one("agents", {"name": name}, tenant_id=tenant_id)
            if existing:
                logger.debug(f"[AGENTS] Updating existing agent '{name}' for tenant: {tenant_id}")
                await MongoStorageService.update_one("agents", {"_id": existing["_id"]}, {"$set": record}, tenant_id=tenant_id)
                action = "updated"
            else:
                logger.debug(f"[AGENTS] Creating new agent '{name}' for tenant: {tenant_id}")
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
