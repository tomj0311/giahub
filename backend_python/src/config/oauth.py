import os
import logging
from typing import Optional, Dict, Any
from authlib.integrations.starlette_client import OAuth
from fastapi import HTTPException, status
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

# Ensure environment variables are loaded
load_dotenv()

# Environment variables check
GOOGLE_CLIENT_ID = os.getenv('GOOGLE_CLIENT_ID')
GOOGLE_CLIENT_SECRET = os.getenv('GOOGLE_CLIENT_SECRET')

logger.info('🔧 OAuth Config - Environment Check:')
if GOOGLE_CLIENT_ID:
    logger.info(f'- GOOGLE_CLIENT_ID: {GOOGLE_CLIENT_ID[:20]}...')
else:
    logger.error('❌ GOOGLE_CLIENT_ID is not set in environment variables')
    logger.error('Please check your .env file')

if GOOGLE_CLIENT_SECRET:
    logger.info('- GOOGLE_CLIENT_SECRET: SET')
else:
    logger.error('❌ GOOGLE_CLIENT_SECRET is not set in environment variables')
    logger.error('Please check your .env file')

# OAuth configuration
oauth = OAuth()

if GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET:
    oauth.register(
        name='google',
        client_id=GOOGLE_CLIENT_ID,
        client_secret=GOOGLE_CLIENT_SECRET,
        # Use explicit endpoints to bypass discovery which is currently failing
        authorize_url='https://accounts.google.com/o/oauth2/v2/auth',
        access_token_url='https://oauth2.googleapis.com/token',
        userinfo_endpoint='https://openidconnect.googleapis.com/v1/userinfo',
        jwks_uri='https://www.googleapis.com/oauth2/v3/certs',
        client_kwargs={
            'scope': 'openid email profile',
            'response_type': 'code'
        }
    )
    logger.info('✅ Google OAuth configured successfully')
else:
    logger.warning('⚠️ Google OAuth not configured due to missing credentials')


def get_oauth_client():
    """Get the configured OAuth client"""
    if not (GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET):
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Google OAuth not configured"
        )
    return oauth.google


async def handle_google_user_data(user_info: Dict[str, Any]) -> Dict[str, Any]:
    """Process Google user data and check if user exists in database"""
    from ..db import get_collections
    from ..utils.auth import normalize_email
    
    email = normalize_email(user_info.get('email', ''))
    name = user_info.get('name', '')
    first_name = user_info.get('given_name', '')
    last_name = user_info.get('family_name', '')
    
    print(f"🔍 Checking if Google OAuth user exists: {email}")
    
    collections = get_collections()
    
    # Try to find existing user by email
    user = await collections['users'].find_one({"email": email})
    
    if user:
        print(f"✅ Found existing user: {email} (ID: {user['id']})")
        
        # Update user with Google data if needed
        update_data = {}
        if not user.get('firstName') and first_name:
            update_data['firstName'] = first_name
        if not user.get('lastName') and last_name:
            update_data['lastName'] = last_name
        if not user.get('name') and name:
            update_data['name'] = name
        if not user.get('googleId') and user_info.get('sub'):
            update_data['googleId'] = user_info.get('sub')
        
        if update_data:
            await collections['users'].update_one(
                {"id": user['id']},
                {"$set": update_data}
            )
            print(f"📝 Updated user data for: {email}")
        
        # CRITICAL: Ensure existing Google OAuth user has tenantId and default role
        try:
            from ..services.rbac_service import RBACService
            from ..services.tenant_service import TenantService
            
            # Check if user has tenantId
            user_tenant_id = await TenantService.get_user_tenant_id(user['id'])
            if not user_tenant_id:
                print(f"⚠️ Existing user {email} has no tenantId. Creating default tenant...")
                default_tenant = await TenantService.create_default_tenant(email, user['id'])
                await collections['users'].update_one(
                    {"id": user['id']},
                    {"$set": {"tenantId": default_tenant["tenantId"]}}
                )
                user_tenant_id = default_tenant["tenantId"]
                print(f"✅ Created and assigned default tenant for existing user: {email}")
            
            # Check if user has roles
            user_roles = await RBACService.get_user_roles(user['id'])
            if not user_roles:
                print(f"⚠️ Existing user {email} has no roles. Creating default role...")
                default_role = await RBACService.create_default_user_role(
                    email, 
                    owner_id=user['id'],
                    tenant_id=user_tenant_id
                )
                await RBACService.assign_role_to_user(user['id'], default_role["roleId"])
                print(f"✅ Created and assigned default role for existing user: {email}")
            else:
                print(f"✅ Existing user {email} has {len(user_roles)} role(s)")
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"Failed to ensure default tenant/role for existing Google OAuth user {user['id']}: {e}")
        
        return {
            "id": user['id'],
            "role": "user",
            "email": email,
            "name": user.get('name', name),
            "new_user": False
        }
    
    else:
        print(f"🆕 New Google OAuth user detected: {email}")
        # No existing user found - flag as new user for role creation
        return {
            "email": email,
            "name": name,
            "firstName": first_name,
            "lastName": last_name,
            "new_user": True
        }
