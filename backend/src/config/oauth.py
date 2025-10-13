import os
from typing import Optional, Dict, Any
from authlib.integrations.starlette_client import OAuth
from fastapi import HTTPException, status
from dotenv import load_dotenv

from ..utils.log import logger
from ..utils.mongo_storage import MongoStorageService

# Ensure environment variables are loaded
load_dotenv()

# Environment variables check
GOOGLE_CLIENT_ID = os.getenv('GOOGLE_CLIENT_ID')
GOOGLE_CLIENT_SECRET = os.getenv('GOOGLE_CLIENT_SECRET')
MICROSOFT_CLIENT_ID = os.getenv('MICROSOFT_CLIENT_ID')
MICROSOFT_CLIENT_SECRET = os.getenv('MICROSOFT_CLIENT_SECRET')

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

if MICROSOFT_CLIENT_ID:
    logger.info(f'- MICROSOFT_CLIENT_ID: {MICROSOFT_CLIENT_ID[:20]}...')
else:
    logger.warning('⚠️ MICROSOFT_CLIENT_ID is not set in environment variables')

if MICROSOFT_CLIENT_SECRET:
    logger.info('- MICROSOFT_CLIENT_SECRET: SET')
else:
    logger.warning('⚠️ MICROSOFT_CLIENT_SECRET is not set in environment variables')

# OAuth configuration
logger.debug("[OAUTH] Initializing OAuth configuration")
oauth = OAuth()

if GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET:
    logger.debug("[OAUTH] Registering Google OAuth provider")
    oauth.register(
        name='google',
        client_id=GOOGLE_CLIENT_ID,
        client_secret=GOOGLE_CLIENT_SECRET,
        authorize_url='https://accounts.google.com/o/oauth2/v2/auth',
        access_token_url='https://oauth2.googleapis.com/token',
        userinfo_endpoint='https://openidconnect.googleapis.com/v1/userinfo',
        jwks_uri='https://www.googleapis.com/oauth2/v3/certs',
        client_kwargs={
            'scope': 'openid email profile '
                     'https://www.googleapis.com/auth/gmail.readonly '
                     'https://www.googleapis.com/auth/gmail.send '
                     'https://www.googleapis.com/auth/gmail.modify '
                     'https://www.googleapis.com/auth/drive.readonly '
                     'https://www.googleapis.com/auth/drive.file',
            'access_type': 'offline',  # Request refresh token
            'prompt': 'consent'  # Force consent screen to get refresh token
        }
    )
    logger.info('✅ Google OAuth configured successfully')
else:
    logger.warning('⚠️ Google OAuth not configured due to missing credentials')

if MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET:
    oauth.register(
        name='microsoft',
        client_id=MICROSOFT_CLIENT_ID,
        client_secret=MICROSOFT_CLIENT_SECRET,
        authorize_url='https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
        access_token_url='https://login.microsoftonline.com/common/oauth2/v2.0/token',
        userinfo_endpoint='https://graph.microsoft.com/v1.0/me',
        client_kwargs={
            'scope': 'openid email profile User.Read',
            'response_type': 'code'
        }
    )
    logger.info('✅ Microsoft OAuth configured successfully')
else:
    logger.warning('⚠️ Microsoft OAuth not configured due to missing credentials')


def get_oauth_client():
    """Get the configured OAuth client"""
    if not (GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET):
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Google OAuth not configured"
        )
    return oauth.google


def get_microsoft_oauth_client():
    """Get the configured Microsoft OAuth client"""
    if not (MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET):
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Microsoft OAuth not configured"
        )
    return oauth.microsoft


