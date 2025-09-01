from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel, validator

from ..db import get_collections
from ..utils.auth import verify_token_middleware, normalize_email

router = APIRouter()

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
    role = user.get("role")
    user_id = user.get("id")
    
    if not role or not user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid user data"
        )
    
    collections = get_collections()
    
    if role == "user":
        user_data = await collections['users'].find_one(
            {"id": user_id},
            {"_id": 0}
        )
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
    
    # Remove sensitive data
    if "password" in user_data:
        del user_data["password"]
    
    return user_data


@router.put("/profile")
async def update_profile(
    profile_update: ProfileUpdate,
    user: dict = Depends(verify_token_middleware)
):
    """Update user profile"""
    role = user.get("role")
    user_id = user.get("id")
    
    if not role or not user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid user data"
        )
    
    collections = get_collections()
    
    # Get current user data
    if role == "user":
        current_user = await collections['users'].find_one({"id": user_id})
        collection = collections['users']
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid role"
        )
    
    if not current_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Prepare update data
    # Pydantic v2 prefers model_dump over dict
    try:
        update_data = profile_update.model_dump(exclude_unset=True)  # type: ignore[attr-defined]
    except Exception:
        update_data = profile_update.dict(exclude_unset=True)
    
    # Update name if firstName or lastName changed
    if profile_update.firstName is not None or profile_update.lastName is not None:
        first_name = profile_update.firstName if profile_update.firstName is not None else current_user.get('firstName', '')
        last_name = profile_update.lastName if profile_update.lastName is not None else current_user.get('lastName', '')
        update_data['name'] = f"{first_name} {last_name}".strip()
    
    # Update user in database
    await collection.update_one(
        {"id": user_id},
        {"$set": update_data}
    )
    
    # Get updated user data
    updated_user = await collection.find_one({"id": user_id})
    
    # Remove sensitive data before responding
    if "password" in updated_user:
        del updated_user["password"]
    if "_id" in updated_user:
        del updated_user["_id"]
    
    return updated_user


@router.get("/profile/completeness", response_model=ProfileCompletenessResponse)
async def get_profile_completeness(user: dict = Depends(verify_token_middleware)):
    """Check if profile is complete"""
    role = user.get("role")
    user_id = user.get("id")
    
    if not role or not user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid user data"
        )
    
    collections = get_collections()
    
    if role == "user":
        user_data = await collections['users'].find_one({"id": user_id})
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
    
    return ProfileCompletenessResponse(
        isComplete=len(missing) == 0,
        missingFields=missing,
        completionPercentage=completion_percentage
    )
