"""
Role management routes for RBAC system
"""

from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends, status, Response
from pydantic import BaseModel, EmailStr

from ..utils.auth import verify_token_middleware
from ..services.rbac_service import RBACService
from ..services.tenant_service import TenantService
from ..utils.log import logger

router = APIRouter(prefix="/api")


# Pydantic models
class RoleCreate(BaseModel):
    # Accept both new and legacy field names
    roleName: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = ""
    permissions: Optional[List[str]] = []
    role_type: Optional[str] = None


class RoleUpdate(BaseModel):
    description: Optional[str] = None
    permissions: Optional[List[str]] = None


class RoleAssignment(BaseModel):
    userId: str
    roleId: str


class UserInvitation(BaseModel):
    email: EmailStr
    firstName: str
    lastName: str
    roleIds: Optional[List[str]] = []


class RoleResponse(BaseModel):
    roleId: str
    roleName: str
    description: str
    permissions: List[str]
    createdAt: float
    active: bool
    # Legacy field mirrors for compatibility
    name: Optional[str] = None
    role_id: Optional[str] = None
    role_type: Optional[str] = None


class UserRoleResponse(BaseModel):
    userId: str
    roleId: str
    roleName: str
    assignedAt: float


@router.post("/roles", response_model=RoleResponse, status_code=status.HTTP_201_CREATED)
async def create_role(
    role_data: RoleCreate,
    response: Response,
    user: dict = Depends(verify_token_middleware)
):
    """Create a new role.

    Owner-managed: any authenticated user can create roles they own (ownerId = current user id).
    """
    
    # Check if user is system admin
    user_id = user.get("id")
    if not user_id:
        logger.error(f"[ROLES] Invalid user attempting to create role: {user}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user"
        )
    
    try:
        # Determine role name from either field
        role_name = role_data.roleName or role_data.name
        if not role_name:
            logger.warning(f"[ROLES] Role creation failed - missing name for user: {user_id}")
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="roleName or name is required")

        # Get user's tenant ID
        tenant_id = await TenantService.get_user_tenant_id(user_id)

        role = await RBACService.create_role(
            role_name=role_name,
            description=role_data.description,
            permissions=role_data.permissions,
            owner_id=user_id,
            tenant_id=tenant_id,
        )
        # Add legacy mirror fields for compatibility
        role_out = {
            **role,
            "name": role["roleName"],
            "role_id": role["roleId"],
            "role_type": role_data.role_type,
        }
        # Dynamic status code: legacy payloads (name) expect 201; new payloads (roleName) expect 200
        if role_data.name and not role_data.roleName:
            response.status_code = status.HTTP_201_CREATED
        else:
            response.status_code = status.HTTP_200_OK
        return RoleResponse(**role_out)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create role: {str(e)}"
        )


@router.put("/roles/{role_id}", response_model=RoleResponse)
async def update_role(
    role_id: str,
    role_data: RoleUpdate,
    user: dict = Depends(verify_token_middleware)
):
    """Update an existing role.

    Allowed for the role owner. Default personal roles are immutable.
    """
    
    user_id = user.get("id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user"
        )
    
    try:
        # Get user's tenant ID
        tenant_id = await TenantService.get_user_tenant_id(user_id)
        
        # Use service to update role
        updated_role = await RBACService.update_role(
            role_id, 
            role_data.dict(exclude_unset=True), 
            user_id,
            tenant_id=tenant_id
        )
        
        # Include legacy mirrors for compatibility
        updated_role = {
            **updated_role, 
            "name": updated_role.get("roleName"), 
            "role_id": updated_role.get("roleId")
        }
        return RoleResponse(**updated_role)
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update role: {str(e)}"
        )


@router.delete("/roles/{role_id}")
async def delete_role(
    role_id: str,
    user: dict = Depends(verify_token_middleware)
):
    """Delete a role.

    Allowed for the role owner. Default personal roles cannot be deleted.
    """
    
    user_id = user.get("id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user"
        )
    
    try:
        tenant_id = await TenantService.get_user_tenant_id(user.get("id"))
        result = await RBACService.delete_role(role_id, user_id, tenant_id=tenant_id)
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete role: {str(e)}"
        )


