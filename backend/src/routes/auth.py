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
    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    token: str
    role: str
    name: Optional[str] = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


@router.post("/login", response_model=LoginResponse)
async def login(request: LoginRequest):
    """Login endpoint for admin and users"""
    try:
        result = await AuthService.authenticate_user(request.email, request.password)
        return LoginResponse(**result)
    except Exception as e:
        logger.error(f"Login failed for {request.email}: {str(e)}")
        raise


# Google OAuth routes
@router.get("/google")
async def google_auth(request: Request):
    """Initiate Google OAuth flow"""
    try:
        oauth_client = get_oauth_client()
        client_url = os.getenv('CLIENT_URL', f"{request.url.scheme}://{request.url.netloc}")
        redirect_uri = f"{client_url}/auth/google/callback"
        
        response = await oauth_client.authorize_redirect(request, redirect_uri)
        return response
    except Exception as e:
        logger.error(f"Failed to initiate Google OAuth: {str(e)}")
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
            resp = await oauth_client.get('https://openidconnect.googleapis.com/v1/userinfo', token=token)
            user_info = resp.json()
        
        if not user_info:
            logger.error("Failed to get user information from Google")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to get user information from Google"
            )
        
        google_tokens = {
            'access_token': token.get('access_token'),
            'refresh_token': token.get('refresh_token'),
            'expires_at': token.get('expires_at'),
            'token_type': token.get('token_type', 'Bearer')
        }
        
        user_data = await AuthService.handle_google_oauth_callback(user_info, google_tokens)
        
        if user_data.get('new_user', False):
            await AuthService._ensure_user_has_default_role(
                user_data['id'],
                user_data['email'],
                tenant_id=user_data.get('tenantId')
            )
        
        auth_token = generate_token({
            "id": user_data['id'],
            "role": user_data['role'],
            "tenantId": user_data.get('tenantId'),
            "email": user_data.get('email')
        })
        redirect_url = os.getenv('REDIRECT_URL', 'http://localhost:5173')
        from urllib.parse import quote
        return RedirectResponse(
            url=f"{redirect_url}/auth/callback?token={auth_token}&name={quote(user_data['name'])}&email={quote(user_data.get('email', ''))}"
        )
    except HTTPException as http_exc:
        logger.error(f"HTTPException in Google callback: {http_exc.detail}")
        redirect_url = os.getenv('REDIRECT_URL', 'http://localhost:5173')
        from urllib.parse import quote
        return RedirectResponse(url=f"{redirect_url}/login?error={quote(str(http_exc.detail))}")
    except Exception as e:
        logger.error(f"Exception during callback: {str(e)}")
        if "mismatching_state" in str(e).lower() or "csrf" in str(e).lower():
            try:
                import httpx
                code = request.query_params.get('code')
                if code:
                    client_url = os.getenv('CLIENT_URL', f"{request.url.scheme}://{request.url.netloc}")
                    redirect_uri = f"{client_url}/auth/google/callback"
                    
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
                            user_response = await client.get(
                                'https://openidconnect.googleapis.com/v1/userinfo',
                                headers={'Authorization': f"Bearer {token_json['access_token']}"}
                            )
                            user_info = user_response.json()
                            
                            google_tokens = {
                                'access_token': token_json.get('access_token'),
                                'refresh_token': token_json.get('refresh_token'),
                                'expires_at': token_json.get('expires_in'),
                                'token_type': token_json.get('token_type', 'Bearer')
                            }
                            
                            user_data = await AuthService.handle_google_oauth_callback(user_info, google_tokens)
                            
                            auth_token = generate_token({
                                "id": user_data['id'],
                                "role": user_data['role'],
                                "tenantId": user_data.get('tenantId'),
                                "email": user_data.get('email')
                            })
                            redirect_url = os.getenv('REDIRECT_URL', 'http://localhost:5173')
                            from urllib.parse import quote
                            return RedirectResponse(
                                url=f"{redirect_url}/auth/callback?token={auth_token}&name={quote(user_data['name'])}&email={quote(user_data.get('email', ''))}"
                            )
            except HTTPException as http_exc:
                logger.error(f"HTTPException during manual token exchange: {http_exc.detail}")
                redirect_url = os.getenv('REDIRECT_URL', 'http://localhost:5173')
                from urllib.parse import quote
                error_msg = quote(str(http_exc.detail))
                return RedirectResponse(url=f"{redirect_url}/login?error={error_msg}")
            except Exception as fallback_error:
                logger.error(f"Manual token exchange failed: {str(fallback_error)}")
        
        redirect_url = os.getenv('REDIRECT_URL', 'http://localhost:5173')
        from urllib.parse import quote
        error_msg = quote("Authentication failed. Please try again.")
        return RedirectResponse(url=f"{redirect_url}/login?error={error_msg}")


