"""
Tenant-Aware Database Access Decorators

This module provides decorators and utilities to enforce tenant-aware database access
in FastAPI routes and services.
"""

from functools import wraps
from typing import Callable, Any, Dict
from fastapi import HTTPException, status, Depends
from .mongo_storage import MongoStorageService

from ..db import get_collections, get_db
from .tenant_db_wrapper import get_tenant_aware_collections, get_tenant_aware_db
from .auth import verify_token_middleware
from .log import logger


def with_tenant_db(func: Callable) -> Callable:
    """
    Decorator that injects tenant-aware database collections into route handlers.
    
    This decorator:
    1. Extracts user information from the route's user dependency
    2. Creates tenant-aware collections that automatically filter by tenant_id
    3. Replaces 'collections' parameter with tenant-aware collections
    
    Usage:
        @router.get("/users")
        @with_tenant_db
        async def get_users(user: dict = Depends(verify_token_middleware), collections=None):
            # collections is now tenant-aware - no need for manual tenant filtering
            users = await MongoStorageService.find_many("users", {})
            return users
    """
    @wraps(func)
    async def wrapper(*args, **kwargs):
        # Extract user from kwargs (should be injected by verify_token_middleware)
        user = kwargs.get('user')
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User authentication required for database access"
            )
        
        user_id = user.get('id')
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Valid user ID required for database access"
            )
        
        # Create tenant-aware collections
        original_collections = get_collections()
        tenant_collections = get_tenant_aware_collections(original_collections, user_id)
        
        # Replace or inject tenant-aware collections
        kwargs['collections'] = tenant_collections
        
        logger.debug(f"[TENANT_ACCESS] Injected tenant-aware collections for user: {user_id}")
        
        return await func(*args, **kwargs)
    
    return wrapper


def with_tenant_database(func: Callable) -> Callable:
    """
    Decorator that injects tenant-aware database instance into route handlers.
    
    Usage:
        @router.get("/users")
        @with_tenant_database
        async def get_users(user: dict = Depends(verify_token_middleware), db=None):
            # db is now tenant-aware
            users = await MongoStorageService.find_many("users", {})
            return users
    """
    @wraps(func)
    async def wrapper(*args, **kwargs):
        # Extract user from kwargs
        user = kwargs.get('user')
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User authentication required for database access"
            )
        
        user_id = user.get('id')
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Valid user ID required for database access"
            )
        
        # Create tenant-aware database
        original_db = get_db()
        tenant_db = get_tenant_aware_db(original_db, user_id)
        
        # Replace or inject tenant-aware database
        kwargs['db'] = tenant_db
        
        logger.debug(f"[TENANT_ACCESS] Injected tenant-aware database for user: {user_id}")
        
        return await func(*args, **kwargs)
    
    return wrapper


class TenantAwareDependency:
    """
    FastAPI dependency that provides tenant-aware database access.
    
    Usage:
        tenant_db = TenantAwareDependency()
        
        @router.get("/users")
        async def get_users(collections = Depends(tenant_db.collections)):
            users = await MongoStorageService.find_many("users", {})
            return users
    """
    
    def __init__(self):
        self._collections_cache = {}
        self._db_cache = {}
    
    async def collections(self, user: dict = Depends(verify_token_middleware)):
        """Dependency that returns tenant-aware collections"""
        user_id = user.get('id')
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Valid user ID required for database access"
            )
        
        # Use cache to avoid recreating collections for the same user
        if user_id not in self._collections_cache:
            original_collections = get_collections()
            self._collections_cache[user_id] = get_tenant_aware_collections(original_collections, user_id)
        
        return self._collections_cache[user_id]
    
    async def database(self, user: dict = Depends(verify_token_middleware)):
        """Dependency that returns tenant-aware database"""
        user_id = user.get('id')
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Valid user ID required for database access"
            )
        
        # Use cache to avoid recreating database wrapper for the same user
        if user_id not in self._db_cache:
            original_db = get_db()
            self._db_cache[user_id] = get_tenant_aware_db(original_db, user_id)
        
        return self._db_cache[user_id]


# Global instance for easy import
tenant_db = TenantAwareDependency()


def require_tenant_access(collection_names: list = None):
    """
    Decorator that ensures tenant access is properly enforced.
    
    Args:
        collection_names: List of collection names that will be accessed.
                         Used for logging and validation.
    
    Usage:
        @router.get("/users")
        @require_tenant_access(['users', 'roles'])
        async def get_users(user: dict = Depends(verify_token_middleware)):
            # Function implementation here
            pass
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def wrapper(*args, **kwargs):
            user = kwargs.get('user')
            if not user:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="User authentication required"
                )
            
            user_id = user.get('id')
            tenant_id = user.get('tenantId')
            
            if not user_id:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Valid user ID required"
                )
            
            if not tenant_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="User tenant information missing. Please re-login."
                )
            
            collections_msg = f" (accessing: {', '.join(collection_names)})" if collection_names else ""
            logger.debug(f"[TENANT_ACCESS] User {user_id} from tenant {tenant_id} accessing function {func.__name__}{collections_msg}")
            
            return await func(*args, **kwargs)
        
        return wrapper
    return decorator


# Convenience functions for manual tenant-aware access
async def get_tenant_collections(user_id: str):
    """Get tenant-aware collections for a specific user"""
    if not user_id:
        raise ValueError("User ID is required")
    
    original_collections = get_collections()
    return get_tenant_aware_collections(original_collections, user_id)


async def get_tenant_database(user_id: str):
    """Get tenant-aware database for a specific user"""
    if not user_id:
        raise ValueError("User ID is required")
    
    original_db = get_db()
    return get_tenant_aware_db(original_db, user_id)


def log_tenant_operation(operation: str, collection_name: str, user_id: str, details: str = ""):
    """Log tenant-aware database operations for audit purposes"""
    log_msg = f"[TENANT_AUDIT] {operation} on {collection_name} by user {user_id}"
    if details:
        log_msg += f" - {details}"
    logger.info(log_msg)
