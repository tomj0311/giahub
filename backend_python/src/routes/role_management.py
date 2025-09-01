"""
Additional role management endpoints for user invitation and advanced role operations
"""

from typing import List
from fastapi import APIRouter, HTTPException, Depends, status, Body, Response
from pydantic import BaseModel, EmailStr

from ..db import get_collections
from ..utils.auth import verify_token_middleware
from ..services.rbac_service import RBACService

router = APIRouter()


# Pydantic models
class UserInvitation(BaseModel):
    email: EmailStr
    firstName: str
    lastName: str
    roleIds: List[str] = []


class RoleAssignmentRequest(BaseModel):
    roleIds: List[str] | None = None
    role_ids: List[str] | None = None


@router.post("/invite-user")
async def invite_user(
    request: dict = Body(...),
    response: Response = None,
    user: dict = Depends(verify_token_middleware)
):
    """Invite a new user with specified roles.

    Allowed for any authenticated user. If request includes roleIds/role_ids, the inviter must own those roles
    or be system_admin. Invited user gets only the roles specified (no automatic admin-level permissions).
    """
    
    user_id = user.get("id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user"
        )
    
    # Owner-managed: any authenticated user can invite. They can only assign roles they own.
    
    try:
        import uuid
        from datetime import datetime
        from ..utils.auth import hash_password, normalize_email
        from ..services.email_service import send_registration_email
        import secrets
        import string

        collections = get_collections()

        # Extract payload (support both shapes)
        email = request.get("email")
        if not email:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="email is required")
        first_name = request.get("firstName") or request.get("first_name") or ""
        last_name = request.get("lastName") or request.get("last_name") or ""
        incoming_role_ids = request.get("roleIds") or request.get("role_ids") or []
        invited_by = request.get("invited_by") or user_id

        # Check if email already exists
        normalized_email = normalize_email(email)
        existing_user = await collections['users'].find_one({"email": normalized_email})
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User with this email already exists"
            )

        # Validate role IDs and ownership
        for role_id in incoming_role_ids:
            role = await RBACService.get_role_by_id(role_id)
            if not role:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Role with ID {role_id} not found"
                )
            # Must own the role to assign
            if role.get("ownerId") != user_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You can only invite users to roles you own"
                )

        # Generate temporary password
        def generate_random_password() -> str:
            alphabet = string.ascii_letters + string.digits
            return ''.join(secrets.choice(alphabet) for _ in range(12))

        temp_password = generate_random_password()
        hashed_password = hash_password(temp_password)
        new_user_id = str(uuid.uuid4())

        # Create user
        user_data = {
            "id": new_user_id,
            "role": "user",
            "active": True,
            "password": hashed_password,
            "createdAt": datetime.utcnow().timestamp() * 1000,
            "firstName": first_name,
            "lastName": last_name,
            "name": f"{first_name} {last_name}".strip() or normalized_email.split('@')[0],
            "email": normalized_email,
            "emailOriginal": email,
            "invitedBy": invited_by,
            "isInvited": True
        }

        await collections['users'].insert_one(user_data)

    # Create default personal role for the invited user (immutable, owned by them)
        default_role = await RBACService.create_default_user_role(email, owner_id=new_user_id)
        await RBACService.assign_role_to_user(new_user_id, default_role["roleId"])

        # Assign additional roles if specified
        for role_id in incoming_role_ids:
            await RBACService.assign_role_to_user(new_user_id, role_id)

        # Best-effort email
        try:
            await send_registration_email(user_data["email"], "user")
        except Exception:
            pass

        # If legacy payload (role_ids), return legacy minimal response with 201
        if "role_ids" in request:
            if response is not None:
                response.status_code = status.HTTP_201_CREATED
            return {
                "email": email,
                "role_ids": incoming_role_ids,
                "invited_by": invited_by,
                "invitation_id": new_user_id,
            }

    # Otherwise return rich response (200)
        assigned_roles = await RBACService.get_user_roles(new_user_id)
        return {
            "message": "User invited successfully",
            "userId": new_user_id,
            "email": email,
            "tempPassword": temp_password,
            "assignedRoles": [{"roleId": r["roleId"], "roleName": r["roleName"]} for r in assigned_roles],
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to invite user: {str(e)}"
        )


