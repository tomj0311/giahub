#!/usr/bin/env python3
"""
Script to create a dummy user in MongoDB and test all API endpoints with curl commands
"""

import asyncio
import sys
import os
import uuid
from datetime import datetime
import requests
import json

# Add the backend path to sys.path
sys.path.insert(0, '/home/tom/Desktop/giahub/backend_python')

from src.db import get_collections, init_database
from src.utils.auth import hash_password, generate_token
from src.services.tenant_service import TenantService
from src.services.rbac_service import RBACService

# Dummy user data
DUMMY_USER_EMAIL = "test@example.com"
DUMMY_USER_PASSWORD = "testpassword123"
DUMMY_USER_NAME = "Test User"
API_BASE_URL = "http://localhost:4000"

async def create_dummy_user():
    """Create a dummy user in the database"""
    print("🔄 Initializing database connection...")
    await init_database()
    
    collections = get_collections()
    
    # Check if user already exists
    existing_user = await collections['users'].find_one({"email": DUMMY_USER_EMAIL})
    if existing_user:
        print(f"✅ User {DUMMY_USER_EMAIL} already exists with ID: {existing_user['id']}")
        return existing_user['id']
    
    # Create new user
    user_id = str(uuid.uuid4())
    hashed_password = hash_password(DUMMY_USER_PASSWORD)
    
    print(f"🔄 Creating dummy user: {DUMMY_USER_EMAIL}")
    
    # Create default tenant for the user
    print("🔄 Creating default tenant...")
    default_tenant = await TenantService.create_default_tenant(DUMMY_USER_EMAIL, user_id)
    tenant_id = default_tenant["tenantId"]
    
    # Create user document
    user_data = {
        "id": user_id,
        "role": "user",
        "active": True,
        "password": hashed_password,
        "createdAt": datetime.utcnow().timestamp() * 1000,
        "firstName": "Test",
        "lastName": "User",
        "name": DUMMY_USER_NAME,
        "email": DUMMY_USER_EMAIL,
        "emailOriginal": DUMMY_USER_EMAIL,
        "isInvited": False,
        "tenantId": tenant_id
    }
    
    await collections['users'].insert_one(user_data)
    print(f"✅ User created with ID: {user_id}")
    
    # Create default role for the user
    print("🔄 Creating default role...")
    default_role = await RBACService.create_default_user_role(
        DUMMY_USER_EMAIL, 
        owner_id=user_id,
        tenant_id=tenant_id
    )
    await RBACService.assign_role_to_user(user_id, default_role["roleId"])
    print(f"✅ Default role created and assigned: {default_role['roleId']}")
    
    return user_id

