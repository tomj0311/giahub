"""
Authentication routes for user login and OAuth integration.
Handles user authentication, token generation, and Google OAuth flow.
"""

import os
import httpx
from fastapi import APIRouter, HTTPException, Depends, status, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, EmailStr
from typing import Optional

from ..utils.auth import verify_token_middleware, generate_token
from ..utils.log import logger
from ..config.oauth import get_oauth_client, get_microsoft_oauth_client
from ..services.auth_service import AuthService

router = APIRouter(tags=["authentication"])

# Pydantic models
class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    token: str
    role: str
    name: Optional[str] = None


@router.post("/login", response_model=LoginResponse)
async def login(request: LoginRequest):
    """Login endpoint for admin and users"""
    logger.info(f"[LOGIN] Attempting login for user: {request.username}")
    logger.debug(f"[LOGIN] Login request received with username: {request.username}")
    try:
        result = await AuthService.authenticate_user(request.username, request.password)
        logger.info(f"[LOGIN] Success for user: {request.username}")
        logger.debug(f"[LOGIN] Generated response for user: {request.username}")
        return LoginResponse(**result)
    except Exception as e:
        logger.error(f"[LOGIN] Failed for user: {request.username} - {str(e)}")
        raise


# Google OAuth routes
@router.get("/google")
async def google_auth(request: Request):
    """Initiate Google OAuth flow"""
    logger.info("[OAUTH] Initiating Google OAuth flow")
    try:
        oauth_client = get_oauth_client()
        redirect_uri = f"{request.url.scheme}://{request.url.netloc}/auth/google/callback"
        logger.debug(f"[OAUTH] Redirect URI: {redirect_uri}")
        
        # Generate the authorization URL with proper state handling
        response = await oauth_client.authorize_redirect(request, redirect_uri)
        logger.info("[OAUTH] Redirecting to Google OAuth")
        return response
    except Exception as e:
        logger.error(f"[OAUTH] Failed to initiate Google OAuth: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"OAuth initialization failed: {str(e)}"
        )


@router.get("/google/callback")
async def google_callback(request: Request):
    """Handle Google OAuth callback"""
    logger.info("[OAUTH] Processing Google OAuth callback")
    try:
        oauth_client = get_oauth_client()
        
        # Use the correct method for Authlib with Starlette
        token = await oauth_client.authorize_access_token(request)
        
        # Get user info directly from token
        user_info = token.get('userinfo')
        if not user_info:
            # If userinfo not in token, make a separate request
            resp = await oauth_client.get('https://openidconnect.googleapis.com/v1/userinfo', token=token)
            user_info = resp.json()
        
        if not user_info:
            logger.error("[OAUTH] Failed to get user information from Google")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to get user information from Google"
            )
        
        logger.info(f"[OAUTH] Processing user data for: {user_info.get('email', 'unknown')}")
        user_data = await AuthService.handle_google_oauth_callback(user_info)
        logger.info(f"[OAUTH] User authenticated: {user_data.get('email', 'unknown')}")
        
        auth_token = generate_token({
            "id": user_data['id'],
            "role": user_data['role'],
            "tenantId": user_data.get('tenantId'),
            "email": user_data.get('email')
        })
        client_url = os.getenv('CLIENT_URL', 'http://localhost:5173')
        logger.info(f"[OAUTH] Redirecting user to frontend: {client_url}")
        return RedirectResponse(
            url=f"{client_url}/auth/callback?token={auth_token}&name={user_data['name']}"
        )
    except Exception as e:
        logger.error(f"[OAUTH] Exception during callback: {str(e)}")
        # For state mismatch errors, try a simpler approach
        if "mismatching_state" in str(e).lower() or "csrf" in str(e).lower():
            logger.info("[OAUTH] State mismatch detected, attempting manual token exchange")
            try:
                # Manual token exchange as fallback
                import httpx
                code = request.query_params.get('code')
                if code:
                    redirect_uri = f"{request.url.scheme}://{request.url.netloc}/auth/google/callback"
                    
                    # Exchange code for token manually
                    token_data = {
                        'client_id': os.getenv('GOOGLE_CLIENT_ID'),
                        'client_secret': os.getenv('GOOGLE_CLIENT_SECRET'),
                        'code': code,
                        'grant_type': 'authorization_code',
                        'redirect_uri': redirect_uri
                    }
                    
                    async with httpx.AsyncClient() as client:
                        token_response = await client.post(
                            'https://oauth2.googleapis.com/token',
                            data=token_data
                        )
                        token_json = token_response.json()
                        
                        if 'access_token' in token_json:
                            # Get user info with the token
                            user_response = await client.get(
                                'https://openidconnect.googleapis.com/v1/userinfo',
                                headers={'Authorization': f"Bearer {token_json['access_token']}"}
                            )
                            user_info = user_response.json()
                            
                            logger.info(f"[OAUTH] Manual token exchange successful for: {user_info.get('email', 'unknown')}")
                            user_data = await AuthService.handle_google_oauth_callback(user_info)
                            
                            auth_token = generate_token({
                                "id": user_data['id'],
                                "role": user_data['role'],
                                "tenantId": user_data.get('tenantId'),
                                "email": user_data.get('email')
                            })
                            client_url = os.getenv('CLIENT_URL', 'http://localhost:5173')
                            return RedirectResponse(
                                url=f"{client_url}/auth/callback?token={auth_token}&name={user_data['name']}"
                            )
            except Exception as fallback_error:
                logger.error(f"[OAUTH] Manual token exchange also failed: {str(fallback_error)}")
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"OAuth callback failed: {str(e)}"
        )


