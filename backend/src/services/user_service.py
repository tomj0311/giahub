"""
User Service

This service handles all user-related business logic including user registration,
validation, user management, and user-specific operations.
"""

import uuid
import secrets
import string
from datetime import datetime
from typing import Optional, List, Dict, Any
from fastapi import HTTPException, status

from ..utils.log import logger
from ..utils.mongo_storage import MongoStorageService
from ..utils.auth import (
    hash_password, 
    normalize_email
)
from ..services.email_service import send_registration_email
from ..services.rbac_service import RBACService
from ..services.tenant_service import TenantService


class UserService:
    """Service for managing users"""
    
    @staticmethod
    async def check_email_exists(email: str) -> bool:
        """Check if email exists in users collection - no tenant filtering for registration"""
        target = normalize_email(email)
        user = await MongoStorageService.find_one("users", {"email": target})
        result = bool(user)
        return result
    
    @classmethod
    async def register_user(cls, user_data: Dict[str, Any]) -> Dict[str, str]:
        """Register a new user"""
        email = user_data.get('email', 'unknown')
        logger.info(f"[USER] Registration attempt for: {email}")
        
        # Validate required fields
        required_fields = ['firstName', 'lastName', 'email', 'password']
        missing_fields = [field for field in required_fields if not user_data.get(field)]
        if missing_fields:
            logger.warning(f"[USER] Registration failed - missing fields: {missing_fields} for email: {email}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Missing required fields: {', '.join(missing_fields)}"
            )
        
        email = normalize_email(user_data["email"])
        
        # Check if email already exists
        if await cls.check_email_exists(email):
            logger.warning(f"[USER] Registration failed - email already exists: {email}")
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email already registered"
            )
        
        try:
            # Create user record
            user_id = str(uuid.uuid4())
            verification_token = cls._generate_verification_token()
            current_time = datetime.utcnow()
            
            user_record = {
                "_id": user_id,
                "id": user_id,
                "firstName": user_data["firstName"].strip(),
                "lastName": user_data["lastName"].strip(),
                "name": f"{user_data['firstName'].strip()} {user_data['lastName'].strip()}",
                "email": email,
                "password_hash": hash_password(user_data["password"]),
                "password": "",  # Empty for regular users (password_hash is used)
                "role": "user",
                "verified": False,
                "emailVerified": False,  # Standardized field name
                "active": False,  # User requires manual activation by admin
                "verification_token": verification_token,
                "created_at": current_time,
                "updated_at": current_time,
                "createdAt": current_time.timestamp() * 1000,  # Timestamp in milliseconds
                "updatedAt": current_time.timestamp() * 1000   # Timestamp in milliseconds
            }
            
            # Add optional fields
            if user_data.get("profile_picture"):
                user_record["profile_picture"] = user_data["profile_picture"]
            if user_data.get("google_id"):
                user_record["googleId"] = user_data["google_id"]  # Standardized field name
            
            # Insert user
            await MongoStorageService.insert_one("users", user_record)
            
            # Create default tenant
            tenant_info = await TenantService.create_default_tenant(email, user_id)
            
            # Update user record with tenant_id
            await MongoStorageService.update_one("users",
                {"_id": user_id},
                {"$set": {"tenantId": tenant_info["tenantId"]}}
            )
            
            # Send verification email
            await send_registration_email(email, "user", verification_token)
            
            logger.info(f"[USER] Successfully registered user: {email}")
            return {
                "message": "Registration successful. Please check your email to verify your account. After verification, an administrator will need to activate your account.",
                "user_id": user_id,
                "tenant_id": tenant_info["tenantId"]
            }
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"[USER] Registration failed for {email}: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Registration failed"
            )
    
    @classmethod
    async def verify_user_email(cls, token: str) -> Dict[str, str]:
        """Verify user email with verification token"""
        logger.info(f"[USER] Email verification attempt with token: {token[:10]}...")
        
        if not token:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Verification token is required"
            )
        
        try:
            user = await MongoStorageService.find_one("users", {"verification_token": token})
            
            if not user:
                logger.warning(f"[USER] Invalid verification token: {token[:10]}...")
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid or expired verification token"
                )
            
            if user.get("verified", False):
                logger.info(f"[USER] User already verified: {user.get('email')}")
                return {"message": "Email already verified"}
            
            # Update user as verified but NOT activated (requires manual admin activation)
            current_time = datetime.utcnow()
            update_data = {
                "verified": True,
                "emailVerified": True,  # Standardized field
                "verified_at": current_time,
                "updated_at": current_time,
                "updatedAt": current_time.timestamp() * 1000  # Timestamp in milliseconds
            }
            
            # For invited users, activate immediately since they have a password
            # For regular users, remove token and require admin activation
            if user.get("isInvited", False):
                logger.info(f"[USER] Email verified for invited user: {user.get('email')} - account activated, user can now log in")
                update_data["active"] = True  # Activate invited user immediately
                await MongoStorageService.update_one("users",
                    {"_id": user["_id"]},
                    {
                        "$set": update_data,
                        "$unset": {"verification_token": ""}  # Remove token after verification
                    }
                )
            else:
                logger.info(f"[USER] Email verified for regular user: {user.get('email')} - awaiting manual activation by admin")
                await MongoStorageService.update_one("users",
                    {"_id": user["_id"]},
                    {
                        "$set": update_data,
                        "$unset": {"verification_token": ""}
                    }
                )
            
            logger.info(f"[USER] Email verified successfully for: {user.get('email')}")
            
            # Return appropriate message based on user type
            if user.get("isInvited", False):
                return {
                    "message": "Email verified successfully! You can now log in with the password provided in the invitation email.",
                    "userType": "invited", 
                    "activated": True,
                    "requiresPasswordSetup": False
                }
            else:
                return {
                    "message": "Email verified successfully! Your account is awaiting activation by an administrator.",
                    "userType": "registered",
                    "activated": False,
                    "requiresManualActivation": True
                }
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"[USER] Email verification failed: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Email verification failed"
            )
    
    @classmethod
    async def set_password_for_invited_user(cls, token: str, new_password: str) -> Dict[str, str]:
        """Set password for invited user using verification token"""
        logger.info(f"[USER] Password setup attempt for invited user with token: {token[:10]}...")
        
        if not token or not new_password:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Token and password are required"
            )
        
        try:
            user = await MongoStorageService.find_one("users", {"verification_token": token})
            
            if not user:
                logger.warning(f"[USER] Invalid verification token for password setup: {token[:10]}...")
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid or expired verification token"
                )
            
            # Check if user is invited
            if not user.get("isInvited", False):
                logger.warning(f"[USER] Non-invited user attempted password setup: {user.get('email')}")
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="This endpoint is only for invited users"
                )
            
            # Check if user already has verified email and set password
            if user.get("verified", False) and user.get("passwordSetByUser", False):
                logger.info(f"[USER] Invited user already completed setup: {user.get('email')}")
                return {"message": "Password already set. You can now log in."}
            
            # Hash the new password and update user
            from ..utils.auth import hash_password
            current_time = datetime.utcnow()
            update_data = {
                "password_hash": hash_password(new_password),
                "verified": True,
                "emailVerified": True,
                "active": True,  # Activate invited user once they set password
                "passwordSetByUser": True,  # Flag to track user has set their own password
                "verified_at": current_time,
                "updated_at": current_time,
                "updatedAt": current_time.timestamp() * 1000
            }
            
            await MongoStorageService.update_one("users",
                {"_id": user["_id"]},
                {
                    "$set": update_data,
                    "$unset": {"verification_token": ""}  # Remove token after use
                }
            )
            
            logger.info(f"[USER] Password set successfully for invited user: {user.get('email')}")
            return {
                "message": "Password set successfully! Your account is now active and you can log in.",
                "userType": "invited",
                "activated": True
            }
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"[USER] Password setup failed: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Password setup failed"
            )
    
    @classmethod
    async def get_user_profile(cls, user: Dict[str, Any]) -> Dict[str, Any]:
        """Get user profile information"""
        user_id = user.get("id") or user.get("userId")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User ID not found in token"
            )
        
        try:
            user_doc = await MongoStorageService.find_one("users", {"_id": user_id})
            if not user_doc:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="User not found"
                )
            
            # Get tenant info
            tenant_info = await TenantService.get_user_tenant_info(user_id)
            
            profile = {
                "id": str(user_doc["_id"]),
                "firstName": user_doc.get("firstName"),
                "lastName": user_doc.get("lastName"),
                "email": user_doc.get("email"),
                "verified": user_doc.get("verified", False),
                "created_at": user_doc.get("created_at"),
                "last_login": user_doc.get("last_login"),
                "profile_picture": user_doc.get("profile_picture"),
                "tenant": tenant_info
            }
            
            return profile
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"[USER] Failed to get profile for user {user_id}: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to retrieve user profile"
            )
    
    @classmethod
    async def update_user_profile(cls, user: Dict[str, Any], update_data: Dict[str, Any]) -> Dict[str, str]:
        """Update user profile"""
        user_id = user.get("id") or user.get("userId")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User ID not found in token"
            )
        
        # Only allow certain fields to be updated
        allowed_fields = ["firstName", "lastName", "profile_picture"]
        update_record = {}
        
        for field in allowed_fields:
            if field in update_data:
                update_record[field] = update_data[field]
        
        if not update_record:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No valid fields to update"
            )
        
        current_time = datetime.utcnow()
        update_record["updated_at"] = current_time
        update_record["updatedAt"] = current_time.timestamp() * 1000  # Timestamp in milliseconds
        
        # Update name field if firstName or lastName changed
        if "firstName" in update_record or "lastName" in update_record:
            # Get current user data to build name
            user_doc = await MongoStorageService.find_one("users", {"_id": user_id})
            if user_doc:
                first_name = update_record.get("firstName", user_doc.get("firstName", ""))
                last_name = update_record.get("lastName", user_doc.get("lastName", ""))
                update_record["name"] = f"{first_name} {last_name}".strip()
        
        try:
            result = await MongoStorageService.update_one("users",
                {"_id": user_id},
                {"$set": update_record}
            )
            
            if result.modified_count == 0:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="User not found"
                )
            
            logger.info(f"[USER] Profile updated for user: {user_id}")
            return {"message": "Profile updated successfully"}
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"[USER] Failed to update profile for user {user_id}: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to update profile"
            )
    
    @staticmethod
    def _generate_verification_token() -> str:
        """Generate a secure verification token"""
        return ''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(64))
    
    @classmethod
    async def create_or_update_google_user(cls, google_user_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create or update user from Google OAuth data"""
        email = google_user_data["email"]
        
        # Check if user exists
        existing_user = await MongoStorageService.find_one("users", {"email": email})
        
        if existing_user:
            # Update existing user with Google info if missing
            update_data = {"updated_at": datetime.utcnow()}
            
            if not existing_user.get("google_id"):
                update_data["google_id"] = google_user_data.get("google_id")
            
            if not existing_user.get("profile_picture") and google_user_data.get("profile_picture"):
                update_data["profile_picture"] = google_user_data["profile_picture"]
            
            if not existing_user.get("verified"):
                update_data["verified"] = True
                update_data["verified_at"] = datetime.utcnow()
            
            await MongoStorageService.update_one("users",
                {"_id": existing_user["_id"]},
                {"$set": update_data}
            )
            
            return existing_user
        
        # Create new user
        user_data = {
            "firstName": google_user_data["firstName"],
            "lastName": google_user_data["lastName"],
            "email": email,
            "password": secrets.token_urlsafe(32),  # Random password for OAuth users
            "verified": google_user_data.get("verified", True),
            "profile_picture": google_user_data.get("profile_picture"),
            "google_id": google_user_data.get("google_id")
        }
        
        return await cls.register_user(user_data)
    
    @classmethod
    async def get_profile_completeness(cls, user_id: str, tenant_id: str, role: str) -> Dict[str, Any]:
        """Check profile completeness for a user"""
        
        if role == "user":
            user_data = await MongoStorageService.find_one("users", {"id": user_id}, tenant_id=tenant_id)
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid role"
            )
        
        if not user_data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        
        # Define required fields for each role
        required_fields = {
            "user": ["firstName", "lastName", "email"],
        }
        
        required = required_fields.get(role, [])
        missing = []
        
        for field in required:
            field_value = user_data.get(field)
            if not field_value or (isinstance(field_value, str) and field_value.strip() == ""):
                missing.append(field)
        
        completion_percentage = round(((len(required) - len(missing)) / len(required)) * 100) if required else 100
        
        return {
            "isComplete": len(missing) == 0,
            "missingFields": missing,
            "completionPercentage": completion_percentage
        }
    
    @classmethod
    async def get_users_by_tenant(cls, user: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Get all users filtered by tenant"""
        user_id = user.get("id")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid user"
            )
        
        try:
            from ..utils.tenant_middleware import tenant_filter_query, tenant_filter_records
            
            # Get tenant_id for the requesting user
            tenant_id = await TenantService.get_user_tenant_id(user_id)
            
            # Filter users by tenant
            user_query = await tenant_filter_query(user_id, {})
            all_users = await MongoStorageService.find_many("users", user_query)
            
            # Additional tenant filtering for safety
            tenant_users = await tenant_filter_records(user_id, all_users)
            
            # Build user list with their roles (tenant-filtered)
            users = []
            for u in tenant_users:
                user_id_field = u.get('id') or u.get('_id')
                if not user_id_field:
                    continue
                
                # Get user's roles (already tenant-filtered via RBAC service)
                user_roles = await RBACService.get_user_roles(str(user_id_field), tenant_id=tenant_id)
                
                # Build user data without password and _id (ObjectId serialization issue)
                user_data = {k: v for k, v in u.items() if k not in ["password", "_id", "password_hash"]}
                user_data["id"] = str(user_id_field)
                user_data["roles"] = user_roles
                users.append(user_data)
            
            logger.info(f"[USER] Retrieved {len(users)} users for tenant")
            return users
            
        except Exception as e:
            logger.error(f"[USER] Failed to get users by tenant: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to retrieve users"
            )
