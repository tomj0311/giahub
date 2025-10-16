"""
Role-Based Access Control (RBAC) Service

This service manages roles, user-role assignments, and access control.
Every user gets a default role based on their email (user@email_role).
"""

import uuid
from datetime import datetime
from typing import List, Dict, Optional, Set
from fastapi import HTTPException, status

from ..utils.log import logger
from ..utils.mongo_storage import MongoStorageService


class RBACService:
    """Service for managing roles and permissions"""
    
    @staticmethod
    async def create_role(
        role_name: str,
        description: str = "",
        permissions: List[str] | None = None,
        *,
        owner_id: Optional[str] = None,
        is_default: bool = False,
        tenant_id: Optional[str] = None,
    ) -> Dict:
        """Create a new role.

        - Duplicate names are allowed across different owners.
        - For system roles (owner_id None), keep uniqueness by name among system roles.
        """
        logger.info(f"[RBAC] Creating role: {role_name} (owner: {owner_id}, tenant: {tenant_id})")
        
        if permissions is None:
            permissions = []

        # Uniqueness: per-owner and per-tenant scope. 
        # Check for existing role with same name in same tenant/owner context
        query = {"roleName": role_name}
        if tenant_id:
            query["tenantId"] = tenant_id
        if owner_id is None:
            query["$or"] = [{"ownerId": {"$exists": False}}, {"ownerId": None}]
        else:
            query["ownerId"] = owner_id
            
        existing = await MongoStorageService.find_one("roles", query, tenant_id=tenant_id)
        if existing:
            logger.warning(f"[RBAC] Role '{role_name}' already exists for owner: {owner_id} in tenant: {tenant_id}")
            return existing  # Return existing role instead of throwing error for OAuth flows
        
        role_id = str(uuid.uuid4())
        
        role_data = {
            "roleId": role_id,
            "roleName": role_name,
            "description": description,
            "permissions": permissions,
            "createdAt": datetime.utcnow().timestamp() * 1000,
            "active": True,
        }
        if owner_id is not None:
            role_data["ownerId"] = owner_id
        if is_default:
            role_data["isDefault"] = True
        if tenant_id is not None:
            role_data["tenantId"] = tenant_id
        
        try:
            await MongoStorageService.insert_one("roles", role_data, tenant_id=tenant_id)
            logger.info(f"[RBAC] Successfully created role: {role_name} (ID: {role_id})")
        except Exception as e:
            logger.error(f"[RBAC] Failed to create role {role_name}: {e}")
            raise
            
        return role_data
    
    @staticmethod
    async def get_role_by_name(role_name: str, tenant_id: Optional[str] = None) -> Optional[Dict]:
        """Get role by name"""
        # Support legacy 'name' as well
        role = await MongoStorageService.find_one("roles", {
            "$or": [
                {"roleName": role_name},
                {"name": role_name}
            ]
        }, tenant_id=tenant_id)
        if role:
            pass
        else:
            logger.warning(f"[RBAC] Role not found: {role_name}")
        return role
    
    @staticmethod
    async def get_role_by_id(role_id: str, tenant_id: Optional[str] = None) -> Optional[Dict]:
        """Get role by ID"""
        role = await MongoStorageService.find_one("roles", {
            "$or": [
                {"roleId": role_id},
                {"role_id": role_id}
            ]
        }, tenant_id=tenant_id)
        if role:
            pass
        else:
            logger.warning(f"[RBAC] Role not found by ID: {role_id}")
        return role
    
    @staticmethod
    async def get_default_role_name(email: str) -> str:
        """Generate default role name from email"""
        return f"user@{email}_role"
    
    @staticmethod
    async def create_default_user_role(email: str, *, owner_id: Optional[str] = None, tenant_id: Optional[str] = None) -> Dict:
        """Create default role for a user based on their email.

        The default role is owned by the user and is immutable (we mark isDefault=True).
        """
        role_name = await RBACService.get_default_role_name(email)
        
        # Check if role already exists
        existing = await RBACService.get_role_by_name(role_name, tenant_id=tenant_id)
        if existing:
            return existing
            
        # Create the role
        return await RBACService.create_role(
            role_name=role_name,
            description=f"Default role for user {email}",
            permissions=["Read", "Write", "Delete"],
            owner_id=owner_id,
            is_default=True,
            tenant_id=tenant_id,
        )
    
    @staticmethod
    async def create_default_role_for_authenticated_user(email: str, *, owner_id: Optional[str] = None, tenant_id: Optional[str] = None) -> Dict:
        """Create a DEFAULT role for an authenticated user.
        
        This creates a role named 'DEFAULT' after successful authentication.
        """
        role_name = "DEFAULT"
        
        # Check if DEFAULT role already exists for this user
        existing = await RBACService.get_role_by_name(role_name, tenant_id=tenant_id)
        if existing and existing.get("ownerId") == owner_id:
            return existing
            
        # Create the DEFAULT role
        return await RBACService.create_role(
            role_name=role_name,
            description=f"Default role for authenticated user {email}",
            permissions=["Read", "Write", "Delete"],
            owner_id=owner_id,
            is_default=True,
            tenant_id=tenant_id,
        )
    
    @staticmethod
    async def assign_role_to_user(user_id: str, role_id: str, tenant_id: Optional[str] = None) -> Dict:
        """Assign a role to a user"""

        
        # Check if assignment already exists
        existing = await MongoStorageService.find_one("userRoles", {
            "userId": user_id,
            "roleId": role_id
        }, tenant_id=tenant_id)
        if existing:
            logger.warning(f"[RBAC] Role assignment already exists: user {user_id} -> role {role_id}")
            return existing
        
        try:
            assignment_data = {
                "userId": user_id,
                "roleId": role_id,
                "assignedAt": datetime.utcnow().timestamp() * 1000,
                "active": True
            }
            
            # Get tenant_id from role to maintain consistency
            role = await RBACService.get_role_by_id(role_id, tenant_id=tenant_id)
            if not role:
                logger.error(f"[RBAC] Cannot assign non-existent role {role_id} to user {user_id}")
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Role {role_id} not found"
                )
                
            # Ensure tenantId is included in assignment data
            role_tenant_id = role.get("tenantId") or tenant_id
            if role_tenant_id:
                assignment_data["tenantId"] = role_tenant_id
            
            await MongoStorageService.insert_one("userRoles", assignment_data, tenant_id=role_tenant_id)
            return assignment_data
        except Exception as e:
            logger.error(f"[RBAC] Failed to assign role {role_id} to user {user_id}: {e}")
            raise
    
    @staticmethod
    async def remove_role_from_user(user_id: str, role_id: str, tenant_id: Optional[str] = None) -> bool:
        """Remove a role from a user"""

        
        result = await MongoStorageService.delete_one("userRoles", {
            "userId": user_id,
            "roleId": role_id
        }, tenant_id=tenant_id)
        
        return result
    
    @staticmethod
    async def get_user_roles(user_id: str, tenant_id: Optional[str] = None) -> List[Dict]:
        """Get all roles assigned to a user"""

        # Get user role assignments (support legacy keys and missing 'active')
        assignments = await MongoStorageService.find_many("userRoles", {
            "$or": [
                {"userId": user_id},
                {"user_id": user_id}
            ]
        }, tenant_id=tenant_id)

        if not assignments:
            return []

        # Filter active (treat missing as True)
        assignments = [a for a in assignments if a.get("active", True)]
        if not assignments:
            return []

        # Collect role ids from either key
        role_ids = {a.get("roleId") or a.get("role_id") for a in assignments}

        # Fetch roles and filter active (treat missing as True)
        all_roles = await MongoStorageService.find_many("roles", {}, tenant_id=tenant_id)
        roles = [
            r for r in all_roles
            if (r.get("roleId") or r.get("role_id")) in role_ids and r.get("active", True)
        ]

        # Helper to coerce createdAt to numeric milliseconds
        def _ts_ms(val):
            if val is None:
                return int(datetime.utcnow().timestamp() * 1000)
            try:
                # If already a number-like, return as int
                if isinstance(val, (int, float)):
                    return int(val)
                # If datetime, convert to ms
                if hasattr(val, 'timestamp'):
                    return int(val.timestamp() * 1000)
            except Exception:
                pass
            # Fallback to now
            return int(datetime.utcnow().timestamp() * 1000)

        # Normalize to new shape before returning
        normalized: List[Dict] = []
        for r in roles:
            normalized.append({
                "roleId": r.get("roleId") or r.get("role_id"),
                "roleName": r.get("roleName") or r.get("name"),
                "description": r.get("description", ""),
                "permissions": r.get("permissions", []),
                "createdAt": _ts_ms(r.get("createdAt") or r.get("created_at")),
                "active": r.get("active", True),
                "ownerId": r.get("ownerId"),
                "isDefault": r.get("isDefault", False),
                "tenantId": r.get("tenantId"),
            })
        return normalized
    
    @staticmethod
    async def get_user_role_names(user_id: str, tenant_id: Optional[str] = None) -> Set[str]:
        """Get all role names assigned to a user"""
        roles = await RBACService.get_user_roles(user_id, tenant_id=tenant_id)
        return {role["roleName"] for role in roles}
    
    @staticmethod
    async def user_has_role(user_id: str, role_name: str, tenant_id: Optional[str] = None) -> bool:
        """Check if user has a specific role"""
        user_roles = await RBACService.get_user_role_names(user_id, tenant_id=tenant_id)
        return role_name in user_roles
    
    @staticmethod
    async def get_users_with_role(role_name: str, tenant_id: Optional[str] = None) -> List[str]:
        """Get all user IDs that have a specific role"""

        
        # Get role
        role = await RBACService.get_role_by_name(role_name, tenant_id=tenant_id)
        if not role:
            return []
        
        # Get user assignments
        user_roles = await MongoStorageService.find_many("userRoles", {
            "roleId": role["roleId"],
            "active": True
        }, tenant_id=tenant_id)
        
        return [ur["userId"] for ur in user_roles]
    
    @staticmethod
    async def can_user_access_resource(user_id: str, resource_roles: List[str], tenant_id: Optional[str] = None) -> bool:
        """Check if user can access a resource based on required roles"""
        if not resource_roles:  # No role restriction
            return True
            
        user_roles = await RBACService.get_user_role_names(user_id, tenant_id=tenant_id)
        
        # Check if user has any of the required roles
        return bool(user_roles.intersection(set(resource_roles)))
    
    @staticmethod
    async def filter_accessible_records(user_id: str, records: List[Dict], role_field: str = "roles", tenant_id: Optional[str] = None) -> List[Dict]:
        """Filter records that user can access based on roles"""
        if not records:
            return []
        
        user_roles = await RBACService.get_user_role_names(user_id, tenant_id=tenant_id)
        accessible_records = []
        
        for record in records:
            required_roles = record.get(role_field, [])
            
            # If no roles specified, everyone can access
            if not required_roles:
                accessible_records.append(record)
                continue
            
            # Check if user has any required role
            if user_roles.intersection(set(required_roles)):
                accessible_records.append(record)
        
        return accessible_records
    
    @staticmethod
    async def get_all_roles(user_id: str = None, tenant_id: Optional[str] = None) -> List[Dict]:
        """Get roles per tenant-based and owner-managed visibility.

        Users can only see roles they own (ownerId == user_id) within their tenant.
        """


        # Fetch all and filter active (treat missing as True)
        raw_roles = await MongoStorageService.find_many("roles", {}, projection={"_id": 0}, tenant_id=tenant_id)
        roles = [r for r in raw_roles if r.get("active", True)]

        if user_id:
            # Users can only see roles they own
            roles = [r for r in roles if r.get("ownerId") == user_id]

        # Helper to coerce createdAt to numeric milliseconds
        def _ts_ms(val):
            if val is None:
                return int(datetime.utcnow().timestamp() * 1000)
            try:
                if isinstance(val, (int, float)):
                    return int(val)
                if hasattr(val, 'timestamp'):
                    return int(val.timestamp() * 1000)
            except Exception:
                pass
            return int(datetime.utcnow().timestamp() * 1000)

        # Normalize to new shape
        normalized: List[Dict] = []
        for r in roles:
            normalized.append({
                "roleId": r.get("roleId") or r.get("role_id") or str(uuid.uuid4()),
                "roleName": r.get("roleName") or r.get("name"),
                "description": r.get("description", ""),
                "permissions": r.get("permissions", []),
                "createdAt": _ts_ms(r.get("createdAt") or r.get("created_at")),
                "active": r.get("active", True),
                "ownerId": r.get("ownerId"),
                "isDefault": r.get("isDefault", False),
                "tenantId": r.get("tenantId"),
            })
        return normalized

    @staticmethod
    async def is_role_owner(user_id: str, role_id: str, tenant_id: Optional[str] = None) -> bool:
        """Check if a user is the owner of a role"""
        role = await RBACService.get_role_by_id(role_id, tenant_id=tenant_id)
        if not role:
            return False
        return role.get("ownerId") == user_id