# Microsoft OAuth routes
@router.get("/microsoft")
async def microsoft_auth(request: Request):
    """Initiate Microsoft OAuth flow"""
    try:
        oauth_client = get_microsoft_oauth_client()
        client_url = os.getenv('CLIENT_URL', f"{request.url.scheme}://{request.url.netloc}")
        redirect_uri = f"{client_url}/auth/microsoft/callback"
        response = await oauth_client.authorize_redirect(request, redirect_uri)
        return response
    except Exception as e:
        logger.error(f"Failed to initiate Microsoft OAuth: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Microsoft OAuth initialization failed: {str(e)}"
        )


@router.get("/microsoft/callback")
async def microsoft_callback(request: Request):
    """Handle Microsoft OAuth callback"""
    try:
        oauth_client = get_microsoft_oauth_client()
        token = await oauth_client.authorize_access_token(request)
        
        user_info = await oauth_client.get('https://graph.microsoft.com/v1.0/me', token=token)
        user_data_raw = user_info.json()
        
        if not user_data_raw:
            logger.error("Failed to get user information from Microsoft")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to get user information from Microsoft"
            )
        
        user_data = await AuthService.handle_microsoft_oauth_callback(user_data_raw)
        
        if user_data.get('new_user', False):
            await AuthService._ensure_user_has_default_role(
                user_data['id'],
                user_data['email'],
                tenant_id=user_data.get('tenantId')
            )
        
        token = generate_token({
            "id": user_data['id'],
            "role": user_data['role'],
            "tenantId": user_data.get('tenantId'),
            "email": user_data.get('email')
        })
        redirect_url = os.getenv('REDIRECT_URL', 'http://localhost:5173')
        from urllib.parse import quote
        return RedirectResponse(
            url=f"{redirect_url}/auth/callback?token={token}&name={quote(user_data['name'])}&email={quote(user_data.get('email', ''))}"
        )
    except HTTPException as http_exc:
        logger.error(f"HTTPException during Microsoft callback: {http_exc.detail}")
        redirect_url = os.getenv('REDIRECT_URL', 'http://localhost:5173')
        from urllib.parse import quote
        error_msg = quote(str(http_exc.detail))
        return RedirectResponse(url=f"{redirect_url}/login?error={error_msg}")
    except Exception as e:
        logger.error(f"Exception during Microsoft callback: {str(e)}")
        redirect_url = os.getenv('REDIRECT_URL', 'http://localhost:5173')
        from urllib.parse import quote
        error_msg = quote("Authentication failed. Please try again.")
        return RedirectResponse(url=f"{redirect_url}/login?error={error_msg}")


@router.post("/change-password")
async def change_password(
    request: ChangePasswordRequest,
    user: dict = Depends(verify_token_middleware)
):
    """Change user password (requires authentication)"""
    try:
        await AuthService.change_password(
            user_id=user.get('id'),
            current_password=request.current_password,
            new_password=request.new_password,
            tenant_id=user.get('tenantId')
        )
        return {"message": "Password changed successfully"}
    except Exception as e:
        logger.error(f"Failed to change password for user {user.get('id')}: {str(e)}")
        raise


@router.post("/logout")
async def logout(user: dict = Depends(verify_token_middleware)):
    """Logout endpoint (token-based, so just return success)"""
    return {"message": "Logged out successfully"}


@router.get("/me")
async def get_current_user(user: dict = Depends(verify_token_middleware)):
    """Get current user information"""
    return await AuthService.get_current_user_info(user)
