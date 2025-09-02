"""
Multi-Tenant Middleware

This middleware ensures all database operations are filtered by tenant_id.
It automatically adds tenant isolation to database queries and record creation.
"""

from typing import Dict, List, Optional, Any
from fastapi import HTTPException, status

from ..services.tenant_service import TenantService


class TenantMiddleware:
    """Middleware for enforcing tenant isolation"""
    
    @staticmethod
    async def filter_query_by_tenant(user_id: str, query: Dict) -> Dict:
        """Add tenant filtering to a MongoDB query"""
        return await TenantService.filter_by_tenant(user_id, query)
    
    @staticmethod
    async def add_tenant_to_record(user_id: str, record: Dict) -> Dict:
        """Add tenant_id to a record before saving"""
        return await TenantService.add_tenant_to_record(user_id, record)
    
    @staticmethod
    async def ensure_tenant_access(user_id: str, record: Dict) -> bool:
        """Ensure user can only access records from their tenant"""
        return await TenantService.ensure_tenant_isolation(user_id, record)
    
    @staticmethod
    async def filter_records_by_tenant(user_id: str, records: List[Dict]) -> List[Dict]:
        """Filter a list of records to only include those from user's tenant"""
        if not records:
            return []
        
        user_tenant_id = await TenantService.get_user_tenant_id(user_id)
        if not user_tenant_id:
            return []
        
        filtered_records = []
        for record in records:
            record_tenant_id = record.get("tenantId")
            
            # If record has no tenant_id, it's considered public (legacy data)
            if not record_tenant_id:
                filtered_records.append(record)
                continue
            
            # Only include records from the same tenant
            if record_tenant_id == user_tenant_id:
                filtered_records.append(record)
        
        return filtered_records
    
    @staticmethod
    async def verify_tenant_ownership(user_id: str, record: Dict) -> None:
        """Verify user owns/can access a record - raises exception if not"""
        has_access = await TenantMiddleware.ensure_tenant_access(user_id, record)
        if not has_access:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied - record belongs to different organization"
            )


# Convenience functions for common operations
async def tenant_filter_query(user_id: str, query: Dict) -> Dict:
    """Add tenant filtering to a query"""
    return await TenantMiddleware.filter_query_by_tenant(user_id, query)

async def tenant_add_to_record(user_id: str, record: Dict) -> Dict:
    """Add tenant_id to a record"""
    return await TenantMiddleware.add_tenant_to_record(user_id, record)

async def tenant_filter_records(user_id: str, records: List[Dict]) -> List[Dict]:
    """Filter records by tenant"""
    return await TenantMiddleware.filter_records_by_tenant(user_id, records)

async def tenant_verify_access(user_id: str, record: Dict) -> None:
    """Verify tenant access or raise exception"""
    await TenantMiddleware.verify_tenant_ownership(user_id, record)
