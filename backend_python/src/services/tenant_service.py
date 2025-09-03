"""
Multi-Tenant Service

This service manages tenant creation, isolation, and inheritance.
When a user registers, they get a default tenant. When users invite others,
the invitees inherit the inviter's tenant_id.
"""

import uuid
from datetime import datetime
from typing import Dict, Optional
from fastapi import HTTPException, status

from ..utils.log import logger
from ..db import get_collections


class TenantService:
    """Service for managing multi-tenancy"""
    
    @staticmethod
    async def create_default_tenant(user_email: str, user_id: str) -> Dict:
        """Create a default tenant for a new user registration"""
        logger.info(f"[TENANT] Creating default tenant for user: {user_email} (ID: {user_id})")
        collections = get_collections()
        
        tenant_id = str(uuid.uuid4())
        tenant_name = f"Organization of {user_email.split('@')[0]}"
        logger.debug(f"[TENANT] Generated tenant ID: {tenant_id}, name: {tenant_name}")
        
        tenant_data = {
            "tenantId": tenant_id,
            "name": tenant_name,
            "description": f"Default organization for {user_email}",
            "ownerId": user_id,
            "createdAt": datetime.utcnow().timestamp() * 1000,
            "active": True,
            "isDefault": True,
            "settings": {
                "allowInvitations": True,
                "maxUsers": 100,  # Default limit
                "features": ["basic"]
            }
        }
        
        try:
            await collections['tenants'].insert_one(tenant_data)
            logger.info(f"[TENANT] Successfully created tenant: {tenant_id} for user: {user_email}")
        except Exception as e:
            logger.error(f"[TENANT] Failed to create tenant for user {user_email}: {e}")
            raise
            
        return tenant_data
    
    @staticmethod
    async def get_tenant_by_id(tenant_id: str) -> Optional[Dict]:
        """Get tenant by ID"""
        logger.debug(f"[TENANT] Fetching tenant by ID: {tenant_id}")
        collections = get_collections()
        tenant = await collections['tenants'].find_one({"tenantId": tenant_id})
        if tenant:
            logger.debug(f"[TENANT] Found tenant: {tenant['name']}")
        else:
            logger.warning(f"[TENANT] Tenant not found: {tenant_id}")
        return tenant
    
    @staticmethod
    async def get_user_tenant_id(user_id: str) -> Optional[str]:
        """Get tenant_id for a user"""
        logger.debug(f"[TENANT] Getting tenant ID for user: {user_id}")
        collections = get_collections()
        user = await collections['users'].find_one({"id": user_id})
        tenant_id = user.get("tenantId") if user else None
        if tenant_id:
            logger.debug(f"[TENANT] User {user_id} belongs to tenant: {tenant_id}")
        else:
            logger.warning(f"[TENANT] No tenant found for user: {user_id}")
        return tenant_id
    
    @staticmethod
    async def verify_tenant_access(user_id: str, tenant_id: str) -> bool:
        """Verify that user belongs to the specified tenant"""
        user_tenant = await TenantService.get_user_tenant_id(user_id)
        return user_tenant == tenant_id
    
    @staticmethod
    async def add_user_to_tenant(user_id: str, tenant_id: str) -> bool:
        """Add user to a tenant (used for invitations)"""
        logger.info(f"[TENANT] Adding user {user_id} to tenant: {tenant_id}")
        collections = get_collections()
        
        # Verify tenant exists
        tenant = await TenantService.get_tenant_by_id(tenant_id)
        if not tenant:
            logger.error(f"[TENANT] Cannot add user to non-existent tenant: {tenant_id}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Tenant not found"
            )
        
        # Update user with tenant_id
        try:
            result = await collections['users'].update_one(
                {"id": user_id},
                {"$set": {"tenantId": tenant_id}}
            )
            
            if result.modified_count > 0:
                logger.info(f"[TENANT] Successfully added user {user_id} to tenant {tenant_id}")
            else:
                logger.warning(f"[TENANT] No changes made when adding user {user_id} to tenant {tenant_id}")
            
            return result.modified_count > 0
        except Exception as e:
            logger.error(f"[TENANT] Failed to add user {user_id} to tenant {tenant_id}: {e}")
            raise
    
    @staticmethod
    async def filter_by_tenant(user_id: str, query: Dict) -> Dict:
        """Add tenant filtering to a MongoDB query"""
        user_tenant_id = await TenantService.get_user_tenant_id(user_id)
        if user_tenant_id:
            query["tenantId"] = user_tenant_id
        return query
    
    @staticmethod
    async def add_tenant_to_record(user_id: str, record: Dict) -> Dict:
        """Add tenant_id to a record before saving"""
        user_tenant_id = await TenantService.get_user_tenant_id(user_id)
        if user_tenant_id:
            record["tenantId"] = user_tenant_id
        return record
    
    @staticmethod
    async def ensure_tenant_isolation(user_id: str, record: Dict) -> bool:
        """Ensure user can only access records from their tenant"""
        user_tenant_id = await TenantService.get_user_tenant_id(user_id)
        record_tenant_id = record.get("tenantId")
        
        # If record has no tenant_id, it's considered public (legacy data)
        if not record_tenant_id:
            return True
            
        # User must belong to the same tenant
        return user_tenant_id == record_tenant_id
