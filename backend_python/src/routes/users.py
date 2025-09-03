import uuid
import secrets
import string
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel, EmailStr, validator

from ..utils.log import logger
from ..db import get_collections
from ..utils.auth import (
    hash_password, 
    verify_password, 
    normalize_email,
    verify_token_middleware
)
from ..services.email_service import send_registration_email
from ..services.rbac_service import RBACService
from ..services.tenant_service import TenantService

router = APIRouter()

# Pydantic models
class UserRegistration(BaseModel):
    firstName: str
    lastName: str
    email: EmailStr
    password: str
    confirmPassword: str

    @validator('confirmPassword')
    def passwords_match(cls, v, values):
        if 'password' in values and v != values['password']:
            raise ValueError('Passwords do not match')
        return v

    @validator('password')
    def password_length(cls, v):
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters')
        return v


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class VerifyToken(BaseModel):
    token: str


# Helper functions
async def email_exists(email: str) -> bool:
    """Check if email exists in users collection"""
    target = normalize_email(email)
    collections = get_collections()
    user = await collections['users'].find_one({"email": target})
    return bool(user)


def generate_random_password() -> str:
    """Generate a random password"""
    alphabet = string.ascii_letters + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(12))


# Routes
@router.post("/", status_code=status.HTTP_201_CREATED)
async def register_user(registration: UserRegistration):
    """Register a new user"""
    
    # Check for duplicate email
    if await email_exists(registration.email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered. Please log in or use a different email."
        )
    
    # Create user
    collections = get_collections()
    hashed_password = hash_password(registration.password)
    user_id = str(uuid.uuid4())
    
    # CREATE TENANT FIRST - MANDATORY
    try:
        default_tenant = await TenantService.create_default_tenant(registration.email, user_id)
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Failed to create tenant for user {user_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create user organization. Registration aborted."
        )
    
    user_data = {
        "id": user_id,
        "role": "user",
        "active": False,
        "password": hashed_password,
        "createdAt": datetime.utcnow().timestamp() * 1000,  # milliseconds
        "firstName": registration.firstName,
        "lastName": registration.lastName,
        "name": f"{registration.firstName} {registration.lastName}".strip(),
        "email": normalize_email(registration.email),
        "emailOriginal": registration.email,
        "tenantId": default_tenant["tenantId"]  # FUCKING TENANTID IS HERE NOW
    }
    
    # CRITICAL: Validate tenantId is present before insertion
    if not user_data.get("tenantId"):
        await collections['tenants'].delete_one({"ownerId": user_id})  # Clean up tenant
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="User registration failed: tenantId is required"
        )
    
    # Remove None values
    user_data = {k: v for k, v in user_data.items() if v is not None}
    
    await collections['users'].insert_one(user_data)
    
    # Create default role for the user (owned by the user) and assign it
    # CRITICAL: This MUST succeed or registration fails
    try:
        default_role = await RBACService.create_default_user_role(
            registration.email, 
            owner_id=user_id,
            tenant_id=default_tenant["tenantId"]
        )
        await RBACService.assign_role_to_user(user_id, default_role["roleId"])
    except Exception as e:
        # Delete the user and tenant if role creation fails to maintain data consistency
        await collections['users'].delete_one({"id": user_id})
        await collections['tenants'].delete_one({"ownerId": user_id})
        import logging
        logging.getLogger(__name__).error(f"Failed to create/assign default role for user {user_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create user security profile. Registration aborted."
        )
    
    # Create verification token
    verification_token = str(uuid.uuid4())
    await collections['verificationTokens'].insert_one({
        "token": verification_token,
        "userId": user_id,
        "createdAt": datetime.utcnow()
    })
    
    # Send verification email
    try:
        await send_registration_email(user_data["email"], "user", verification_token)
    except Exception:
        pass  # Continue even if email fails
    
    return {"id": user_id, "verifyToken": verification_token}


@router.post("/verify")
async def verify_user(verification: VerifyToken):
    """Verify user email"""
    collections = get_collections()
    
    # Find verification token
    token_record = await collections['verificationTokens'].find_one({"token": verification.token})
    if not token_record:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="invalid token"
        )
    
    # Find user
    user = await collections['users'].find_one({"id": token_record.get("userId") or token_record.get("consumerId")})
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="user not found"
        )
    
    # Activate user
    await collections['users'].update_one(
        {"id": user["id"]},
        {"$set": {"active": True}}
    )
    
    # Remove verification token
    await collections['verificationTokens'].delete_one({"token": verification.token})
    
    return {"status": "verified"}


@router.post("/login")
async def login_user(login_data: UserLogin):
    """Login user"""
    collections = get_collections()
    target_email = normalize_email(login_data.email)
    
    user = await collections['users'].find_one({
        "$or": [
            {"email": target_email},
            {"emailOriginal": target_email}
        ]
    })
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid credentials"
        )
    
    if not user.get("active"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="not verified"
        )
    
    if not verify_password(login_data.password, user["password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid credentials"
        )
    
    # CRITICAL: Ensure user has a default role assigned
    # This fixes any legacy users who might not have roles
    try:
        from ..services.rbac_service import RBACService
        user_roles = await RBACService.get_user_roles(user["id"])
        if not user_roles:
            # User has no roles assigned, create and assign default role
            default_role = await RBACService.create_default_user_role(user["email"], owner_id=user["id"])
            await RBACService.assign_role_to_user(user["id"], default_role["roleId"])
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Failed to ensure default role for user {user['id']} during login: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to validate user security profile."
        )
    
    return {
        "id": user["id"],
        "name": user["name"],
        "email": user["email"],
        "role": "user"
    }


@router.get("/")
async def get_users(user: dict = Depends(verify_token_middleware)):
    """Get list of users (authenticated users only)"""
    collections = get_collections()
    users = await collections['users'].find(
        {},
        {"_id": 0, "password": 0}
    ).to_list(None)
    
    return users
