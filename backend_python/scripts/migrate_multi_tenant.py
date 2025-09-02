"""
Multi-Tenant Migration Script

This script migrates existing data to support multi-tenancy.
It assigns tenant_id to existing users, roles, and other records.
"""

import asyncio
import uuid
from datetime import datetime

from src.db import connect_db, get_collections
from src.services.tenant_service import TenantService
from src.services.rbac_service import RBACService


async def migrate_to_multi_tenant():
    """Migrate existing data to support multi-tenancy"""
    
    print("🚀 Starting multi-tenant migration...")
    
    # Connect to database
    await connect_db()
    collections = get_collections()
    
    # Step 1: Find users without tenant_id
    users_without_tenant = await collections['users'].find({"tenantId": {"$exists": False}}).to_list(None)
    print(f"📊 Found {len(users_without_tenant)} users without tenant_id")
    
    for user in users_without_tenant:
        user_id = user.get('id')
        user_email = user.get('email')
        
        if not user_id or not user_email:
            print(f"⚠️  Skipping user with missing id or email: {user}")
            continue
        
        try:
            # Create default tenant for user
            print(f"🏢 Creating tenant for user: {user_email}")
            tenant = await TenantService.create_default_tenant(user_email, user_id)
            
            # Update user with tenant_id
            await collections['users'].update_one(
                {"id": user_id},
                {"$set": {"tenantId": tenant["tenantId"]}}
            )
            
            # Update user's roles with tenant_id
            user_roles = await collections['roles'].find({"ownerId": user_id}).to_list(None)
            for role in user_roles:
                await collections['roles'].update_one(
                    {"roleId": role.get("roleId") or role.get("role_id")},
                    {"$set": {"tenantId": tenant["tenantId"]}}
                )
            
            # Update user's role assignments with tenant_id
            assignments = await collections['userRoles'].find({"userId": user_id}).to_list(None)
            for assignment in assignments:
                await collections['userRoles'].update_one(
                    {"_id": assignment["_id"]},
                    {"$set": {"tenantId": tenant["tenantId"]}}
                )
            
            print(f"✅ Migrated user {user_email} to tenant {tenant['tenantId']}")
            
        except Exception as e:
            print(f"❌ Failed to migrate user {user_email}: {e}")
    
    # Step 2: Update roles without tenant_id (system roles)
    roles_without_tenant = await collections['roles'].find({"tenantId": {"$exists": False}}).to_list(None)
    print(f"📊 Found {len(roles_without_tenant)} roles without tenant_id")
    
    for role in roles_without_tenant:
        role_id = role.get("roleId") or role.get("role_id")
        role_name = role.get("roleName") or role.get("name")
        owner_id = role.get("ownerId")
        
        if not role_id:
            continue
        
        try:
            # If role has an owner, assign to owner's tenant
            if owner_id:
                user_tenant = await TenantService.get_user_tenant_id(owner_id)
                if user_tenant:
                    await collections['roles'].update_one(
                        {"$or": [{"roleId": role_id}, {"role_id": role_id}]},
                        {"$set": {"tenantId": user_tenant}}
                    )
                    print(f"✅ Updated role {role_name} with tenant {user_tenant}")
            else:
                # System role - assign to system tenant
                await collections['roles'].update_one(
                    {"$or": [{"roleId": role_id}, {"role_id": role_id}]},
                    {"$set": {"tenantId": "system"}}
                )
                print(f"✅ Updated system role {role_name}")
                
        except Exception as e:
            print(f"❌ Failed to update role {role_name}: {e}")
    
    # Step 3: Update role assignments without tenant_id
    assignments_without_tenant = await collections['userRoles'].find({"tenantId": {"$exists": False}}).to_list(None)
    print(f"📊 Found {len(assignments_without_tenant)} role assignments without tenant_id")
    
    for assignment in assignments_without_tenant:
        user_id = assignment.get("userId") or assignment.get("user_id")
        role_id = assignment.get("roleId") or assignment.get("role_id")
        
        if not user_id or not role_id:
            continue
        
        try:
            # Get user's tenant
            user_tenant = await TenantService.get_user_tenant_id(user_id)
            if user_tenant:
                await collections['userRoles'].update_one(
                    {"_id": assignment["_id"]},
                    {"$set": {"tenantId": user_tenant}}
                )
                print(f"✅ Updated role assignment for user {user_id}")
                
        except Exception as e:
            print(f"❌ Failed to update role assignment: {e}")
    
    # Step 4: Update other collections (menuItems, modelconfigs, tool_config)
    other_collections = ['menuItems', 'modelconfigs', 'tool_config']
    
    for collection_name in other_collections:
        if collection_name in collections:
            collection = collections[collection_name]
            records_without_tenant = await collection.find({"tenantId": {"$exists": False}}).to_list(None)
            print(f"📊 Found {len(records_without_tenant)} {collection_name} records without tenant_id")
            
            # Assign to system tenant for now (these can be moved later if needed)
            for record in records_without_tenant:
                try:
                    await collection.update_one(
                        {"_id": record["_id"]},
                        {"$set": {"tenantId": "system"}}
                    )
                except Exception as e:
                    print(f"❌ Failed to update {collection_name} record: {e}")
            
            print(f"✅ Updated {len(records_without_tenant)} {collection_name} records")
    
    print("🎉 Multi-tenant migration completed successfully!")
    
    # Summary
    users_with_tenant = await collections['users'].count_documents({"tenantId": {"$exists": True}})
    roles_with_tenant = await collections['roles'].count_documents({"tenantId": {"$exists": True}})
    assignments_with_tenant = await collections['userRoles'].count_documents({"tenantId": {"$exists": True}})
    
    print(f"""
📈 Migration Summary:
   👥 Users with tenant_id: {users_with_tenant}
   🔐 Roles with tenant_id: {roles_with_tenant}
   🔗 Role assignments with tenant_id: {assignments_with_tenant}
    """)


if __name__ == "__main__":
    asyncio.run(migrate_to_multi_tenant())