def get_user_token():
    """Get authentication token for the dummy user"""
    print(f"🔄 Getting token for user: {DUMMY_USER_EMAIL}")
    
    login_data = {
        "username": DUMMY_USER_EMAIL,
        "password": DUMMY_USER_PASSWORD
    }
    
    try:
        response = requests.post(f"{API_BASE_URL}/login", json=login_data)
        if response.status_code == 200:
            token = response.json()["token"]
            print(f"✅ Token obtained: {token[:50]}...")
            return token
        else:
            print(f"❌ Failed to get token: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print(f"❌ Error getting token: {e}")
        return None

def get_admin_token():
    """Get admin token"""
    print("🔄 Getting admin token...")
    
    login_data = {
        "username": "admin",
        "password": "123"
    }
    
    try:
        response = requests.post(f"{API_BASE_URL}/login", json=login_data)
        if response.status_code == 200:
            token = response.json()["token"]
            print(f"✅ Admin token obtained: {token[:50]}...")
            return token
        else:
            print(f"❌ Failed to get admin token: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print(f"❌ Error getting admin token: {e}")
        return None

def test_endpoints(user_token, admin_token):
    """Test all API endpoints with curl commands"""
    print("\n" + "="*60)
    print("🧪 TESTING API ENDPOINTS")
    print("="*60)
    
    # Headers
    user_headers = {"Authorization": f"Bearer {user_token}"}
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    
    # Test cases
    test_cases = [
        {
            "name": "Health Check",
            "method": "GET",
            "endpoint": "/health",
            "headers": {},
            "curl": f"curl -X GET {API_BASE_URL}/health"
        },
        {
            "name": "Root Endpoint",
            "method": "GET", 
            "endpoint": "/",
            "headers": {},
            "curl": f"curl -X GET {API_BASE_URL}/"
        },
        {
            "name": "User Profile",
            "method": "GET",
            "endpoint": "/profile",
            "headers": user_headers,
            "curl": f"curl -X GET {API_BASE_URL}/profile -H 'Authorization: Bearer {user_token}'"
        },
        {
            "name": "Get Users (Admin)",
            "method": "GET",
            "endpoint": "/api/users",
            "headers": admin_headers,
            "curl": f"curl -X GET {API_BASE_URL}/api/users -H 'Authorization: Bearer {admin_token}'"
        },
        {
            "name": "Get Roles",
            "method": "GET",
            "endpoint": "/roles",
            "headers": user_headers,
            "curl": f"curl -X GET {API_BASE_URL}/roles -H 'Authorization: Bearer {user_token}'"
        },
        {
            "name": "Get Menu Items",
            "method": "GET",
            "endpoint": "/menu",
            "headers": user_headers,
            "curl": f"curl -X GET {API_BASE_URL}/menu -H 'Authorization: Bearer {user_token}'"
        },
        {
            "name": "Discovery",
            "method": "GET",
            "endpoint": "/discovery",
            "headers": user_headers,
            "curl": f"curl -X GET {API_BASE_URL}/discovery -H 'Authorization: Bearer {user_token}'"
        },
        {
            "name": "Model Configs",
            "method": "GET",
            "endpoint": "/model-configs",
            "headers": user_headers,
            "curl": f"curl -X GET {API_BASE_URL}/model-configs -H 'Authorization: Bearer {user_token}'"
        },
        {
            "name": "Tool Configs",
            "method": "GET",
            "endpoint": "/tool-configs",
            "headers": user_headers,
            "curl": f"curl -X GET {API_BASE_URL}/tool-configs -H 'Authorization: Bearer {user_token}'"
        },
        {
            "name": "Knowledge Base",
            "method": "GET",
            "endpoint": "/knowledge",
            "headers": user_headers,
            "curl": f"curl -X GET {API_BASE_URL}/knowledge -H 'Authorization: Bearer {user_token}'"
        },
        {
            "name": "Agents",
            "method": "GET",
            "endpoint": "/agents",
            "headers": user_headers,
            "curl": f"curl -X GET {API_BASE_URL}/agents -H 'Authorization: Bearer {user_token}'"
        }
    ]
    
    successful_tests = 0
    total_tests = len(test_cases)
    
    for i, test in enumerate(test_cases, 1):
        print(f"\n[{i}/{total_tests}] Testing: {test['name']}")
        print(f"Endpoint: {test['endpoint']}")
        print(f"Curl command: {test['curl']}")
        
        try:
            if test['method'] == 'GET':
                response = requests.get(f"{API_BASE_URL}{test['endpoint']}", headers=test['headers'])
            elif test['method'] == 'POST':
                response = requests.post(f"{API_BASE_URL}{test['endpoint']}", headers=test['headers'])
            
            if 200 <= response.status_code < 300:
                print(f"✅ SUCCESS ({response.status_code})")
                if response.headers.get('content-type', '').startswith('application/json'):
                    try:
                        data = response.json()
                        if isinstance(data, list):
                            print(f"   Response: List with {len(data)} items")
                        elif isinstance(data, dict):
                            print(f"   Response: {list(data.keys())}")
                        else:
                            print(f"   Response: {str(data)[:100]}...")
                    except:
                        print(f"   Response: {response.text[:100]}...")
                else:
                    print(f"   Response: {response.text[:100]}...")
                successful_tests += 1
            else:
                print(f"❌ FAILED ({response.status_code}): {response.text[:200]}")
                
        except Exception as e:
            print(f"❌ ERROR: {e}")
    
    print(f"\n" + "="*60)
    print(f"🏁 TEST SUMMARY: {successful_tests}/{total_tests} tests passed")
    print("="*60)
    
    return successful_tests, total_tests

async def main():
    """Main function"""
    print("🚀 GIA Platform API Test Script")
    print("="*60)
    
    try:
        # Create dummy user
        user_id = await create_dummy_user()
        
        # Get tokens
        user_token = get_user_token()
        admin_token = get_admin_token()
        
        if not user_token:
            print("❌ Could not get user token, aborting tests")
            return
            
        if not admin_token:
            print("⚠️ Could not get admin token, will skip admin-only tests")
        
        # Test endpoints
        successful, total = test_endpoints(user_token, admin_token)
        
        print(f"\n✅ Script completed. User ID: {user_id}")
        print(f"📧 Email: {DUMMY_USER_EMAIL}")
        print(f"🔐 Password: {DUMMY_USER_PASSWORD}")
        print(f"🎯 API Tests: {successful}/{total} passed")
        
    except Exception as e:
        print(f"❌ Script failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())
