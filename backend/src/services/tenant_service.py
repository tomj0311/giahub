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
from ..utils.mongo_storage import MongoStorageService


class TenantService:
    """Service for managing multi-tenancy"""
    
    @staticmethod
    async def create_default_tenant(user_email: str, user_id: str) -> Dict:
        """Create a default tenant for a new user registration"""
        logger.info(f"[TENANT] Creating default tenant for user: {user_email} (ID: {user_id})")

        
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
            await MongoStorageService.insert_one("tenants", tenant_data)
            logger.info(f"[TENANT] Successfully created tenant: {tenant_id} for user: {user_email}")
            
            # Create a tenant admin role for the owner
            await TenantService.create_tenant_admin_role(user_id, tenant_id, user_email)
            
        except Exception as e:
            logger.error(f"[TENANT] Failed to create tenant for user {user_email}: {e}")
            raise
            
        return tenant_data
    
    @staticmethod
    async def create_tenant_admin_role(user_id: str, tenant_id: str, user_email: str) -> None:
        """Create and assign a tenant admin role to the tenant owner"""
        from .rbac_service import RBACService
        
        logger.info(f"[TENANT] Creating tenant admin role for user: {user_id} in tenant: {tenant_id}")
        
        try:
            # Create a tenant-specific admin role
            admin_role_name = f"admin@{user_email}_tenant_{tenant_id[:8]}"
            admin_role = await RBACService.create_role(
                role_name=admin_role_name,
                description=f"Tenant administrator for {user_email}",
                permissions=["manage_users", "manage_roles", "manage_settings", "full_access"],
                owner_id=user_id,
                is_default=False,
                tenant_id=tenant_id
            )
            
            # Assign the admin role to the user
            await RBACService.assign_role_to_user(user_id, admin_role["roleId"], tenant_id=tenant_id)
            logger.info(f"[TENANT] Successfully assigned tenant admin role to user: {user_id}")
            
        except Exception as e:
            logger.error(f"[TENANT] Failed to create tenant admin role for user {user_id}: {e}")
            # Don't raise here to avoid breaking tenant creation
            pass
    
    @staticmethod
    async def get_tenant_by_id(tenant_id: str) -> Optional[Dict]:
        """Get tenant by ID"""
        logger.debug(f"[TENANT] Fetching tenant by ID: {tenant_id}")

        tenant = await MongoStorageService.find_one("tenants", {"tenantId": tenant_id})
        if tenant:
            logger.debug(f"[TENANT] Found tenant: {tenant['name']}")
        else:
            logger.warning(f"[TENANT] Tenant not found: {tenant_id}")
        return tenant
    
    @staticmethod
    async def get_user_tenant_id(user_id: str) -> Optional[str]:
        """Get tenant_id for a user"""
        logger.debug(f"[TENANT] Getting tenant ID for user: {user_id}")

        # Use MongoStorageService properly - users collection is exempt from tenant enforcement during OAuth flows
        user = await MongoStorageService.find_one("users", {"_id": user_id})
            
        tenant_id = user.get("tenantId") if user else None
        if tenant_id:
            logger.debug(f"[TENANT] User {user_id} belongs to tenant: {tenant_id}")
        else:
            logger.warning(f"[TENANT] No tenant found for user: {user_id}")
        return tenant_id
    
    @staticmethod
    async def get_user_tenant_info(user_id: str) -> Optional[Dict]:
        """Get tenant information for a user"""
        logger.debug(f"[TENANT] Getting tenant info for user: {user_id}")
        
        # Get user's tenant_id
        tenant_id = await TenantService.get_user_tenant_id(user_id)
        if not tenant_id:
            logger.warning(f"[TENANT] No tenant found for user: {user_id}")
            return None
        
        # Get tenant details
        tenant = await TenantService.get_tenant_by_id(tenant_id)
        if not tenant:
            logger.warning(f"[TENANT] Tenant details not found for ID: {tenant_id}")
            return None
        
        return {
            "tenant_id": tenant_id,
            "tenant_name": tenant.get("name"),
            "tenant_description": tenant.get("description"),
            "owner_id": tenant.get("ownerId")
        }
    
    @staticmethod
    async def verify_tenant_access(user_id: str, tenant_id: str) -> bool:
        """Verify that user belongs to the specified tenant"""
        user_tenant = await TenantService.get_user_tenant_id(user_id)
        return user_tenant == tenant_id
    
    @staticmethod
    async def add_user_to_tenant(user_id: str, tenant_id: str) -> bool:
        """Add user to a tenant (used for invitations)"""
        logger.info(f"[TENANT] Adding user {user_id} to tenant: {tenant_id}")

        
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
            result = await MongoStorageService.update_one(
                "users",
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
        return await TenantService.filter_by_tenant_id(user_tenant_id, query)
    
    @staticmethod
    async def filter_by_tenant_id(tenant_id: Optional[str], query: Dict) -> Dict:
        """Add tenant filtering to a MongoDB query using tenant_id directly"""
        if tenant_id:
            query["tenantId"] = tenant_id
        return query
    
    @staticmethod
    async def add_tenant_to_record(user_id: str, record: Dict) -> Dict:
        """Add tenant_id to a record before saving"""
        user_tenant_id = await TenantService.get_user_tenant_id(user_id)
        return await TenantService.add_tenant_to_record_by_id(user_tenant_id, record)
    
    @staticmethod
    async def add_tenant_to_record_by_id(tenant_id: Optional[str], record: Dict) -> Dict:
        """Add tenant_id to a record before saving using tenant_id directly"""
        if tenant_id:
            record["tenantId"] = tenant_id
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
