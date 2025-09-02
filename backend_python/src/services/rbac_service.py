"""
Role-Based Access Control (RBAC) Service

This service manages roles, user-role assignments, and access control.
Every user gets a default role based on their email (user@email_role).
"""

import uuid
from datetime import datetime
from typing import List, Dict, Optional, Set
from fastapi import HTTPException, status

from ..db import get_collections


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
        collections = get_collections()
        
        if permissions is None:
            permissions = []

        # Uniqueness: per-owner scope. For system roles (owner_id None), enforce uniqueness among system roles.
        query = {"roleName": role_name}
        if owner_id is None:
            query["$or"] = [{"ownerId": {"$exists": False}}, {"ownerId": None}]
        else:
            query["ownerId"] = owner_id
        existing = await collections['roles'].find_one(query)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Role '{role_name}' already exists for this owner"
            )
        
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
        
        await collections['roles'].insert_one(role_data)
        return role_data
    
    @staticmethod
    async def get_role_by_name(role_name: str) -> Optional[Dict]:
        """Get role by name"""
        collections = get_collections()
        # Support legacy 'name' as well
        return await collections['roles'].find_one({
            "$or": [
                {"roleName": role_name},
                {"name": role_name}
            ]
        })
    
    @staticmethod
    async def get_role_by_id(role_id: str) -> Optional[Dict]:
        """Get role by ID"""
        collections = get_collections()
        return await collections['roles'].find_one({
            "$or": [
                {"roleId": role_id},
                {"role_id": role_id}
            ]
        })
    
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
        existing = await RBACService.get_role_by_name(role_name)
        if existing:
            return existing
            
        # Create the role
        return await RBACService.create_role(
            role_name=role_name,
            description=f"Default role for user {email}",
            permissions=["read_own_data", "update_own_profile"],
            owner_id=owner_id,
            is_default=True,
            tenant_id=tenant_id,
        )
    
    @staticmethod
    async def assign_role_to_user(user_id: str, role_id: str) -> Dict:
        """Assign a role to a user"""
        collections = get_collections()
        
        # Check if assignment already exists
        existing = await collections['userRoles'].find_one({
            "userId": user_id,
            "roleId": role_id
        })
        if existing:
            return existing
        
        assignment_data = {
            "userId": user_id,
            "roleId": role_id,
            "assignedAt": datetime.utcnow().timestamp() * 1000,
            "active": True
        }
        
        # Get tenant_id from role to maintain consistency
        role = await RBACService.get_role_by_id(role_id)
        if role and role.get("tenantId"):
            assignment_data["tenantId"] = role["tenantId"]
        
        await collections['userRoles'].insert_one(assignment_data)
        return assignment_data
    
    @staticmethod
    async def remove_role_from_user(user_id: str, role_id: str) -> bool:
        """Remove a role from a user"""
        collections = get_collections()
        
        result = await collections['userRoles'].delete_one({
            "userId": user_id,
            "roleId": role_id
        })
        
        return result.deleted_count > 0
    
    @staticmethod
    async def get_user_roles(user_id: str) -> List[Dict]:
        """Get all roles assigned to a user"""
        collections = get_collections()
        # Get user role assignments (support legacy keys and missing 'active')
        assignments = await collections['userRoles'].find({
            "$or": [
                {"userId": user_id},
                {"user_id": user_id}
            ]
        }).to_list(None)

        if not assignments:
            return []

        # Filter active (treat missing as True)
        assignments = [a for a in assignments if a.get("active", True)]
        if not assignments:
            return []

        # Collect role ids from either key
        role_ids = {a.get("roleId") or a.get("role_id") for a in assignments}

        # Fetch roles and filter active (treat missing as True)
        all_roles = await collections['roles'].find(None).to_list(None)
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
    async def get_user_role_names(user_id: str) -> Set[str]:
        """Get all role names assigned to a user"""
        roles = await RBACService.get_user_roles(user_id)
        return {role["roleName"] for role in roles}
    
    @staticmethod
    async def user_has_role(user_id: str, role_name: str) -> bool:
        """Check if user has a specific role"""
        user_roles = await RBACService.get_user_role_names(user_id)
        return role_name in user_roles
    
    @staticmethod
    async def get_users_with_role(role_name: str) -> List[str]:
        """Get all user IDs that have a specific role"""
        collections = get_collections()
        
        # Get role
        role = await RBACService.get_role_by_name(role_name)
        if not role:
            return []
        
        # Get user assignments
        user_roles = await collections['userRoles'].find({
            "roleId": role["roleId"],
            "active": True
        }).to_list(None)
        
        return [ur["userId"] for ur in user_roles]
    
    @staticmethod
    async def can_user_access_resource(user_id: str, resource_roles: List[str]) -> bool:
        """Check if user can access a resource based on required roles"""
        if not resource_roles:  # No role restriction
            return True
            
        user_roles = await RBACService.get_user_role_names(user_id)
        
        # Check if user has any of the required roles
        return bool(user_roles.intersection(set(resource_roles)))
    
    @staticmethod
    async def filter_accessible_records(user_id: str, records: List[Dict], role_field: str = "roles") -> List[Dict]:
        """Filter records that user can access based on roles"""
        if not records:
            return []
        
        user_roles = await RBACService.get_user_role_names(user_id)
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
    async def get_all_roles(user_id: str = None) -> List[Dict]:
        """Get roles per owner-managed visibility.

        - system_admin: see all active roles.
        - regular users: see only roles they own (ownerId == user_id).
        """
        collections = get_collections()

        # Fetch all and filter active (treat missing as True)
        raw_roles = await collections['roles'].find(None, {"_id": 0}).to_list(None)
        roles = [r for r in raw_roles if r.get("active", True)]

        if user_id:
            # If user is system admin, keep all; otherwise only roles owned by the user
            try:
                if not await RBACService.user_has_role(user_id, "system_admin"):
                    roles = [r for r in roles if r.get("ownerId") == user_id]
            except Exception:
                # On any lookup error, fall back to owned-only filtering
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
    async def is_role_owner(user_id: str, role_id: str) -> bool:
        """Check if a user is the owner of a role"""
        role = await RBACService.get_role_by_id(role_id)
        if not role:
            return False
        return role.get("ownerId") == user_id


async def init_default_roles():
    """Initialize default system roles"""
    collections = get_collections()
    
    # System admin role
    admin_role = await RBACService.get_role_by_name("system_admin")
    if not admin_role:
        await RBACService.create_role(
            role_name="system_admin",
            description="System administrator with full access",
            permissions=["*"]  # All permissions
        )
    
    # General user role template (not assigned to specific users)
    user_role = await RBACService.get_role_by_name("general_user")
    if not user_role:
        await RBACService.create_role(
            role_name="general_user",
            description="General user role template",
            permissions=["read_own_data", "update_own_profile"]
        )