async def init_default_roles():
    """Initialize default tenant-based roles"""

    
    # Remove any existing system_admin roles (legacy cleanup)
    try:
        result = await MongoStorageService.delete_many("roles", {"roleName": "system_admin"})
        if result and result.get("deleted_count", 0) > 0:
            logger.info(f"[RBAC] Removed {result['deleted_count']} legacy system_admin roles")
    except Exception as e:
        logger.warning(f"[RBAC] Failed to remove legacy system_admin roles: {e}")
    
    # Tenant admin role template (not assigned to specific users)
    admin_role = await RBACService.get_role_by_name("tenant_admin")
    if not admin_role:
        await RBACService.create_role(
            role_name="tenant_admin",
            description="Tenant administrator with full access within their organization",
            permissions=["Read", "Write", "Delete"]
        )
    
    # General user role template (not assigned to specific users)
    user_role = await RBACService.get_role_by_name("general_user")
    if not user_role:
        await RBACService.create_role(
            role_name="general_user",
            description="General user role template",
            permissions=["Read", "Write", "Delete"]
        )

    @staticmethod
    async def update_role(role_id: str, update_data: Dict, user_id: str, tenant_id: Optional[str] = None) -> Dict:
        """Update an existing role - only owner can update"""

        
        # Check if role exists
        role = await RBACService.get_role_by_id(role_id, tenant_id=tenant_id)
        if not role:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Role not found"
            )

        # Authorization: only owner can update
        if role.get("ownerId") != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only update roles you own"
            )

        # Default roles are immutable
        if role.get("isDefault"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Default personal roles cannot be modified"
            )

        # Prepare update data
        allowed_fields = ["description", "permissions"]
        filtered_update = {k: v for k, v in update_data.items() if k in allowed_fields and v is not None}

        if not filtered_update:
            return role  # No updates to apply

        # Update role
        await MongoStorageService.update_one(
            "roles",
            {"roleId": role_id},
            {"$set": filtered_update},
            tenant_id=tenant_id
        )
        
        # Get updated role
        updated_role = await RBACService.get_role_by_id(role_id, tenant_id=tenant_id)
        return updated_role

    @staticmethod
    async def delete_role(role_id: str, user_id: str, tenant_id: Optional[str] = None) -> Dict:
        """Delete a role - only owner can delete"""

        
        # Check if role exists
        role = await RBACService.get_role_by_id(role_id, tenant_id=tenant_id)
        if not role:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Role not found"
            )
        
        # Authorization: only owner can delete
        if role.get("ownerId") != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only delete roles you own"
            )
        
        # Prevent deletion of default personal roles
        if role.get("isDefault"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot delete default personal roles"
            )
        
        # Mark role as inactive instead of deleting
        await MongoStorageService.update_one(
            "roles",
            {"roleId": role_id},
            {"$set": {"active": False}},
            tenant_id=tenant_id
        )
        
        # Remove all user assignments for this role
        assignments = await MongoStorageService.find_many("userRoles", {"roleId": role_id}, tenant_id=tenant_id)
        for a in assignments:
            await MongoStorageService.update_one(
                "userRoles",
                {"userId": a.get("userId"), "roleId": role_id}, 
                {"$set": {"active": False}},
                tenant_id=tenant_id
            )
        
        return {"message": "Role deleted successfully"}

    @staticmethod
    async def list_roles(user_id: str, tenant_id: str = None) -> List[Dict]:
        """List roles accessible to the user"""

        
        # Build query - user can see roles they own or system roles
        query = {
            "active": True,
            "$or": [
                {"ownerId": user_id},  # Roles owned by user
                {"ownerId": {"$exists": False}},  # System roles
                {"ownerId": None}  # System roles
            ]
        }
        
        if tenant_id:
            query["$or"].append({"tenantId": tenant_id})
        
        roles = await MongoStorageService.find_many("roles", query, sort_field="roleName", sort_order=1, tenant_id=tenant_id)
        return roles
