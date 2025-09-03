"""
Tenant Enforcement Utilities

This module provides utilities to enforce tenant_id requirements in all database operations
except for the 'menuitems' and 'tenant' collections.

CRITICAL RULE: NO INSERT OR UPDATE WITHOUT TENANT_ID IN ALL COLLECTIONS EXCEPT MENUITEMS AND TENANT
"""

from typing import Dict, Any, List, Optional
from fastapi import HTTPException, status
from functools import wraps
import asyncio

from .log import logger
from ..services.tenant_service import TenantService

# Collections that are EXEMPT from tenant_id enforcement
EXEMPT_COLLECTIONS = {"menuItems", "tenants"}

class TenantEnforcementError(Exception):
    """Raised when tenant_id enforcement fails"""
    pass

def validate_tenant_id_required(operation: str, collection_name: str, data: Dict[str, Any], user_id: Optional[str] = None) -> None:
    """
    Validate that tenant_id is present for operations that require it.
    
    Args:
        operation: The operation being performed (insert, update, upsert)
        collection_name: Name of the collection
        data: Data being inserted/updated
        user_id: Optional user ID for context
        
    Raises:
        TenantEnforcementError: If tenant_id is missing when required
    """
    # Skip validation for exempt collections
    if collection_name in EXEMPT_COLLECTIONS:
        logger.debug(f"[TENANT_ENFORCEMENT] Skipping tenant_id validation for exempt collection: {collection_name}")
        return
    
    # Check if tenant_id is present
    tenant_id = data.get("tenantId")
    if not tenant_id:
        error_msg = f"[TENANT_ENFORCEMENT] CRITICAL: {operation} operation on '{collection_name}' collection REQUIRES tenant_id but none found!"
        if user_id:
            error_msg += f" User ID: {user_id}"
        logger.error(error_msg)
        raise TenantEnforcementError(f"tenant_id is required for {operation} operations on {collection_name} collection")

async def ensure_tenant_id_in_record(user_id: str, record: Dict[str, Any], collection_name: str) -> Dict[str, Any]:
    """
    Ensure tenant_id is present in a record before database operations.
    
    Args:
        user_id: User performing the operation
        record: Record to be inserted/updated
        collection_name: Name of the collection
        
    Returns:
        Record with tenant_id added if needed
        
    Raises:
        HTTPException: If user has no tenant_id or tenant_id cannot be added
    """
    # Skip for exempt collections
    if collection_name in EXEMPT_COLLECTIONS:
        return record
    
    # If record already has tenant_id, validate it against user's tenant
    if "tenantId" in record:
        user_tenant_id = await TenantService.get_user_tenant_id(user_id)
        if user_tenant_id and record["tenantId"] != user_tenant_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot access records from different tenant"
            )
        return record
    
    # Add tenant_id to record
    user_tenant_id = await TenantService.get_user_tenant_id(user_id)
    if not user_tenant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User tenant information missing. Please re-login."
        )
    
    record = record.copy()
    record["tenantId"] = user_tenant_id
    logger.debug(f"[TENANT_ENFORCEMENT] Added tenant_id {user_tenant_id} to {collection_name} record")
    return record

async def validate_tenant_query(user_id: str, query: Dict[str, Any], collection_name: str) -> Dict[str, Any]:
    """
    Ensure queries are filtered by tenant_id for non-exempt collections.
    
    Args:
        user_id: User performing the query
        query: MongoDB query
        collection_name: Name of the collection
        
    Returns:
        Query with tenant filtering added if needed
    """
    # Skip for exempt collections
    if collection_name in EXEMPT_COLLECTIONS:
        return query
    
    user_tenant_id = await TenantService.get_user_tenant_id(user_id)
    if not user_tenant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User tenant information missing. Please re-login."
        )
    
    # Add tenant filter to query if not already present
    query = query.copy()
    if "tenantId" not in query:
        query["tenantId"] = user_tenant_id
        logger.debug(f"[TENANT_ENFORCEMENT] Added tenant filter {user_tenant_id} to {collection_name} query")
    
    return query

def tenant_enforcement_decorator(func):
    """
    Decorator to automatically enforce tenant_id requirements on database operations.
    Use this on functions that perform database insert/update operations.
    """
    @wraps(func)
    async def wrapper(*args, **kwargs):
        try:
            return await func(*args, **kwargs)
        except TenantEnforcementError as e:
            logger.error(f"[TENANT_ENFORCEMENT] {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e)
            )
    return wrapper

# Pre-operation validation functions for common patterns
async def validate_insert_operation(user_id: str, collection_name: str, document: Dict[str, Any]) -> Dict[str, Any]:
    """Validate and prepare document for insert operation"""
    document = await ensure_tenant_id_in_record(user_id, document, collection_name)
    validate_tenant_id_required("insert", collection_name, document, user_id)
    return document

async def validate_update_operation(user_id: str, collection_name: str, update_doc: Dict[str, Any]) -> Dict[str, Any]:
    """Validate and prepare document for update operation"""
    # For update operations, we need to ensure tenant_id is in the $set clause if present
    if "$set" in update_doc:
        update_doc["$set"] = await ensure_tenant_id_in_record(user_id, update_doc["$set"], collection_name)
        validate_tenant_id_required("update", collection_name, update_doc["$set"], user_id)
    else:
        update_doc = await ensure_tenant_id_in_record(user_id, update_doc, collection_name)
        validate_tenant_id_required("update", collection_name, update_doc, user_id)
    return update_doc

async def validate_upsert_operation(user_id: str, collection_name: str, document: Dict[str, Any]) -> Dict[str, Any]:
    """Validate and prepare document for upsert operation"""
    document = await ensure_tenant_id_in_record(user_id, document, collection_name)
    validate_tenant_id_required("upsert", collection_name, document, user_id)
    return document

# Utility function to check if a collection requires tenant_id
def requires_tenant_id(collection_name: str) -> bool:
    """Check if a collection requires tenant_id enforcement"""
    return collection_name not in EXEMPT_COLLECTIONS