@router.get("/users", response_model=List[dict])
async def get_all_users(user: dict = Depends(verify_token_middleware)):
    """Get users with their roles (owner-managed view).

    - You always see yourself.
    - You see users who have at least one role owned by you.
    """
    user_id = user.get("id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user"
        )

    try:
        collections = get_collections()

        # Fetch users (active only), but always include current user
        all_users = await collections['users'].find(
            {
                "$or": [
                    {"active": True},
                    {"is_active": True},
                    {"id": user_id},
                    {"user_id": user_id}
                ]
            },
            {"_id": 0, "password": 0}
        ).to_list(None)

        # Build set of user IDs to include: self + users with roles owned by current user
        include_ids = set()
        include_ids.add(user_id)

        # Get all assignments to find users who have roles owned by current user
        assignments = await collections['userRoles'].find(None).to_list(None)
        role_ids_owned_by_me = set()
        roles = await collections['roles'].find(None).to_list(None)
        for r in roles:
            if r.get('ownerId') == user_id:
                role_ids_owned_by_me.add(r.get('roleId') or r.get('role_id'))
        for a in assignments:
            rid = a.get('roleId') or a.get('role_id')
            uid = a.get('userId') or a.get('user_id')
            if rid in role_ids_owned_by_me:
                include_ids.add(uid)

        # Filter users - ensure current user is always included regardless of field name
        users = []
        for u in all_users:
            user_id_field = u.get('id') or u.get('user_id')
            if user_id_field in include_ids or user_id_field == user_id:
                users.append(u)

        # Populate roles for each included user
        for user_data in users:
            target_id = user_data.get("id") or user_data.get("user_id")
            user_roles = await RBACService.get_user_roles(target_id)
            user_data["roles"] = [
                {"roleId": role["roleId"], "roleName": role["roleName"], "name": role["roleName"]}
                for role in user_roles
            ]
            if "user_id" not in user_data and "id" in user_data:
                user_data["user_id"] = user_data["id"]
        return users

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch users: {str(e)}"
        )


@router.post("/users/{user_id}/roles/assign")
async def assign_multiple_roles(
    user_id: str,
    request: RoleAssignmentRequest,
    user: dict = Depends(verify_token_middleware)
):
    """Assign multiple roles to a user.

    Allowed for system_admin or role owners (can only assign roles they own).
    """
    
    current_user_id = user.get("id")
    if not current_user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user"
        )
    
    is_admin = await RBACService.user_has_role(current_user_id, "system_admin")
    
    try:
        collections = get_collections()
        
        # Check if target user exists (support legacy key)
        target_user = await collections['users'].find_one({
            "$or": [{"id": user_id}, {"user_id": user_id}]
        })
        if not target_user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        # Pick role ids from either field
        ids = request.roleIds if request.roleIds is not None else (request.role_ids or [])

        # Validate all role IDs and check ownership for non-admin
        for role_id in ids:
            role = await RBACService.get_role_by_id(role_id)
            if not role:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Role with ID {role_id} not found"
                )
            if not is_admin and role.get("ownerId") != current_user_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You can only assign roles you own"
                )

        # Assign all roles
        assigned_roles = []
        for role_id in ids:
            assignment = await RBACService.assign_role_to_user(user_id, role_id)
            role = await RBACService.get_role_by_id(role_id)
            assigned_roles.append({
                "roleId": role_id,
                # Support both new and legacy role shapes
                "roleName": (role.get("roleName") if isinstance(role, dict) else None) or (
                    role.get("name") if isinstance(role, dict) else None
                ),
                "assignedAt": assignment["assignedAt"]
            })

        return {
            "message": "Roles assigned successfully",
            "userId": user_id,
            "assignedRoles": assigned_roles
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to assign roles: {str(e)}"
        )


@router.delete("/users/{user_id}/roles/{role_id}")
async def remove_user_role(
    user_id: str,
    role_id: str,
    user: dict = Depends(verify_token_middleware)
):
    """Remove a specific role from a user.

    Allowed for system_admin or role owners (can only remove roles they own). Cannot remove default personal role.
    """
    
    current_user_id = user.get("id")
    if not current_user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user"
        )
    
    is_admin = await RBACService.user_has_role(current_user_id, "system_admin")
    
    try:
        collections = get_collections()
        
        # Check if target user exists (support legacy key)
        target_user = await collections['users'].find_one({
            "$or": [{"id": user_id}, {"user_id": user_id}]
        })
        if not target_user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        
        # Check if role exists
        role = await RBACService.get_role_by_id(role_id)
        if not role:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Role not found"
            )
        if not is_admin and role.get("ownerId") != current_user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only remove roles you own"
            )
        
        # Prevent removal of default user role
        default_role_name = await RBACService.get_default_role_name(target_user["email"])
        if role["roleName"] == default_role_name:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot remove user's default role"
            )
        
        # Remove role
        success = await RBACService.remove_role_from_user(user_id, role_id)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Role assignment not found"
            )
        
        return {
            "message": "Role removed successfully",
            "userId": user_id,
            "roleId": role_id,
            "roleName": role["roleName"]
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to remove role: {str(e)}"
        )
