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
from ..utils.mongo_storage import MongoStorageService
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

    @classmethod
    async def authenticate_user(cls, email: str, password: str) -> Dict[str, Any]:
        """Authenticate user and return login response"""
        logger.info(f"[AUTH] Login attempt for email: {email}")

        if not email or not password:
            logger.warning(f"[AUTH] Login failed - missing credentials for: {email}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email and password are required"
            )

        normalized_email = normalize_email(email)
        logger.debug(f"[AUTH] Normalized email: {normalized_email}")

        # Check admin login first
        logger.debug(f"[AUTH] Checking admin credentials for: {normalized_email}")
        if normalized_email == normalize_email(cls.ADMIN_USER) and password == cls.ADMIN_PASS:
            logger.info(f"[AUTH] Admin login successful for: {email}")
            logger.debug(f"[AUTH] Generating admin token for: {email}")
            token = generate_token({
                "role": "admin",
                "username": email,
                "id": "admin",
                "tenantId": "admin"
            })
            logger.debug("[AUTH] Generated admin token successfully")
            return {
                "token": token,
                "role": "admin",
                "name": "Administrator"
            }

        # Regular user authentication
        logger.debug(f"[AUTH] Proceeding to regular user authentication for: {normalized_email}")
        return await cls._authenticate_regular_user(normalized_email, password)

    @classmethod
    async def _authenticate_regular_user(cls, normalized_email: str, password: str) -> Dict[str, Any]:
        """Authenticate regular user"""
        logger.debug(f"[AUTH] Authenticating regular user: {normalized_email}")
        try:
            logger.debug(f"[AUTH] Looking up user in database: {normalized_email}")
            user = await MongoStorageService.find_one("users", {"email": normalized_email})

            if not user:
                logger.warning(f"[AUTH] User not found: {normalized_email}")
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid credentials"
                )

            logger.debug(f"[AUTH] Verifying password for user: {normalized_email}")
            if not verify_password(password, user.get("password_hash", "")):
                logger.warning(f"[AUTH] Invalid password for user: {normalized_email}")
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid credentials"
                )

            # Check if user is verified
            logger.debug(f"[AUTH] Checking verification status for user: {normalized_email}")
            if not user.get("verified", False):
                logger.warning(f"[AUTH] Unverified user attempted login: {normalized_email}")
                if user.get("isInvited", False):
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Please verify your email through the invitation link to activate your account"
                    )
                else:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Please verify your email before logging in"
                    )

            # Check if user is active (for invited users)
            logger.debug(f"[AUTH] Checking active status for user: {normalized_email}")
            if not user.get("active", True):
                logger.warning(f"[AUTH] Inactive user attempted login: {normalized_email}")
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Your account is not yet activated. Please verify your email to activate your account."
                )

            # Get user's tenant information
            logger.debug(f"[AUTH] Getting tenant information for user: {normalized_email}")
            tenant_info = await TenantService.get_user_tenant_info(str(user["_id"]))

            # Generate token with user and tenant information
            logger.debug(f"[AUTH] Generating token for user: {normalized_email}")
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
            await cls._update_last_login(user["_id"], tenant_id=tenant_info.get("tenant_id") if tenant_info else None)

            # Ensure user has DEFAULT role after successful authentication
            await cls._ensure_user_has_default_role(
                str(user["_id"]), 
                normalized_email, 
                tenant_id=tenant_info.get("tenant_id") if tenant_info else None
            )

            logger.info(f"[AUTH] User login successful for: {normalized_email}")
            return {
                "token": token,
                "role": "user",
                "name": f"{user.get('firstName', '')} {user.get('lastName', '')}".strip() or normalized_email
            }

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"[AUTH] Authentication error for {normalized_email}: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Authentication service error"
            )

    @classmethod
    async def _update_last_login(cls, user_id, tenant_id: Optional[str] = None):
        """Update user's last login timestamp"""
        try:
            current_time = datetime.utcnow()
            await MongoStorageService.update_one(
                "users",
                {"_id": user_id},
                {
                    "last_login": current_time,
                    "updated_at": current_time,
                    "updatedAt": current_time.timestamp() * 1000  # Timestamp in milliseconds
                },
                tenant_id=tenant_id
            )
        except Exception as e:
            logger.error(f"[AUTH] Failed to update last login for user {user_id}: {e}")
            # Don't raise exception for this non-critical operation

    @classmethod
    async def _ensure_user_has_default_role(cls, user_id: str, email: str, tenant_id: Optional[str] = None) -> None:
        """Ensure user has a DEFAULT role after successful authentication"""
        from ..services.rbac_service import RBACService
        
        try:
            # Check if user already has roles
            user_roles = await RBACService.get_user_roles(user_id, tenant_id=tenant_id)
            
            # If user has no roles, create and assign DEFAULT role
            if not user_roles:
                logger.info(f"[AUTH] Creating DEFAULT role for authenticated user: {email}")
                default_role = await RBACService.create_default_role_for_authenticated_user(
                    email,
                    owner_id=user_id,
                    tenant_id=tenant_id
                )
                await RBACService.assign_role_to_user(user_id, default_role["roleId"], tenant_id=tenant_id)
                logger.info(f"[AUTH] Assigned DEFAULT role to user: {email}")
            else:
                logger.debug(f"[AUTH] User {email} already has {len(user_roles)} role(s), skipping DEFAULT role creation")
                
        except Exception as e:
            logger.error(f"[AUTH] Failed to ensure DEFAULT role for user {email}: {e}")
            # Don't raise exception - user can still be authenticated without roles

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



        # Check if user already exists - use MongoStorageService properly
        # During OAuth flows, we can query users without tenant filtering since we don't know the tenant yet
        try:
            existing_user = await MongoStorageService.find_one("users", {"email": user_info.get('email')})
        except Exception as e:
            logger.error(f"[OAUTH] Failed to check for existing user: {e}")
            existing_user = None

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



        # Get the user ID - handle both _id and id fields
        user_id = user_data.get('_id') or user_data.get('id')
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="User document missing both _id and id fields"
            )

        # Check if user is verified
        if not user_data.get("verified", False):
            logger.warning(f"[OAUTH] Unverified user attempted login: {user_data['email']}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Please verify your email before logging in"
            )

        # Check if user is active
        if not user_data.get("active", True):
            logger.warning(f"[OAUTH] Inactive user attempted login: {user_data['email']}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your account is not yet activated. Please contact an administrator to activate your account."
            )

        # Ensure user has roles and tenantId
        user_tenant_id = await TenantService.get_user_tenant_id(user_id)

        if not user_tenant_id:
            logger.warning(f"Existing OAuth user {user_data['email']} has no tenantId. Creating default tenant...")
            default_tenant = await TenantService.create_default_tenant(user_data['email'], user_id)
            await MongoStorageService.update_one(
                "users",
                {"_id": user_id},
                {"$set": {"tenantId": default_tenant["tenantId"]}},
                tenant_id=default_tenant["tenantId"]  # Provide tenant_id for the update operation
            )
            user_tenant_id = default_tenant["tenantId"]
            logger.info(f"Created and assigned default tenant for {user_data['email']}")

        user_roles = await RBACService.get_user_roles(user_id, tenant_id=user_tenant_id)
        if not user_roles:
            logger.warning(f"Existing OAuth user {user_data['email']} has no roles. Creating DEFAULT role...")
            default_role = await RBACService.create_default_role_for_authenticated_user(
                user_data['email'],
                owner_id=user_id,
                tenant_id=user_tenant_id
            )
            await RBACService.assign_role_to_user(user_id, default_role["roleId"], tenant_id=user_tenant_id)
            logger.info(f"Created and assigned DEFAULT role for {user_data['email']}")

        # Update last login timestamp
        await cls._update_last_login(user_id, tenant_id=user_tenant_id)

        return {
            "id": user_id,
            "role": user_data.get('role', 'user'),
            "email": user_data['email'],
            "name": user_data.get('name', ''),
            "tenantId": user_tenant_id,
            "new_user": False
        }

    @classmethod
    async def _handle_new_oauth_user(cls, user_info: Dict[str, Any]) -> Dict[str, Any]:
        """Handle new OAuth user registration"""
        import secrets
        import string
        from datetime import datetime
        from ..services.rbac_service import RBACService



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

        # Note: Default role creation moved to after successful authentication

        # Create user
        current_time = datetime.utcnow()
        random_password = ''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(32))
        new_user = {
            "_id": new_user_id,  # Primary MongoDB identifier
            "id": new_user_id,   # Backward compatibility field
            "firstName": user_info.get('given_name', ''),
            "lastName": user_info.get('family_name', ''),
            "name": f"{user_info.get('given_name', '')} {user_info.get('family_name', '')}".strip(),
            "email": user_info['email'],
            "password_hash": "",  # Empty for OAuth users
            "password": random_password,  # Not used for OAuth users but kept for compatibility
            "role": "user",
            "verified": True,  # Google emails are pre-verified
            "emailVerified": True,  # Google emails are pre-verified
            "active": False,  # Requires manual activation by admin
            "googleId": user_info.get('sub'),  # Google user ID
            "tenantId": default_tenant['tenantId'],
            "created_at": current_time,
            "updated_at": current_time,
            "createdAt": current_time.timestamp() * 1000,
            "updatedAt": current_time.timestamp() * 1000
        }

        # Validate tenantId is present
        if not new_user.get("tenantId"):
            await MongoStorageService.delete_one("tenants", {"ownerId": new_user_id})
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="OAuth user creation failed: tenantId is required"
            )

        try:
            await MongoStorageService.insert_one("users", new_user, tenant_id=default_tenant['tenantId'])
            logger.info(f"Created new Google OAuth user: {user_info['email']}")
        except Exception as e:
            # Clean up: delete the tenant since user creation failed
            await MongoStorageService.delete_one("tenants", {"ownerId": new_user_id})
            logger.error(f"Failed to create Google OAuth user {new_user_id}: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create user account. OAuth registration aborted."
            )

        # Note: Role assignment moved to after successful authentication
        # Default role will be created on first authenticated request

        # Check if user is active before allowing login
        if not new_user.get("active", True):
            logger.warning(f"[OAUTH] Newly created inactive user attempted login: {new_user['email']}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your account has been created but is not yet activated. Please contact an administrator to activate your account."
            )

        return {
            "id": new_user['_id'],  # Use _id to match updated structure
            "role": "user",
            "email": new_user['email'],
            "name": new_user['name'],
            "tenantId": default_tenant['tenantId'],
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



        # Get email from Microsoft user info (can be in 'mail' or 'userPrincipalName')
        email = user_info.get('mail', user_info.get('userPrincipalName', ''))
        
        # Check if user already exists - use MongoStorageService properly
        try:
            existing_user = await MongoStorageService.find_one("users", {"email": email})
        except Exception as e:
            logger.error(f"[OAUTH] Failed to check for existing Microsoft user: {e}")
            existing_user = None

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

        # Note: Default role creation moved to after successful authentication

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
            "active": False,  # Requires manual activation by admin
            "tenantId": default_tenant['tenantId'],
            "createdAt": datetime.utcnow().timestamp() * 1000,
            "updatedAt": datetime.utcnow().timestamp() * 1000
        }

        # Validate tenantId is present
        if not new_user.get("tenantId"):
            await MongoStorageService.delete_one("tenants", {"ownerId": new_user_id})
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="OAuth user creation failed: tenantId is required"
            )

        try:
            await MongoStorageService.insert_one("users", new_user, tenant_id=default_tenant['tenantId'])
            logger.info(f"Created new Microsoft OAuth user: {user_info['email']}")
        except Exception as e:
            # Clean up: delete the tenant since user creation failed
            await MongoStorageService.delete_one("tenants", {"ownerId": new_user_id})
            logger.error(f"Failed to create Microsoft OAuth user {new_user_id}: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create user account. OAuth registration aborted."
            )

        # Note: Role assignment moved to after successful authentication
        # Default role will be created on first authenticated request

        # Check if user is active before allowing login
        if not new_user.get("active", True):
            logger.warning(f"[OAUTH] Newly created inactive Microsoft user attempted login: {new_user['email']}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your account has been created but is not yet activated. Please contact an administrator to activate your account."
            )

        return {
            "id": new_user['id'],
            "role": "user",
            "email": new_user['email'],
            "name": new_user['name'],
            "tenantId": default_tenant['tenantId'],
            "new_user": True
        }

    @staticmethod
    async def get_current_user_info(user: Dict[str, Any]) -> Dict[str, Any]:
        """Get current user information"""


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
            user_doc = await MongoStorageService.find_one("users", {"id": user.get("id")})
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
