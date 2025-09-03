"""
Authentication Service

This service handles authentication-related business logic including login,
token generation, password verification, and user authentication flows.
"""

import os
from datetime import datetime
from typing import Optional, Dict, Any
from fastapi import HTTPException, status

from ..utils.log import logger
from ..db import get_collections
"""
Authentication Service

This service handles authentication-related business logic including login,
token generation, password verification, and user authentication flows.
"""

import os
from datetime import datetime
from typing import Optional, Dict, Any
from fastapi import HTTPException, status

from ..utils.log import logger
from ..db import get_collections
from ..utils.auth import (
    generate_token,
    verify_password,
    normalize_email
)
from .tenant_service import TenantService


# Module loaded log
logger.debug("[AUTH] Service module loaded")


class AuthService:
    """Service for handling authentication logic"""

    # Admin credentials with development fallbacks
    ADMIN_USER = os.getenv('ADMIN_USER', 'admin')
    ADMIN_PASS = os.getenv('ADMIN_PASS', '123')

    @staticmethod
    def _get_users_collection():
        """Get the users collection"""
        return get_collections()["users"]

    @classmethod
    async def authenticate_user(cls, username: str, password: str) -> Dict[str, Any]:
        """Authenticate user and return login response"""
        logger.info(f"[AUTH] Login attempt for username: {username}")

        if not username or not password:
            logger.warning(f"[AUTH] Login failed - missing credentials for: {username}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username and password are required"
            )

        normalized_username = normalize_email(username)
        logger.debug(f"[AUTH] Normalized username: {normalized_username}")

        # Check admin login first
        logger.debug(f"[AUTH] Checking admin credentials for: {normalized_username}")
        if normalized_username == normalize_email(cls.ADMIN_USER) and password == cls.ADMIN_PASS:
            logger.info(f"[AUTH] Admin login successful for: {username}")
            token = generate_token({
                "role": "admin",
                "username": username,
                "id": "admin",
                "tenantId": "admin"
            })
            logger.debug("[AUTH] Generated admin token")
            return {
                "token": token,
                "role": "admin",
                "name": "Administrator"
            }

        # Regular user authentication
        logger.debug(f"[AUTH] Proceeding to regular user authentication for: {normalized_username}")
        return await cls._authenticate_regular_user(normalized_username, password)

    @classmethod
    async def _authenticate_regular_user(cls, normalized_username: str, password: str) -> Dict[str, Any]:
        """Authenticate regular user"""
        logger.debug(f"[AUTH] Authenticating regular user: {normalized_username}")
        try:
            logger.debug(f"[AUTH] Looking up user in database: {normalized_username}")
            user = await cls._get_users_collection().find_one({"email": normalized_username})

            if not user:
                logger.warning(f"[AUTH] User not found: {normalized_username}")
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid credentials"
                )

            logger.debug(f"[AUTH] Verifying password for user: {normalized_username}")
            if not verify_password(password, user.get("password_hash", "")):
                logger.warning(f"[AUTH] Invalid password for user: {normalized_username}")
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid credentials"
                )

            # Check if user is verified
            logger.debug(f"[AUTH] Checking verification status for user: {normalized_username}")
            if not user.get("verified", False):
                logger.warning(f"[AUTH] Unverified user attempted login: {normalized_username}")
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Please verify your email before logging in"
                )

            # Get user's tenant information
            logger.debug(f"[AUTH] Getting tenant information for user: {normalized_username}")
            tenant_info = await TenantService.get_user_tenant_info(str(user["_id"]))

            # Generate token with user and tenant information
            logger.debug(f"[AUTH] Generating token for user: {normalized_username}")
            token_payload = {
                "role": "user",
                "id": str(user["_id"]),
                "userId": str(user["_id"]),
                "username": user.get("email"),
                "tenantId": tenant_info.get("tenant_id") if tenant_info else None,
                "firstName": user.get("firstName"),
                "lastName": user.get("lastName"),
                "email": user.get("email")
            }

            token = generate_token(token_payload)

            # Update last login
            await cls._update_last_login(user["_id"])

            logger.info(f"[AUTH] User login successful for: {normalized_username}")
            return {
                "token": token,
                "role": "user",
                "name": f"{user.get('firstName', '')} {user.get('lastName', '')}".strip() or normalized_username
            }

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"[AUTH] Authentication error for {normalized_username}: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Authentication service error"
            )

    @classmethod
    async def _update_last_login(cls, user_id):
        """Update user's last login timestamp"""
        try:
            await cls._get_users_collection().update_one(
                {"_id": user_id},
                {"$set": {"last_login": datetime.utcnow()}}
            )
        except Exception as e:
            logger.error(f"[AUTH] Failed to update last login for user {user_id}: {e}")
            # Don't raise exception for this non-critical operation

    @staticmethod
    async def validate_google_user_data(user_data: Dict[str, Any]) -> Dict[str, Any]:
        """Validate and process Google OAuth user data"""
        required_fields = ['email', 'given_name', 'family_name']
        missing_fields = [field for field in required_fields if not user_data.get(field)]

        if missing_fields:
            logger.error(f"[AUTH] Missing required fields from Google: {missing_fields}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Missing required user information: {', '.join(missing_fields)}"
            )

        return {
            "email": normalize_email(user_data["email"]),
            "firstName": user_data["given_name"],
            "lastName": user_data["family_name"],
            "verified": user_data.get("email_verified", True),  # Google emails are typically verified
            "profile_picture": user_data.get("picture"),
            "google_id": user_data.get("sub")
        }

    @classmethod
    async def handle_google_oauth_callback(cls, user_info: Dict[str, Any]) -> Dict[str, Any]:
        """Handle Google OAuth callback and process user data"""
        import secrets
        import string
        from datetime import datetime
        from ..services.rbac_service import RBACService
        from ..services.user_service import UserService

        collections = get_collections()

        # Check if user already exists
        existing_user = await collections['users'].find_one({"email": user_info.get('email')})

        if existing_user:
            # Handle existing user
            return await cls._handle_existing_oauth_user(existing_user)
        else:
            # Handle new user
            return await cls._handle_new_oauth_user(user_info)

    @classmethod
    async def _handle_existing_oauth_user(cls, user_data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle existing OAuth user login"""
        from ..services.rbac_service import RBACService

        collections = get_collections()

        # Ensure user has roles and tenantId
        user_tenant_id = await TenantService.get_user_tenant_id(user_data['id'])

        if not user_tenant_id:
            logger.warning(f"Existing OAuth user {user_data['email']} has no tenantId. Creating default tenant...")
            default_tenant = await TenantService.create_default_tenant(user_data['email'], user_data['id'])
            await collections['users'].update_one(
                {"id": user_data['id']},
                {"$set": {"tenantId": default_tenant["tenantId"]}}
            )
            user_tenant_id = default_tenant["tenantId"]
            logger.info(f"Created and assigned default tenant for {user_data['email']}")

        user_roles = await RBACService.get_user_roles(user_data['id'])
        if not user_roles:
            logger.warning(f"Existing OAuth user {user_data['email']} has no roles. Creating default role...")
            default_role = await RBACService.create_default_user_role(
                user_data['email'],
                owner_id=user_data['id'],
                tenant_id=user_tenant_id
            )
            await RBACService.assign_role_to_user(user_data['id'], default_role["roleId"])
            logger.info(f"Created and assigned default role for {user_data['email']}")

        return {
            "id": user_data['id'],
            "role": user_data.get('role', 'user'),
            "email": user_data['email'],
            "name": user_data.get('name', ''),
            "new_user": False
        }

    @classmethod
    async def _handle_new_oauth_user(cls, user_info: Dict[str, Any]) -> Dict[str, Any]:
        """Handle new OAuth user registration"""
        import secrets
        import string
        from datetime import datetime
        from ..services.rbac_service import RBACService

        collections = get_collections()

        # Generate user ID first
        new_user_id = secrets.token_urlsafe(16)

        # Create default tenant
        try:
            default_tenant = await TenantService.create_default_tenant(user_info['email'], new_user_id)
            logger.info(f"Created default tenant: {default_tenant['tenantId']} for {user_info['email']}")
        except Exception as e:
            logger.error(f"Failed to create default tenant for Google OAuth user {user_info['email']}: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create user organization. OAuth registration aborted."
            )

        # Create default role
        try:
            logger.info(f"Creating default role for new Google OAuth user: {user_info['email']}")
            default_role = await RBACService.create_default_user_role(
                user_info['email'],
                owner_id=new_user_id,
                tenant_id=default_tenant['tenantId']
            )
            logger.info(f"Created default role: {default_role['roleId']} for {user_info['email']}")
        except Exception as e:
            # Clean up: delete the tenant since role creation failed
            await collections['tenants'].delete_one({"ownerId": new_user_id})
            logger.error(f"Failed to create default role for Google OAuth user {user_info['email']}: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create user security profile. OAuth registration aborted."
            )

        # Create user
        random_password = ''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(32))
        new_user = {
            "id": new_user_id,
            "email": user_info['email'],
            "name": f"{user_info.get('given_name', '')} {user_info.get('family_name', '')}".strip(),
            "firstName": user_info.get('given_name', ''),
            "lastName": user_info.get('family_name', ''),
            "password": random_password,  # Not used for OAuth users
            "role": "user",
            "googleId": user_info.get('sub'),  # Google user ID
            "emailVerified": True,  # Google emails are pre-verified
            "active": True,
            "tenantId": default_tenant['tenantId'],
            "createdAt": datetime.utcnow().timestamp() * 1000,
            "updatedAt": datetime.utcnow().timestamp() * 1000
        }

        # Validate tenantId is present
        if not new_user.get("tenantId"):
            await collections['tenants'].delete_one({"ownerId": new_user_id})
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="OAuth user creation failed: tenantId is required"
            )

        try:
            await collections['users'].insert_one(new_user)
            logger.info(f"Created new Google OAuth user: {user_info['email']}")
        except Exception as e:
            # Clean up: delete the tenant and role since user creation failed
            await collections['tenants'].delete_one({"ownerId": new_user_id})
            logger.error(f"Failed to create Google OAuth user {new_user_id}: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create user account. OAuth registration aborted."
            )

        # Assign role to user
        try:
            await RBACService.assign_role_to_user(new_user_id, default_role["roleId"])
            logger.info(f"Assigned role {default_role['roleId']} to user {new_user_id}")
        except Exception as e:
            # Clean up: delete the user and tenant since role assignment failed
            await collections['users'].delete_one({"id": new_user_id})
            await collections['tenants'].delete_one({"ownerId": new_user_id})
            logger.error(f"Failed to assign role to Google OAuth user {new_user_id}: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to assign security role. OAuth registration aborted."
            )

        return {
            "id": new_user['id'],
            "role": "user",
            "email": new_user['email'],
            "name": new_user['name'],
            "new_user": True
        }

    @classmethod
    async def handle_microsoft_oauth_callback(cls, user_info: Dict[str, Any]) -> Dict[str, Any]:
        """Handle Microsoft OAuth callback and process user data"""
        import secrets
        import string
        from datetime import datetime
        from ..services.rbac_service import RBACService
        from ..services.user_service import UserService

        collections = get_collections()

        # Get email from Microsoft user info (can be in 'mail' or 'userPrincipalName')
        email = user_info.get('mail', user_info.get('userPrincipalName', ''))
        
        # Check if user already exists
        existing_user = await collections['users'].find_one({"email": email})

        if existing_user:
            # Handle existing user
            return await cls._handle_existing_oauth_user(existing_user)
        else:
            # Handle new user - adapt user_info to match expected format
            adapted_user_info = {
                'email': email,
                'given_name': user_info.get('givenName', ''),
                'family_name': user_info.get('surname', ''),
                'name': user_info.get('displayName', ''),
                'sub': user_info.get('id'),  # Microsoft user ID
            }
            return await cls._handle_new_microsoft_oauth_user(adapted_user_info)

    @classmethod
    async def _handle_new_microsoft_oauth_user(cls, user_info: Dict[str, Any]) -> Dict[str, Any]:
        """Handle new Microsoft OAuth user registration"""
        import secrets
        import string
        from datetime import datetime
        from ..services.rbac_service import RBACService

        collections = get_collections()

        # Generate user ID first
        new_user_id = secrets.token_urlsafe(16)

        # Create default tenant
        try:
            default_tenant = await TenantService.create_default_tenant(user_info['email'], new_user_id)
            logger.info(f"Created default tenant: {default_tenant['tenantId']} for {user_info['email']}")
        except Exception as e:
            logger.error(f"Failed to create default tenant for Microsoft OAuth user {user_info['email']}: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create user organization. OAuth registration aborted."
            )

        # Create default role
        try:
            logger.info(f"Creating default role for new Microsoft OAuth user: {user_info['email']}")
            default_role = await RBACService.create_default_user_role(
                user_info['email'],
                owner_id=new_user_id,
                tenant_id=default_tenant['tenantId']
            )
            logger.info(f"Created default role: {default_role['roleId']} for {user_info['email']}")
        except Exception as e:
            # Clean up: delete the tenant since role creation failed
            await collections['tenants'].delete_one({"ownerId": new_user_id})
            logger.error(f"Failed to create default role for Microsoft OAuth user {user_info['email']}: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create user security profile. OAuth registration aborted."
            )

        # Create user
        random_password = ''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(32))
        new_user = {
            "id": new_user_id,
            "email": user_info['email'],
            "name": f"{user_info.get('given_name', '')} {user_info.get('family_name', '')}".strip(),
            "firstName": user_info.get('given_name', ''),
            "lastName": user_info.get('family_name', ''),
            "password": random_password,  # Not used for OAuth users
            "role": "user",
            "microsoftId": user_info.get('sub'),  # Microsoft user ID
            "emailVerified": True,  # Microsoft emails are pre-verified
            "active": True,
            "tenantId": default_tenant['tenantId'],
            "createdAt": datetime.utcnow().timestamp() * 1000,
            "updatedAt": datetime.utcnow().timestamp() * 1000
        }

        # Validate tenantId is present
        if not new_user.get("tenantId"):
            await collections['tenants'].delete_one({"ownerId": new_user_id})
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="OAuth user creation failed: tenantId is required"
            )

        try:
            await collections['users'].insert_one(new_user)
            logger.info(f"Created new Microsoft OAuth user: {user_info['email']}")
        except Exception as e:
            # Clean up: delete the tenant and role since user creation failed
            await collections['tenants'].delete_one({"ownerId": new_user_id})
            logger.error(f"Failed to create Microsoft OAuth user {new_user_id}: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create user account. OAuth registration aborted."
            )

        # Assign role to user
        try:
            await RBACService.assign_role_to_user(new_user_id, default_role["roleId"])
            logger.info(f"Assigned role {default_role['roleId']} to user {new_user_id}")
        except Exception as e:
            # Clean up: delete the user and tenant since role assignment failed
            await collections['users'].delete_one({"id": new_user_id})
            await collections['tenants'].delete_one({"ownerId": new_user_id})
            logger.error(f"Failed to assign role to Microsoft OAuth user {new_user_id}: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to assign security role. OAuth registration aborted."
            )

        return {
            "id": new_user['id'],
            "role": "user",
            "email": new_user['email'],
            "name": new_user['name'],
            "new_user": True
        }

    @staticmethod
    async def get_current_user_info(user: Dict[str, Any]) -> Dict[str, Any]:
        """Get current user information"""
        collections = get_collections()

        # For admin users, return username; for regular users, get name from database
        if user.get("role") == "admin":
            return {
                "role": user.get("role"),
                "username": user.get("username"),
                "email": user.get("email", ""),
                "tenantId": user.get("tenantId")
            }
        else:
            # For regular users, fetch additional info from database
            user_doc = await collections['users'].find_one({"id": user.get("id")})
            return {
                "role": user.get("role"),
                "id": user.get("id"),
                "email": user.get("email"),
                "name": user_doc.get("name") if user_doc else None,
                "firstName": user_doc.get("firstName") if user_doc else None,
                "lastName": user_doc.get("lastName") if user_doc else None,
                "tenantId": user.get("tenantId")
            }
            logger.debug("[AUTH][EXIT] get_current_user_info user")
            return result
