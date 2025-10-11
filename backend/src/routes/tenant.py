"""
Tenant Management Routes

Routes for managing tenants, viewing tenant information, and tenant settings.
"""

from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel

from ..utils.log import logger
from ..utils.auth import verify_token_middleware
from ..utils.mongo_storage import MongoStorageService
from ..services.tenant_service import TenantService
from ..services.rbac_service import RBACService
from ..utils.tenant_middleware import tenant_filter_query

router = APIRouter(prefix="/api/tenant", tags=["tenant"])


# Pydantic models
class TenantResponse(BaseModel):
    tenantId: str
    name: str
    description: Optional[str] = None
    ownerId: str
    createdAt: float
    active: bool
    isDefault: bool
    settings: dict


class TenantUpdateRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    settings: Optional[dict] = None


@router.get("/my-tenant", response_model=TenantResponse)
async def get_my_tenant(user: dict = Depends(verify_token_middleware)):
    """Get current user's tenant information"""
    user_id = user.get("id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user"
        )
    
    tenant_id = await TenantService.get_user_tenant_id(user_id)
    if not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No tenant found for user"
        )
    
    tenant = await TenantService.get_tenant_by_id(tenant_id)
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tenant not found"
        )
    
    return TenantResponse(**tenant)


@router.get("/stats")
async def get_tenant_stats(user: dict = Depends(verify_token_middleware)):
    """Get statistics for current user's tenant"""
    user_id = user.get("id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user"
        )
    
    # Get tenant-filtered counts
    user_query = await tenant_filter_query(user_id, {})
    role_query = await tenant_filter_query(user_id, {})
    
    total_users = await MongoStorageService.count_documents("users", user_query)
    total_roles = await MongoStorageService.count_documents("roles", role_query)
    
    # Get active users (logged in recently)
    import time
    week_ago = (time.time() - 7 * 24 * 60 * 60) * 1000  # 7 days ago in milliseconds
    
    active_users_query = user_query.copy()
    # Note: You'd need a lastLogin field to track this properly
    # For now, just count all active users
    active_users_query["active"] = True
    active_users = await MongoStorageService.count_documents("users", active_users_query)
    
    return {
        "totalUsers": total_users,
        "activeUsers": active_users,
        "totalRoles": total_roles,
        "tenantId": await TenantService.get_user_tenant_id(user_id)
    }


@router.put("/my-tenant", response_model=TenantResponse)
async def update_my_tenant(
    request: TenantUpdateRequest,
    user: dict = Depends(verify_token_middleware)
):
    """Update current user's tenant (owner only)"""
    user_id = user.get("id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user"
        )
    
    tenant_id = await TenantService.get_user_tenant_id(user_id)
    if not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No tenant found for user"
        )
    
    tenant = await TenantService.get_tenant_by_id(tenant_id)
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tenant not found"
        )
    
    # Check if user is the owner
    if tenant.get("ownerId") != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only tenant owner can update tenant settings"
        )
    
    # Build update data
    update_data = {}
    if request.name is not None:
        update_data["name"] = request.name
    if request.description is not None:
        update_data["description"] = request.description
    if request.settings is not None:
        update_data["settings"] = request.settings
    
    if not update_data:
        return TenantResponse(**tenant)
    
    # Update tenant
    await MongoStorageService.update_one(
        "tenants",
        {"tenantId": tenant_id},
        update_data
    )
    
    # Get updated tenant
    updated_tenant = await TenantService.get_tenant_by_id(tenant_id)
    return TenantResponse(**updated_tenant)


@router.get("/users")
async def get_tenant_users(user: dict = Depends(verify_token_middleware)):
    """Get all users in current user's tenant"""
    user_id = user.get("id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user"
        )
    
    # Get tenant-filtered users
    query = await tenant_filter_query(user_id, {})
    users = await MongoStorageService.find_many("users", query)
    
    # Remove password fields and add role information
    result = []
    tenant_id = await TenantService.get_user_tenant_id(user_id)
    for user_data in users:
        user_data.pop("password", None)
        user_roles = await RBACService.get_user_roles(user_data.get("id"), tenant_id=tenant_id)
        user_data["roles"] = user_roles
        result.append(user_data)
    
    return result


@router.get("/roles")
async def get_tenant_roles(user: dict = Depends(verify_token_middleware)):
    """Get all roles in current user's tenant"""
    user_id = user.get("id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user"
        )
    
    # Use existing RBAC service which already filters by tenant and ownership
    tenant_id = await TenantService.get_user_tenant_id(user.get("id"))
    roles = await RBACService.get_all_roles(user_id, tenant_id=tenant_id)
    return roles


@router.get("/activity")
async def get_tenant_activity(user: dict = Depends(verify_token_middleware)):
    """Get recent activity in current user's tenant"""
    user_id = user.get("id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user"
        )
    
    # Get recent user registrations in tenant
    query = await tenant_filter_query(user_id, {})
    recent_users = await MongoStorageService.find_many("users", query, sort_field="createdAt", sort_order=-1, limit=5)
    
    # Get recent role assignments in tenant
    role_query = await tenant_filter_query(user_id, {})
    recent_assignments = await MongoStorageService.find_many("userRoles", role_query, sort_field="assignedAt", sort_order=-1, limit=5)
    
    # Format activity feed
    activity = []
    
    for user_data in recent_users:
        activity.append({
            "type": "user_joined",
            "message": f"{user_data.get('name', user_data.get('email'))} joined the organization",
            "timestamp": user_data.get("createdAt"),
            "userId": user_data.get("id")
        })
    
    for assignment in recent_assignments:
        # Get role name
        tenant_id = await TenantService.get_user_tenant_id(user_id)
        role = await RBACService.get_role_by_id(assignment.get("roleId"), tenant_id=tenant_id)
        role_name = role.get("roleName") if role else "Unknown Role"
        
        # Get user name
        user_data = await MongoStorageService.find_one("users", {"id": assignment.get("userId")})
        user_name = user_data.get("name", user_data.get("email")) if user_data else "Unknown User"
        
        activity.append({
            "type": "role_assigned",
            "message": f"{user_name} was assigned role '{role_name}'",
            "timestamp": assignment.get("assignedAt"),
            "userId": assignment.get("userId"),
            "roleId": assignment.get("roleId")
        })
    
    # Sort by timestamp and return latest
    activity.sort(key=lambda x: x.get("timestamp", 0), reverse=True)
    return activity[:10]
