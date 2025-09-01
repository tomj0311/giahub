import os
from fastapi import APIRouter, HTTPException, Depends, status, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, EmailStr
from typing import Optional
import secrets
import string

from ..db import get_collections
from ..utils.auth import (
    generate_token, 
    verify_password, 
    normalize_email, 
    verify_token_middleware
)
from ..config.oauth import get_oauth_client, handle_google_user_data

router = APIRouter()

# Pydantic models
class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    token: str
    role: str
    name: Optional[str] = None


# Admin credentials with development fallbacks
ADMIN_USER = os.getenv('ADMIN_USER', 'admin')
ADMIN_PASS = os.getenv('ADMIN_PASS', '123')


@router.post("/login", response_model=LoginResponse)
async def login(request: LoginRequest):
    """Login endpoint for admin and users"""
    if not request.username or not request.password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username and password are required"
        )
    
    normalized_username = normalize_email(request.username)
    
    # Admin login
    if normalized_username == normalize_email(ADMIN_USER) and request.password == ADMIN_PASS:
        token = generate_token({"role": "admin", "username": request.username})
        return LoginResponse(token=token, role="admin")
    
    collections = get_collections()
    
    # User login
    user = await collections['users'].find_one({
        "$or": [
            {"email": normalized_username},
            {"emailOriginal": normalized_username}
        ]
    })
    
    if user and user.get('active') and verify_password(request.password, user['password']):
        token = generate_token({
            "role": "user",
            "id": user['id'],
            "email": user['email']
        })
        return LoginResponse(token=token, role="user", name=user.get('name'))
    
    # Providers feature removed
    
    # Invalid credentials
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="invalid credentials"
    )


# Google OAuth routes
@router.get("/google")
async def google_auth(request: Request):
    """Initiate Google OAuth flow"""
    try:
        oauth_client = get_oauth_client()
        # Construct the callback URL explicitly
        redirect_uri = f"{request.url.scheme}://{request.url.netloc}/auth/google/callback"
        return await oauth_client.authorize_redirect(request, redirect_uri)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"OAuth initialization failed: {str(e)}"
        )


@router.get("/google/callback")
async def google_callback(request: Request):
    """Handle Google OAuth callback"""
    try:
        oauth_client = get_oauth_client()
        token = await oauth_client.authorize_access_token(request)
        user_info = token.get('userinfo')
        
        if not user_info:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to get user information from Google"
            )
        
        # Process the user data and create/update user
        user_data = await handle_google_user_data(user_info)
        
        # ADDITIONAL SAFETY CHECK: Ensure user has roles after OAuth processing
        # This catches any edge cases where role creation might have failed
        if not user_data.get('new_user'):
            try:
                from ..services.rbac_service import RBACService
                user_roles = await RBACService.get_user_roles(user_data['id'])
                if not user_roles:
                    print(f"⚠️ Warning: Existing OAuth user {user_data['email']} has no roles. Creating default role...")
                    default_role = await RBACService.create_default_user_role(user_data['email'], owner_id=user_data['id'])
                    await RBACService.assign_role_to_user(user_data['id'], default_role["roleId"])
                    print(f"✅ Created and assigned default role for {user_data['email']}")
            except Exception as e:
                import logging
                logging.getLogger(__name__).error(f"Failed to ensure roles for OAuth user {user_data['id']}: {e}")
                # Continue with login - user can still access the system
        
        # Check if this is a new user that needs registration completion
        if user_data.get('new_user'):
            # For new users, create role FIRST, then create user
            collections = get_collections()
            
            # Generate user ID first
            new_user_id = secrets.token_urlsafe(16)
            
            # STEP 1: Create default role BEFORE creating user
            try:
                from ..services.rbac_service import RBACService
                print(f"🔧 Creating default role for new Google OAuth user: {user_data['email']}")
                default_role = await RBACService.create_default_user_role(user_data['email'], owner_id=new_user_id)
                print(f"✅ Created default role: {default_role['roleId']} for {user_data['email']}")
            except Exception as e:
                import logging
                logging.getLogger(__name__).error(f"Failed to create default role for Google OAuth user {user_data['email']}: {e}")
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to create user security profile. OAuth registration aborted."
                )
            
            # STEP 2: Create user with proper structure
            random_password = ''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(32))
            new_user = {
                "id": new_user_id,
                "email": user_data['email'],
                "name": user_data['name'],
                "firstName": user_data.get('firstName', ''),
                "lastName": user_data.get('lastName', ''),
                "password": random_password,  # Not used for OAuth users
                "role": "user",
                "googleId": user_info.get('sub'),  # Google user ID
                "emailVerified": True,  # Google emails are pre-verified
                "active": True,  # Make sure user is active
                "createdAt": None,  # Will be set by database
                "updatedAt": None   # Will be set by database
            }
            
            try:
                await collections['users'].insert_one(new_user)
                print(f"✅ Created new Google OAuth user: {user_data['email']}")
            except Exception as e:
                import logging
                logging.getLogger(__name__).error(f"Failed to create Google OAuth user {new_user_id}: {e}")
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to create user account. OAuth registration aborted."
                )
            
            # STEP 3: Assign the role to the user
            try:
                await RBACService.assign_role_to_user(new_user_id, default_role["roleId"])
                print(f"✅ Assigned role {default_role['roleId']} to user {new_user_id}")
            except Exception as e:
                # Clean up: delete the user since role assignment failed
                await collections['users'].delete_one({"id": new_user_id})
                import logging
                logging.getLogger(__name__).error(f"Failed to assign role to Google OAuth user {new_user_id}: {e}")
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to assign security role. OAuth registration aborted."
                )
            
            user_data = {
                "id": new_user['id'],
                "role": "user", 
                "email": user_data['email'],
                "name": user_data['name']
            }
        
        # Generate JWT token for the user
        token = generate_token({
            "id": user_data['id'],
            "role": user_data['role']
        })
        
        # Redirect to frontend with token (you might want to handle this differently)
        client_url = os.getenv('CLIENT_URL', 'http://localhost:5173')
        return RedirectResponse(
            url=f"{client_url}/auth/callback?token={token}&name={user_data['name']}"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"OAuth callback failed: {str(e)}"
        )


@router.post("/logout")
async def logout(user: dict = Depends(verify_token_middleware)):
    """Logout endpoint (token-based, so just return success)"""
    return {"message": "Logged out successfully"}


@router.get("/me")
async def get_current_user(user: dict = Depends(verify_token_middleware)):
    """Get current user information"""
    return {
        "role": user.get("role"),
        "id": user.get("id"),
        "email": user.get("email"),
        "username": user.get("username")
    }