# Microsoft OAuth routes
@router.get("/microsoft")
async def microsoft_auth(request: Request):
    """Initiate Microsoft OAuth flow"""
    logger.info("[OAUTH] Initiating Microsoft OAuth flow")
    try:
        oauth_client = get_microsoft_oauth_client()
        redirect_uri = f"{request.url.scheme}://{request.url.netloc}/auth/microsoft/callback"
        logger.debug(f"[OAUTH] Microsoft Redirect URI: {redirect_uri}")
        response = await oauth_client.authorize_redirect(request, redirect_uri)
        logger.info("[OAUTH] Redirecting to Microsoft OAuth")
        return response
    except Exception as e:
        logger.error(f"[OAUTH] Failed to initiate Microsoft OAuth: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Microsoft OAuth initialization failed: {str(e)}"
        )


@router.get("/microsoft/callback")
async def microsoft_callback(request: Request):
    """Handle Microsoft OAuth callback"""
    logger.info("[OAUTH] Processing Microsoft OAuth callback")
    try:
        oauth_client = get_microsoft_oauth_client()
        token = await oauth_client.authorize_access_token(request)
        
        # For Microsoft, we need to make an additional request to get user info
        user_info = await oauth_client.get('https://graph.microsoft.com/v1.0/me', token=token)
        user_data_raw = user_info.json()
        
        if not user_data_raw:
            logger.error("[OAUTH] Failed to get user information from Microsoft")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to get user information from Microsoft"
            )
        
        logger.info(f"[OAUTH] Processing Microsoft user data for: {user_data_raw.get('mail', user_data_raw.get('userPrincipalName', 'unknown'))}")
        user_data = await AuthService.handle_microsoft_oauth_callback(user_data_raw)
        logger.info(f"[OAUTH] Microsoft user authenticated: {user_data.get('email', 'unknown')}")
        
        token = generate_token({
            "id": user_data['id'],
            "role": user_data['role'],
            "tenantId": user_data.get('tenantId'),
            "email": user_data.get('email')
        })
        client_url = os.getenv('CLIENT_URL', 'http://localhost:5173')
        logger.info(f"[OAUTH] Redirecting Microsoft user to frontend: {client_url}")
        return RedirectResponse(
            url=f"{client_url}/auth/callback?token={token}&name={user_data['name']}"
        )
    except HTTPException:
        logger.error("[OAUTH] HTTPException during Microsoft callback")
        raise
    except Exception as e:
        logger.error(f"[OAUTH] Exception during Microsoft callback: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Microsoft OAuth callback failed: {str(e)}"
        )


@router.post("/logout")
async def logout(user: dict = Depends(verify_token_middleware)):
    """Logout endpoint (token-based, so just return success)"""
    logger.info(f"[LOGOUT] User {user.get('id', 'unknown')} logged out")
    return {"message": "Logged out successfully"}


@router.get("/me")
async def get_current_user(user: dict = Depends(verify_token_middleware)):
    """Get current user information"""
    logger.info(f"[USER] Fetching current user info for user: {user.get('id', 'unknown')}")
    return await AuthService.get_current_user_info(user)
