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
from ..db import get_collections
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
    def _get_users_collection():
        """Get the users collection"""
        logger.debug("[USER] Accessing users collection")
        return get_collections()["users"]
    
    @staticmethod
    async def check_email_exists(email: str) -> bool:
        """Check if email exists in users collection - no tenant filtering for registration"""
        target = normalize_email(email)
        logger.debug(f"[USER] Checking if email exists: {target}")
        user = await UserService._get_users_collection().find_one({"email": target})
        result = bool(user)
        logger.debug(f"[USER] Email exists check result: {result}")
        return result
    
    @classmethod
    async def register_user(cls, user_data: Dict[str, Any]) -> Dict[str, str]:
        """Register a new user"""
        email = user_data.get('email', 'unknown')
        logger.info(f"[USER] Registration attempt for: {email}")
        logger.debug(f"[USER] Registration data: {user_data}")
        
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
            
            user_record = {
                "_id": user_id,
                "firstName": user_data["firstName"].strip(),
                "lastName": user_data["lastName"].strip(),
                "email": email,
                "password_hash": hash_password(user_data["password"]),
                "verified": False,
                "verification_token": verification_token,
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow()
            }
            
            # Add optional fields
            if user_data.get("profile_picture"):
                user_record["profile_picture"] = user_data["profile_picture"]
            if user_data.get("google_id"):
                user_record["google_id"] = user_data["google_id"]
            
            # Insert user
            await cls._get_users_collection().insert_one(user_record)
            
            # Create default tenant
            tenant_info = await TenantService.create_default_tenant(email, user_id)
            
            # Send verification email
            await send_registration_email(email, verification_token, user_data["firstName"])
            
            logger.info(f"[USER] Successfully registered user: {email}")
            return {
                "message": "Registration successful. Please check your email to verify your account.",
                "user_id": user_id,
                "tenant_id": tenant_info["tenant_id"]
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
            user = await cls._get_users_collection().find_one({"verification_token": token})
            
            if not user:
                logger.warning(f"[USER] Invalid verification token: {token[:10]}...")
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid or expired verification token"
                )
            
            if user.get("verified", False):
                logger.info(f"[USER] User already verified: {user.get('email')}")
                return {"message": "Email already verified"}
            
            # Update user as verified
            await cls._get_users_collection().update_one(
                {"_id": user["_id"]},
                {
                    "$set": {
                        "verified": True,
                        "verified_at": datetime.utcnow(),
                        "updated_at": datetime.utcnow()
                    },
                    "$unset": {"verification_token": ""}
                }
            )
            
            logger.info(f"[USER] Email verified successfully for: {user.get('email')}")
            return {"message": "Email verified successfully"}
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"[USER] Email verification failed: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Email verification failed"
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
            user_doc = await cls._get_users_collection().find_one({"_id": user_id})
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
        
        update_record["updated_at"] = datetime.utcnow()
        
        try:
            result = await cls._get_users_collection().update_one(
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
        existing_user = await cls._get_users_collection().find_one({"email": email})
        
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
            
            await cls._get_users_collection().update_one(
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
        collections = get_collections()
        
        if role == "user":
            user_data = await collections['users'].find_one({"id": user_id, "tenantId": tenant_id})
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