async def handle_google_user_data(user_info: Dict[str, Any]) -> Dict[str, Any]:
    """Process Google user data and check if user exists in database"""
    from ..utils.auth import normalize_email
    
    email = normalize_email(user_info.get('email', ''))
    name = user_info.get('name', '')
    first_name = user_info.get('given_name', '')
    last_name = user_info.get('family_name', '')
    
    print(f"🔍 Checking if Google OAuth user exists: {email}")
    
    # Try to find existing user by email
    user = await MongoStorageService.find_one("users", {"email": email})
    
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
            from datetime import datetime
            current_time = datetime.utcnow()
            update_data['updated_at'] = current_time
            update_data['updatedAt'] = current_time.timestamp() * 1000  # Timestamp in milliseconds
            
            await MongoStorageService.update_one(
                "users",
                {"id": user['id']},
                update_data
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
                
                from datetime import datetime
                current_time = datetime.utcnow()
                await MongoStorageService.update_one(
                    "users",
                    {"id": user['id']},
                    {
                        "tenantId": default_tenant["tenantId"],
                        "updated_at": current_time,
                        "updatedAt": current_time.timestamp() * 1000
                    }
                )
                user_tenant_id = default_tenant["tenantId"]
                print(f"✅ Created and assigned default tenant for existing user: {email}")
            
            # Check if user has roles (REMOVED - roles now created after authentication)
            # Note: Role creation moved to after successful authentication
            user_roles = await RBACService.get_user_roles(user['id'])
            if not user_roles:
                print(f"⚠️ Existing user {email} has no roles. DEFAULT role will be created after authentication.")
            else:
                print(f"✅ Existing user {email} has {len(user_roles)} role(s)")
        except Exception as e:
            logger.error(f"[OAUTH] Failed to ensure default tenant/role for existing Google OAuth user {user['id']}: {e}")
        
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


async def handle_microsoft_user_data(user_info: Dict[str, Any]) -> Dict[str, Any]:
    """Process Microsoft user data and check if user exists in database"""
    from ..utils.auth import normalize_email
    
    email = normalize_email(user_info.get('mail', user_info.get('userPrincipalName', '')))
    name = user_info.get('displayName', '')
    first_name = user_info.get('givenName', '')
    last_name = user_info.get('surname', '')
    
    print(f"🔍 Checking if Microsoft OAuth user exists: {email}")
    
    # Try to find existing user by email
    user = await MongoStorageService.find_one("users", {"email": email})
    
    if user:
        print(f"✅ Found existing user: {email} (ID: {user['id']})")
        
        # Update user with Microsoft data if needed
        update_data = {}
        if not user.get('firstName') and first_name:
            update_data['firstName'] = first_name
        if not user.get('lastName') and last_name:
            update_data['lastName'] = last_name
        if not user.get('name') and name:
            update_data['name'] = name
        if not user.get('microsoftId') and user_info.get('id'):
            update_data['microsoftId'] = user_info.get('id')
        
        if update_data:
            from datetime import datetime
            current_time = datetime.utcnow()
            update_data['updated_at'] = current_time
            update_data['updatedAt'] = current_time.timestamp() * 1000  # Timestamp in milliseconds
            
            await MongoStorageService.update_one(
                "users",
                {"id": user['id']},
                update_data
            )
            print(f"📝 Updated user data for: {email}")
        
        # CRITICAL: Ensure existing Microsoft OAuth user has tenantId and default role
        try:
            from ..services.rbac_service import RBACService
            from ..services.tenant_service import TenantService
            
            # Check if user has tenantId
            user_tenant_id = await TenantService.get_user_tenant_id(user['id'])
            if not user_tenant_id:
                print(f"⚠️ Existing user {email} has no tenantId. Creating default tenant...")
                default_tenant = await TenantService.create_default_tenant(email, user['id'])
                
                from datetime import datetime
                current_time = datetime.utcnow()
                await MongoStorageService.update_one(
                    "users",
                    {"id": user['id']},
                    {
                        "tenantId": default_tenant["tenantId"],
                        "updated_at": current_time,
                        "updatedAt": current_time.timestamp() * 1000
                    }
                )
                user_tenant_id = default_tenant["tenantId"]
                print(f"✅ Created and assigned default tenant for existing user: {email}")
            
            # Check if user has roles (REMOVED - roles now created after authentication)
            # Note: Role creation moved to after successful authentication
            user_roles = await RBACService.get_user_roles(user['id'])
            if not user_roles:
                print(f"⚠️ Existing user {email} has no roles. DEFAULT role will be created after authentication.")
            else:
                print(f"✅ Existing user {email} has {len(user_roles)} role(s)")
        except Exception as e:
            logger.error(f"[OAUTH] Failed to ensure default tenant/role for existing Microsoft OAuth user {user['id']}: {e}")
        
        return {
            "id": user['id'],
            "role": "user",
            "email": email,
            "name": user.get('name', name),
            "new_user": False
        }
    
    else:
        print(f"🆕 New Microsoft OAuth user detected: {email}")
        # No existing user found - flag as new user for role creation
        return {
            "email": email,
            "name": name,
            "firstName": first_name,
            "lastName": last_name,
            "new_user": True
        }
