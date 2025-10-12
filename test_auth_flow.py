#!/usr/bin/env python3
"""
Test script to verify OAuth authentication flow and DEFAULT role creation.
This script simulates the OAuth authentication process to ensure roles are created 
only after successful authentication.
"""

import asyncio
import sys
import os

# Add the backend src to the path so we can import modules
sys.path.append('/home/tom/giahub/backend/src')

from services.auth_service import AuthService
from services.rbac_service import RBACService
from utils.mongo_storage import MongoStorageService
from datetime import datetime

async def test_oauth_flow():
    """Test the OAuth authentication flow to verify role creation timing."""
    print("🧪 Testing OAuth Authentication Flow and Role Creation Timing")
    print("=" * 60)
    
    test_email = "test_oauth_user@example.com"
    test_user_info = {
        'email': test_email,
        'given_name': 'Test',
        'family_name': 'User',
        'sub': 'test_google_id_123'
    }
    
    try:
        # Step 1: Simulate new OAuth user registration (should NOT create roles)
        print(f"📝 Step 1: Simulating OAuth user registration for {test_email}")
        print("   This should create user and tenant but NO roles...")
        
        # Clean up any existing test data first
        await MongoStorageService.delete_one("users", {"email": test_email})
        
        # Check if roles exist before authentication (should be none)
        print(f"🔍 Checking for roles before authentication...")
        
        # Simulate the OAuth callback (this should NOT create roles now)
        user_data = await AuthService.handle_google_oauth_callback(test_user_info)
        print(f"✅ OAuth callback completed. User ID: {user_data['id']}")
        print(f"   New user: {user_data.get('new_user', False)}")
        
        # Step 2: Check if any roles were created during registration (should be NONE)
        print(f"🔍 Step 2: Checking roles after registration...")
        user_roles_before = await RBACService.get_user_roles(user_data['id'], tenant_id=user_data.get('tenantId'))
        print(f"   Roles after registration: {len(user_roles_before)} (should be 0)")
        
        if len(user_roles_before) > 0:
            print("❌ ERROR: Roles were created during registration! This is the bug we're fixing.")
            for role in user_roles_before:
                print(f"   - Role: {role.get('roleName', 'Unknown')}")
        else:
            print("✅ GOOD: No roles created during registration")
        
        # Step 3: Simulate successful authentication (this SHOULD create DEFAULT role)
        print(f"🔐 Step 3: Simulating successful authentication...")
        if user_data.get('new_user', False):
            await AuthService._ensure_user_has_default_role(
                user_data['id'],
                user_data['email'],
                tenant_id=user_data.get('tenantId')
            )
            print("✅ DEFAULT role creation triggered after authentication")
        
        # Step 4: Verify DEFAULT role was created after authentication
        print(f"🔍 Step 4: Checking roles after authentication...")
        user_roles_after = await RBACService.get_user_roles(user_data['id'], tenant_id=user_data.get('tenantId'))
        print(f"   Roles after authentication: {len(user_roles_after)}")
        
        default_role_found = False
        for role in user_roles_after:
            role_name = role.get('roleName', 'Unknown')
            print(f"   - Role: {role_name}")
            if role_name == 'DEFAULT':
                default_role_found = True
        
        if default_role_found:
            print("✅ SUCCESS: DEFAULT role was created after authentication!")
        else:
            print("❌ ERROR: DEFAULT role was not created after authentication")
        
        # Step 5: Test existing user login (should not create duplicate roles)
        print(f"🔄 Step 5: Testing existing user authentication...")
        user_data_existing = await AuthService.handle_google_oauth_callback(test_user_info)
        
        user_roles_existing = await RBACService.get_user_roles(user_data_existing['id'], tenant_id=user_data_existing.get('tenantId'))
        print(f"   Roles for existing user: {len(user_roles_existing)} (should still be 1)")
        
        if len(user_roles_existing) == len(user_roles_after):
            print("✅ SUCCESS: No duplicate roles created for existing user")
        else:
            print("❌ ERROR: Duplicate roles created for existing user")
        
        print("\n" + "=" * 60)
        print("🎯 TEST SUMMARY:")
        print(f"   Roles before authentication: {len(user_roles_before)}")
        print(f"   Roles after authentication: {len(user_roles_after)}")
        print(f"   DEFAULT role created: {'Yes' if default_role_found else 'No'}")
        print(f"   Duplicate prevention: {'Yes' if len(user_roles_existing) == len(user_roles_after) else 'No'}")
        
        if len(user_roles_before) == 0 and default_role_found and len(user_roles_existing) == len(user_roles_after):
            print("🎉 ALL TESTS PASSED: Role creation properly happens after authentication!")
        else:
            print("⚠️  SOME TESTS FAILED: Review the issues above")
        
        # Clean up test data
        print(f"🧹 Cleaning up test data...")
        await MongoStorageService.delete_one("users", {"email": test_email})
        await MongoStorageService.delete_many("tenants", {"ownerEmail": test_email})
        await MongoStorageService.delete_many("roles", {"ownerId": user_data['id']})
        print("✅ Test data cleaned up")
        
    except Exception as e:
        print(f"❌ Test failed with error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    print("Starting OAuth Authentication Flow Test...")
    asyncio.run(test_oauth_flow())