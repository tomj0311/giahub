#!/usr/bin/env python3
"""
Test script to verify Google OAuth role creation works properly
"""

import asyncio
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from src.db import connect_db, get_collections
from src.config.oauth import handle_google_user_data
from src.services.rbac_service import RBACService


async def test_new_oauth_user():
    """Test creating a new OAuth user and ensuring roles are created"""
    await connect_db()
    collections = get_collections()
    
    # Simulate a new Google OAuth user
    test_user_info = {
        'email': 'test.oauth.user@gmail.com',
        'name': 'Test OAuth User',
        'given_name': 'Test',
        'family_name': 'User',
        'sub': '999888777666555444'
    }
    
    print("🧪 Testing new Google OAuth user flow...")
    
    try:
        # Clean up any existing test user first
        await collections['users'].delete_many({"email": test_user_info['email']})
        await collections['roles'].delete_many({"ownerId": {"$regex": ".*test.*"}})
        await collections['userRoles'].delete_many({"userId": {"$regex": ".*test.*"}})
        
        # Process OAuth user data
        result = await handle_google_user_data(test_user_info)
        print(f"✅ OAuth processing result: {result}")
        
        if result.get('new_user'):
            print("   📝 User marked as new - role creation will happen in auth.py")
        else:
            print("   👤 Existing user - role check performed")
            
            # Check if roles exist
            user_roles = await RBACService.get_user_roles(result['id'])
            print(f"   🔐 User has {len(user_roles)} roles:")
            for role in user_roles:
                print(f"      - {role.get('roleName', 'Unknown')}")
        
        # Clean up test data
        if result.get('new_user'):
            print("   🧹 Cleaning up test data (new user not actually created)")
        else:
            await collections['users'].delete_many({"email": test_user_info['email']})
            if 'id' in result:
                await collections['roles'].delete_many({"ownerId": result['id']})
                await collections['userRoles'].delete_many({"userId": result['id']})
            print("   🧹 Cleaned up test data")
        
    except Exception as e:
        print(f"❌ Test failed: {e}")
        import traceback
        traceback.print_exc()


async def test_existing_oauth_user():
    """Test existing OAuth user to ensure roles are checked/created"""
    await connect_db()
    
    # Use the existing user
    test_user_info = {
        'email': 'hub8ai@gmail.com',
        'name': 'hub8 ai',
        'given_name': 'hub8',
        'family_name': 'ai',
        'sub': '108494383231424289319'
    }
    
    print("🧪 Testing existing Google OAuth user flow...")
    
    try:
        result = await handle_google_user_data(test_user_info)
        print(f"✅ OAuth processing result: {result}")
        
        # Check roles
        user_roles = await RBACService.get_user_roles(result['id'])
        print(f"   🔐 User has {len(user_roles)} roles:")
        for role in user_roles:
            print(f"      - {role.get('roleName', 'Unknown')}")
            
    except Exception as e:
        print(f"❌ Test failed: {e}")
        import traceback
        traceback.print_exc()


async def main():
    print("🚀 Testing Google OAuth role creation system\n")
    
    await test_existing_oauth_user()
    print()
    await test_new_oauth_user()
    
    print("\n✅ All tests completed!")


if __name__ == "__main__":
    asyncio.run(main())
