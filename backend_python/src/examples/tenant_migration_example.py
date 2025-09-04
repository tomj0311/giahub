"""
Migration Example: Converting Routes to Tenant-Aware Database Access

This example shows how to migrate existing routes to use tenant-aware database access.
This ensures all database operations are automatically filtered by tenant_id.

BEFORE: Manual tenant filtering (error-prone)
AFTER: Automatic tenant filtering (secure by default)
"""

from ..utils.mongo_storage import MongoStorageService

# BEFORE: Manual tenant filtering - error-prone and can be forgotten
"""
@router.get("/users")
async def get_users_old(user: dict = Depends(verify_token_middleware)):
    collections = get_collections()
    
    # PROBLEM: Manual tenant filtering can be forgotten or done incorrectly
    tenant_id = user.get("tenantId")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="No tenant")
    
    # PROBLEM: Developer must remember to add tenantId filter
    query = {"tenantId": tenant_id}  # Easy to forget!
    users = await MongoStorageService.find_many("users", query)
    return users


@router.post("/users")
async def create_user_old(user_data: dict, user: dict = Depends(verify_token_middleware)):
    collections = get_collections()
    
    # PROBLEM: Manual tenant_id addition can be forgotten
    tenant_id = user.get("tenantId")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="No tenant")
    
    # PROBLEM: Developer must remember to add tenantId to record
    user_data["tenantId"] = tenant_id  # Easy to forget!
    result = await MongoStorageService.insert_one("users", user_data)
    return {"id": str(result.get("inserted_id", ""))}
"""

# AFTER: Automatic tenant filtering - secure by default

from fastapi import APIRouter, Depends, HTTPException, status
from ..utils.auth import verify_token_middleware
from ..utils.tenant_access import with_tenant_db, tenant_db, require_tenant_access

router = APIRouter()

# Method 1: Using decorator (recommended for simple cases)
@router.get("/users")
@with_tenant_db
async def get_users_v1(user: dict = Depends(verify_token_middleware), collections=None):
    """
    Get users with automatic tenant filtering.
    The @with_tenant_db decorator automatically injects tenant-aware collections.
    """
    # collections is now tenant-aware - automatic filtering by tenant_id
    users = await MongoStorageService.find_many("users", {})
    
    # Optional: filter by additional criteria
    active_users = await MongoStorageService.find_many("users", {"active": True})
    
    return {"users": users, "active_users": active_users}


# Method 2: Using dependency injection (recommended for complex cases)
@router.get("/users-v2")
async def get_users_v2(
    user: dict = Depends(verify_token_middleware),
    collections = Depends(tenant_db.collections)
):
    """
    Get users using dependency injection for tenant-aware collections.
    """
    # Automatic tenant filtering - no manual tenant_id needed
    users = await MongoStorageService.find_many("users", {})
    
    # Count users in tenant
    user_count = await MongoStorageService.count_documents("users", {})
    
    return {"users": users, "count": user_count}


# Method 3: Using tenant access requirement decorator (for validation)
@router.post("/users")
@require_tenant_access(['users'])
async def create_user(
    user_data: dict,
    user: dict = Depends(verify_token_middleware),
    collections = Depends(tenant_db.collections)
):
    """
    Create user with automatic tenant_id injection.
    """
    # tenant_id is automatically added to user_data during insert
    result = await MongoStorageService.insert_one("users", user_data)
    
    # Get the created user (also tenant-filtered)
    created_user = await MongoStorageService.find_one("users", {"_id": result.get("inserted_id")})
    
    return {"id": str(result.get("inserted_id", "")), "user": created_user}


# Method 4: Complex operations with multiple collections
@router.get("/user-roles")
async def get_user_roles(
    user: dict = Depends(verify_token_middleware),
    collections = Depends(tenant_db.collections)
):
    """
    Get users and their roles - all automatically tenant-filtered.
    """
    # All operations are automatically tenant-filtered
    users = await MongoStorageService.find_many("users", {})
    roles = await MongoStorageService.find_many("roles", {})
    user_roles = await MongoStorageService.find_many("userRoles", {})
    
    # Build user-role mapping
    role_map = {role['roleId']: role for role in roles}
    user_role_map = {}
    for ur in user_roles:
        user_id = ur['userId']
        role_id = ur['roleId']
        if user_id not in user_role_map:
            user_role_map[user_id] = []
        if role_id in role_map:
            user_role_map[user_id].append(role_map[role_id])
    
    # Add roles to users
    for user_item in users:
        user_item['roles'] = user_role_map.get(user_item['id'], [])
    
    return {"users": users}


# Method 5: Handling exempt collections (menuItems, tenants)
@router.get("/menu-items")
async def get_menu_items(user: dict = Depends(verify_token_middleware)):
    """
    Get menu items - these are global and not tenant-filtered.
    """
    # For exempt collections, use regular collections
    from ..db import get_collections
    collections = get_collections()
    
    # menuItems are global - no tenant filtering
    menu_items = await MongoStorageService.find_many("menuItems", {})
    
    return {"menuItems": menu_items}


# Method 6: Error handling for tenant-aware operations
@router.get("/protected-data")
async def get_protected_data(
    user: dict = Depends(verify_token_middleware),
    collections = Depends(tenant_db.collections)
):
    """
    Example of error handling with tenant-aware operations.
    """
    try:
        # This will automatically fail if user has no tenant_id
        data = await MongoStorageService.find_many("users", {})
        
        # Complex query - still tenant-filtered
        recent_data = await MongoStorageService.find_many("users", {
            "createdAt": {"$gte": "2024-01-01"}
        }, sort_field="createdAt", sort_order=-1, limit=10)
        
        return {"data": data, "recent": recent_data}
        
    except HTTPException:
        # Re-raise HTTP exceptions (like tenant access errors)
        raise
    except Exception as e:
        # Handle other database errors
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database operation failed"
        )


# MIGRATION CHECKLIST:
"""
1. Replace get_collections() with tenant-aware alternatives:
   - Use @with_tenant_db decorator, OR
   - Use tenant_db.collections dependency, OR
   - Use get_tenant_collections(user_id) function

2. Remove manual tenant filtering:
   - Remove manual tenantId from queries
   - Remove manual tenantId addition to documents
   - Remove manual tenant validation

3. Handle exempt collections separately:
   - menuItems and tenants collections don't need tenant filtering
   - Use regular get_collections() for these

4. Add error handling:
   - Tenant-aware operations will automatically raise HTTPException for tenant issues
   - Handle these appropriately in your routes

5. Test thoroughly:
   - Verify tenant isolation works correctly
   - Test with multiple tenants
   - Verify exempt collections work as expected
"""

# BENEFITS OF NEW APPROACH:
"""
1. SECURITY: Impossible to forget tenant filtering
2. SIMPLICITY: No manual tenant_id management
3. CONSISTENCY: Same pattern across all routes
4. MAINTAINABILITY: Less code, fewer bugs
5. AUDITABILITY: Automatic logging of tenant operations
"""
