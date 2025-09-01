#!/usr/bin/env python3
"""
Utility script to fix users who are missing default roles.
This can happen if users were created before the RBAC system was fully implemented.
"""

import asyncio
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from src.db import connect_db, get_collections
from src.services.rbac_service import RBACService


async def fix_missing_roles():
    """Find users without roles and create default roles for them"""
    await connect_db()
    collections = get_collections()
    
    print("🔍 Checking for users missing default roles...")
    
    # Get all users
    users = []
    async for user in collections['users'].find({}):
        users.append(user)
    
    print(f"Found {len(users)} users to check")
    
    fixed_count = 0
    
    for user in users:
        user_id = user.get('id')
        email = user.get('email')
        
        if not user_id or not email:
            print(f"⚠️  Skipping user with missing ID or email: {user}")
            continue
        
        # Check if user has roles
        user_roles = await RBACService.get_user_roles(user_id)
        
        if not user_roles:
            print(f"🔧 Fixing user: {email} (ID: {user_id})")
            
            try:
                # Create default role
                default_role = await RBACService.create_default_user_role(email, owner_id=user_id)
                print(f"   ✅ Created role: {default_role['roleName']}")
                
                # Assign role to user
                assignment = await RBACService.assign_role_to_user(user_id, default_role["roleId"])
                print(f"   ✅ Assigned role to user")
                
                fixed_count += 1
                
            except Exception as e:
                print(f"   ❌ Failed to fix user {email}: {e}")
        else:
            print(f"✅ User {email} already has {len(user_roles)} role(s)")
    
    print(f"\n🎉 Fixed {fixed_count} users missing roles")


if __name__ == "__main__":
    asyncio.run(fix_missing_roles())