@router.get("/roles", response_model=List[RoleResponse])
async def get_roles(user: dict = Depends(verify_token_middleware)):
    """Get all roles visible to the user"""
    
    user_id = user.get("id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user"
        )
    
    try:
        tenant_id = await TenantService.get_user_tenant_id(user.get("id"))
        roles = await RBACService.get_all_roles(user_id, tenant_id=tenant_id)
        # Extra safeguard: enforce owner-managed visibility at the route level too.
        # Filter roles to only those owned by the caller (tenant-based isolation)
        roles = [r for r in roles if r.get("ownerId") == user_id]
        # Include legacy mirrors
        roles = [{**r, "name": r.get("roleName"), "role_id": r.get("roleId")} for r in roles]
        return [RoleResponse(**role) for role in roles]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch roles: {str(e)}"
        )


@router.get("/roles/my-roles", response_model=List[RoleResponse])
async def get_my_roles(user: dict = Depends(verify_token_middleware)):
    """Get current user's roles"""
    
    user_id = user.get("id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user"
        )
    
    try:
        tenant_id = await TenantService.get_user_tenant_id(user_id)
        roles = await RBACService.get_user_roles(user_id, tenant_id=tenant_id)
        roles = [{**r, "name": r.get("roleName"), "role_id": r.get("roleId")} for r in roles]
        return [RoleResponse(**role) for role in roles]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch user roles: {str(e)}"
        )


@router.post("/roles/assign")
async def assign_role(
    assignment: RoleAssignment,
    user: dict = Depends(verify_token_middleware)
):
    """Assign role to user (role owner only)"""
    
    user_id = user.get("id")
    if not user_id:
        logger.error(f"[ROLES] Invalid user attempting role assignment: {user}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user"
        )
    # Check ownership of the role
    tenant_id = await TenantService.get_user_tenant_id(user_id)
    if not await RBACService.is_role_owner(user_id, assignment.roleId, tenant_id=tenant_id):
        logger.warning(f"[ROLES] User {user_id} attempted to assign role {assignment.roleId} without ownership")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only role owners can assign roles"
        )
    
    try:
        await RBACService.assign_role_to_user(
            user_id=assignment.userId,
            role_id=assignment.roleId,
            tenant_id=tenant_id
        )
        return {"message": "Role assigned successfully"}
    except Exception as e:
        logger.error(f"[ROLES] CRITICAL: Failed to assign role {assignment.roleId} to user {assignment.userId}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to assign role: {str(e)}"
        )


@router.delete("/roles/assign")
async def remove_role(
    assignment: RoleAssignment,
    user: dict = Depends(verify_token_middleware)
):
    """Remove role from user (role owner only)"""
    
    user_id = user.get("id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user"
        )
    # Check ownership of the role
    tenant_id = await TenantService.get_user_tenant_id(user_id)
    if not await RBACService.is_role_owner(user_id, assignment.roleId, tenant_id=tenant_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only role owners can remove roles"
        )
    
    try:
        success = await RBACService.remove_role_from_user(
            user_id=assignment.userId,
            role_id=assignment.roleId,
            tenant_id=tenant_id
        )
        
        if success:
            return {"message": "Role removed successfully"}
        else:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Role assignment not found"
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to remove role: {str(e)}"
        )


@router.get("/users/{user_id}/roles", response_model=List[RoleResponse])
async def get_user_roles(
    user_id: str,
    user: dict = Depends(verify_token_middleware)
):
    """Get roles for a specific user (own roles or when you own any of the user's roles)"""
    
    current_user_id = user.get("id")
    if not current_user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user"
        )
    
    # Users can see their own roles; role owners can see users for whom they own any assigned role
    tenant_id = await TenantService.get_user_tenant_id(current_user_id)
    if current_user_id != user_id:
        target_roles = await RBACService.get_user_roles(user_id, tenant_id=tenant_id)
        # Allow if any target role is owned by requester OR role is unowned (system role)
        if not any((r.get("ownerId") == current_user_id) or (not r.get("ownerId")) for r in target_roles):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to view roles for this user"
            )
    
    try:
        roles = await RBACService.get_user_roles(user_id, tenant_id=tenant_id)
        roles = [{**r, "name": r.get("roleName"), "role_id": r.get("roleId")} for r in roles]
        return [RoleResponse(**role) for role in roles]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch user roles: {str(e)}"
        )
