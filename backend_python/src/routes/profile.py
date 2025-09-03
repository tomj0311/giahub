from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel, validator

from ..db import get_collections
from ..utils.auth import verify_token_middleware, normalize_email
from ..services.user_service import UserService
from ..utils.log import logger

router = APIRouter(prefix="/api")

# Pydantic models
class ProfileUpdate(BaseModel):
    firstName: Optional[str] = None
    lastName: Optional[str] = None

    @validator('firstName', 'lastName')
    def name_length(cls, v):
        if v is not None and (len(v) < 1 or len(v) > 50):
            raise ValueError('Name must be between 1 and 50 characters')
        return v

    # validators for removed fields deleted


class ProfileCompletenessResponse(BaseModel):
    isComplete: bool
    missingFields: List[str]
    completionPercentage: int


@router.get("/profile")
async def get_profile(user: dict = Depends(verify_token_middleware)):
    """Get user profile"""
    user_id = user.get("id")
    logger.info(f"[PROFILE] Getting profile for user: {user_id}")
    
    role = user.get("role")
    tenant_id = user.get("tenantId")
    
    if not role or not user_id:
        logger.warning(f"[PROFILE] Invalid user data for profile request: {user}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid user data"
        )
    
    if not tenant_id:
        logger.warning(f"[PROFILE] Missing tenant information for user: {user_id}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User tenant information missing. Please re-login."
        )
    
    try:
        logger.debug(f"[PROFILE] Fetching profile data for user: {user_id}")
        profile = await UserService.get_user_profile(user_id)
        logger.info(f"[PROFILE] Successfully retrieved profile for user: {user_id}")
        return profile
    except Exception as e:
        logger.error(f"[PROFILE] Failed to get profile for user {user_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get profile"
        )


@router.put("/profile")
async def update_profile(
    profile_update: ProfileUpdate,
    user: dict = Depends(verify_token_middleware)
):
    """Update user profile"""
    user_id = user.get("id")
    logger.info(f"[PROFILE] Updating profile for user: {user_id}")
    logger.debug(f"[PROFILE] Update data: {profile_update.dict(exclude_unset=True)}")
    
    role = user.get("role")
    tenant_id = user.get("tenantId")
    
    if not role or not user_id:
        logger.warning(f"[PROFILE] Invalid user data for profile update: {user}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid user data"
        )
    
    if not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User tenant information missing. Please re-login."
        )
    
    try:
        # Prepare update data
        try:
            update_data = profile_update.model_dump(exclude_unset=True)
        except Exception:
            update_data = profile_update.dict(exclude_unset=True)
        
        updated_profile = await UserService.update_user_profile(user_id, update_data)
        return updated_profile
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update profile"
        )


@router.get("/profile/completeness", response_model=ProfileCompletenessResponse)
async def get_profile_completeness(user: dict = Depends(verify_token_middleware)):
    """Check if profile is complete"""
    role = user.get("role")
    user_id = user.get("id")
    tenant_id = user.get("tenantId")
    
    if not role or not user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid user data"
        )
    
    if not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User tenant information missing. Please re-login."
        )
    
    try:
        result = await UserService.get_profile_completeness(user_id, tenant_id, role)
        return ProfileCompletenessResponse(**result)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get profile completeness"
        )
