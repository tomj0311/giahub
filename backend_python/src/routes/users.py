"""
User management routes for registration, authentication, and verification.
Handles user CRUD operations and related functionality.
"""

import uuid
import secrets
import string
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel, EmailStr, validator

from ..utils.log import logger
from ..utils.auth import verify_token_middleware
from ..services.email_service import send_registration_email
from ..services.rbac_service import RBACService
from ..services.tenant_service import TenantService
from ..services.user_service import UserService

router = APIRouter(tags=["users"])

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


# Routes
@router.post("/", status_code=status.HTTP_201_CREATED)
async def register_user(registration: UserRegistration):
    """Register a new user"""
    logger.info(f"[USERS] Registration attempt for email: {registration.email}")
    
    # Check for duplicate email
    if await UserService.email_exists(registration.email):
        logger.warning(f"[USERS] Registration failed - email already exists: {registration.email}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered. Please log in or use a different email."
        )
    
    try:
        result = await UserService.register_user(
            registration.firstName,
            registration.lastName,
            registration.email,
            registration.password
        )
        return result
    except Exception as e:
        logger.error(f"[USERS] Registration failed for {registration.email}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Registration failed"
        )


@router.post("/verify")
async def verify_user(verification: VerifyToken):
    """Verify user email"""
    try:
        result = await UserService.verify_user(verification.token)
        return result
    except Exception as e:
        logger.error(f"[USERS] Verification failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification failed"
        )


@router.post("/login")
async def login_user(login_data: UserLogin):
    """Login user"""
    try:
        result = await UserService.authenticate_user(login_data.email, login_data.password)
        return result
    except Exception as e:
        logger.error(f"[USERS] Login failed for {login_data.email}: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication failed"
        )


@router.get("/")
async def get_users(user: dict = Depends(verify_token_middleware)):
    """Get list of users (authenticated users only) - tenant filtered"""
    try:
        users = await UserService.get_users_by_tenant(user)
        return users
    except Exception as e:
        logger.error(f"[USERS] Failed to get users: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch users"
        )
