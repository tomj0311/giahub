"""
RBAC Middleware and Decorators for Access Control

This module provides middleware and decorators to control access to resources
based on user roles. All MongoDB collections can be controlled by roles.
"""

from functools import wraps
from typing import List, Dict, Any, Optional, Callable
from fastapi import HTTPException, Depends, status

from ..utils.auth import verify_token_middleware
from ..services.rbac_service import RBACService
from .log import logger


def require_roles(required_roles: List[str]):
    """
    Decorator to require specific roles for accessing an endpoint
    
    Args:
        required_roles: List of role names that have access
    """
    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            logger.debug(f"[RBAC] Checking role requirements: {required_roles}")
            # Get user from token middleware
            user = None
            for arg in args:
                if isinstance(arg, dict) and "id" in arg and "role" in arg:
                    user = arg
                    break
            
            if not user:
                # Try to get from kwargs
                user = kwargs.get("user")
            
            if not user:
                logger.warning("[RBAC] Authentication required - no user found")
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Authentication required"
                )
            
            user_id = user.get("id")
            if not user_id:
                logger.warning("[RBAC] Invalid user - no user ID found")
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid user"
                )
            
            logger.debug(f"[RBAC] Checking access for user: {user_id}")
            # Check if user has any of the required roles
            has_access = await RBACService.can_user_access_resource(user_id, required_roles)
            if not has_access:
                logger.warning(f"[RBAC] Access denied for user {user_id}. Required roles: {required_roles}")
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Access denied. Required roles: {', '.join(required_roles)}"
                )
            
            logger.debug(f"[RBAC] Access granted for user: {user_id}")
            return await func(*args, **kwargs)
        return wrapper
    return decorator


async def filter_records_by_roles(user_id: str, records: List[Dict], role_field: str = "roles") -> List[Dict]:
    """
    Filter database records based on user's roles
    
    Args:
        user_id: ID of the user requesting access
        records: List of database records to filter
        role_field: Field name in records that contains role requirements
        
    Returns:
        Filtered list of records user can access
    """
    logger.debug(f"[RBAC] Filtering {len(records)} records for user: {user_id}")
    filtered_records = await RBACService.filter_accessible_records(user_id, records, role_field)
    logger.debug(f"[RBAC] User {user_id} can access {len(filtered_records)} out of {len(records)} records")
    return filtered_records


async def can_user_access_record(user_id: str, record: Dict, role_field: str = "roles") -> bool:
    """
    Check if user can access a specific record
    
    Args:
        user_id: ID of the user requesting access
        record: Database record to check
        role_field: Field name in record that contains role requirements
        
    Returns:
        True if user can access the record
    """
    logger.debug(f"[RBAC] Checking record access for user: {user_id}")
    required_roles = record.get(role_field, [])
    logger.debug(f"[RBAC] Record requires roles: {required_roles}")
    
    can_access = await RBACService.can_user_access_resource(user_id, required_roles)
    logger.debug(f"[RBAC] User {user_id} {'can' if can_access else 'cannot'} access record")
    return can_access


async def add_user_roles_to_record(user_id: str, record: Dict, role_field: str = "roles") -> Dict:
    """
    Add user's roles to a record being created
    
    Args:
        user_id: ID of the user creating the record
        record: Record data to modify
        role_field: Field name to store roles in
        
    Returns:
        Modified record with user roles added
    """
    user_role_names = await RBACService.get_user_role_names(user_id)
    record[role_field] = list(user_role_names)
    return record


class RBACMiddleware:
    """Middleware class for RBAC operations"""
    
    @staticmethod
    async def verify_collection_access(
        user_id: str,
        collection_name: str,
        operation: str = "read",
        record: Optional[Dict] = None
    ) -> bool:
        """
        Verify if user can perform operation on collection
        
        Args:
            user_id: ID of the user
            collection_name: Name of the MongoDB collection
            operation: Type of operation (read, write, delete)
            record: Specific record being accessed (if applicable)
            
        Returns:
            True if access is allowed
        """
        
        # For specific record access, check record roles
        if record and "roles" in record:
            return await can_user_access_record(user_id, record)
        
        # For collection-level access, check if user has any roles
        # Users with any role can access collections, but specific records
        # are filtered based on their role requirements
        user_roles = await RBACService.get_user_role_names(user_id)
        return len(user_roles) > 0
    
    @staticmethod
    async def prepare_record_for_creation(user_id: str, record: Dict) -> Dict:
        """
        Prepare a record for creation by adding user's roles
        
        Args:
            user_id: ID of the user creating the record
            record: Record data
            
        Returns:
            Record with roles added
        """
        return await add_user_roles_to_record(user_id, record)
    
    @staticmethod
    async def filter_query_results(user_id: str, results: List[Dict]) -> List[Dict]:
        """
        Filter query results based on user's access rights
        
        Args:
            user_id: ID of the user
            results: Query results to filter
            
        Returns:
            Filtered results
        """
        return await filter_records_by_roles(user_id, results)


# Dependency for routes that need RBAC user context
async def get_rbac_user(user: dict = Depends(verify_token_middleware)) -> dict:
    """
    FastAPI dependency that provides user context for RBAC operations
    
    Returns:
        User dictionary with role information
    """
    user_id = user.get("id")
    if user_id:
        # Add user roles to the user context
        user_roles = await RBACService.get_user_role_names(user_id)
        user["roles"] = list(user_roles)
    
    return user
