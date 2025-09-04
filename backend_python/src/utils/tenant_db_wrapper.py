"""
Tenant-Aware Database Wrapper

This module provides a wrapper around MongoDB collections that automatically enforces
tenant_id filtering on all database operations except for menuItems and tenants collections.

CRITICAL RULE: ALL RECORDS MUST BE FILTERED BY TENANT_ID EXCEPT MENUITEMS AND TENANTS
"""

from typing import Dict, Any, List, Optional, Union, TYPE_CHECKING
from fastapi import HTTPException, status
from pymongo.results import InsertOneResult, UpdateResult, DeleteResult
from bson import ObjectId
import asyncio

if TYPE_CHECKING:
    from motor.motor_asyncio import AsyncIOMotorCollection

from .log import logger
from ..services.tenant_service import TenantService
from .tenant_enforcement import (
    EXEMPT_COLLECTIONS,
    validate_tenant_query,
    ensure_tenant_id_in_record,
    validate_insert_operation,
    validate_update_operation,
    validate_upsert_operation
)


class TenantAwareCollection:
    """
    Wrapper around AsyncIOMotorCollection that enforces tenant isolation.
    
    This wrapper automatically:
    1. Adds tenant_id filtering to all read operations (find, find_one, count_documents, etc.)
    2. Ensures tenant_id is present in all write operations (insert_one, update_one, etc.)
    3. Validates tenant access for all operations
    4. Bypasses enforcement for exempt collections (menuItems, tenants)
    """
    
    def __init__(self, collection, collection_name: str, user_id: str):
        self._collection = collection
        self._collection_name = collection_name
        self._user_id = user_id
        self._is_exempt = collection_name in EXEMPT_COLLECTIONS
        
    async def _get_user_tenant_id(self) -> str:
        """Get the tenant_id for the current user"""
        if self._is_exempt:
            return None
            
        tenant_id = await TenantService.get_user_tenant_id(self._user_id)
        if not tenant_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User tenant information missing. Please re-login."
            )
        return tenant_id
    
    async def _add_tenant_filter(self, query: Dict[str, Any]) -> Dict[str, Any]:
        """Add tenant filtering to a query"""
        if self._is_exempt:
            return query
            
        return await validate_tenant_query(self._user_id, query, self._collection_name)
    
    async def _ensure_tenant_in_document(self, document: Dict[str, Any]) -> Dict[str, Any]:
        """Ensure tenant_id is present in a document"""
        if self._is_exempt:
            return document
            
        return await ensure_tenant_id_in_record(self._user_id, document, self._collection_name)
    
    # READ OPERATIONS
    async def find_one(self, filter: Dict[str, Any] = None, *args, **kwargs):
        """Find a single document with tenant filtering"""
        filter = filter or {}
        filter = await self._add_tenant_filter(filter)
        
        logger.debug(f"[TENANT_DB] find_one on {self._collection_name} with filter: {filter}")
        return await self._collection.find_one(filter, *args, **kwargs)
    
    def find(self, filter: Dict[str, Any] = None, *args, **kwargs):
        """Find multiple documents with tenant filtering"""
        async def _find_with_tenant_filter():
            filter_copy = filter.copy() if filter else {}
            filter_copy = await self._add_tenant_filter(filter_copy)
            logger.debug(f"[TENANT_DB] find on {self._collection_name} with filter: {filter_copy}")
            return self._collection.find(filter_copy, *args, **kwargs)
        
        # Return a cursor-like object that applies tenant filtering
        return TenantAwareCursor(
            _find_with_tenant_filter(),
            self._collection_name,
            self._user_id
        )
    
    async def count_documents(self, filter: Dict[str, Any] = None, *args, **kwargs):
        """Count documents with tenant filtering"""
        filter = filter or {}
        filter = await self._add_tenant_filter(filter)
        
        logger.debug(f"[TENANT_DB] count_documents on {self._collection_name} with filter: {filter}")
        return await self._collection.count_documents(filter, *args, **kwargs)
    
    async def aggregate(self, pipeline: List[Dict[str, Any]], *args, **kwargs):
        """Aggregate with tenant filtering"""
        if not self._is_exempt and pipeline:
            # Add tenant filter as the first stage if not already present
            tenant_id = await self._get_user_tenant_id()
            match_stage = {"$match": {"tenantId": tenant_id}}
            
            # Check if first stage is already a $match with tenantId
            if (pipeline and 
                pipeline[0].get("$match") and 
                "tenantId" not in pipeline[0]["$match"]):
                pipeline[0]["$match"]["tenantId"] = tenant_id
            elif not pipeline or "$match" not in pipeline[0]:
                pipeline.insert(0, match_stage)
        
        logger.debug(f"[TENANT_DB] aggregate on {self._collection_name} with pipeline: {pipeline[:1]}...")
        return self._collection.aggregate(pipeline, *args, **kwargs)
    
    # WRITE OPERATIONS
    async def insert_one(self, document: Dict[str, Any], *args, **kwargs) -> InsertOneResult:
        """Insert a single document with tenant_id validation"""
        document = await validate_insert_operation(self._user_id, self._collection_name, document)
        
        logger.debug(f"[TENANT_DB] insert_one on {self._collection_name}")
        return await self._collection.insert_one(document, *args, **kwargs)
    
    async def insert_many(self, documents: List[Dict[str, Any]], *args, **kwargs):
        """Insert multiple documents with tenant_id validation"""
        validated_documents = []
        for doc in documents:
            validated_doc = await validate_insert_operation(self._user_id, self._collection_name, doc)
            validated_documents.append(validated_doc)
        
        logger.debug(f"[TENANT_DB] insert_many on {self._collection_name} ({len(validated_documents)} documents)")
        return await self._collection.insert_many(validated_documents, *args, **kwargs)
    
    async def update_one(self, filter: Dict[str, Any], update: Dict[str, Any], *args, **kwargs) -> UpdateResult:
        """Update a single document with tenant filtering and validation"""
        # Apply tenant filter to the query
        filter = await self._add_tenant_filter(filter)
        
        # Validate the update document
        update = await validate_update_operation(self._user_id, self._collection_name, update)
        
        logger.debug(f"[TENANT_DB] update_one on {self._collection_name} with filter: {filter}")
        return await self._collection.update_one(filter, update, *args, **kwargs)
    
    async def update_many(self, filter: Dict[str, Any], update: Dict[str, Any], *args, **kwargs) -> UpdateResult:
        """Update multiple documents with tenant filtering and validation"""
        # Apply tenant filter to the query
        filter = await self._add_tenant_filter(filter)
        
        # Validate the update document
        update = await validate_update_operation(self._user_id, self._collection_name, update)
        
        logger.debug(f"[TENANT_DB] update_many on {self._collection_name} with filter: {filter}")
        return await self._collection.update_many(filter, update, *args, **kwargs)
    
    async def replace_one(self, filter: Dict[str, Any], replacement: Dict[str, Any], *args, **kwargs) -> UpdateResult:
        """Replace a single document with tenant filtering and validation"""
        # Apply tenant filter to the query
        filter = await self._add_tenant_filter(filter)
        
        # Ensure tenant_id is in replacement document
        replacement = await self._ensure_tenant_in_document(replacement)
        
        logger.debug(f"[TENANT_DB] replace_one on {self._collection_name} with filter: {filter}")
        return await self._collection.replace_one(filter, replacement, *args, **kwargs)
    
    async def delete_one(self, filter: Dict[str, Any], *args, **kwargs) -> DeleteResult:
        """Delete a single document with tenant filtering"""
        filter = await self._add_tenant_filter(filter)
        
        logger.debug(f"[TENANT_DB] delete_one on {self._collection_name} with filter: {filter}")
        return await self._collection.delete_one(filter, *args, **kwargs)
    
    async def delete_many(self, filter: Dict[str, Any], *args, **kwargs) -> DeleteResult:
        """Delete multiple documents with tenant filtering"""
        filter = await self._add_tenant_filter(filter)
        
        logger.debug(f"[TENANT_DB] delete_many on {self._collection_name} with filter: {filter}")
        return await self._collection.delete_many(filter, *args, **kwargs)
    
    # UTILITY METHODS
    async def find_one_and_update(self, filter: Dict[str, Any], update: Dict[str, Any], *args, **kwargs):
        """Find and update a single document with tenant filtering"""
        filter = await self._add_tenant_filter(filter)
        update = await validate_update_operation(self._user_id, self._collection_name, update)
        
        logger.debug(f"[TENANT_DB] find_one_and_update on {self._collection_name}")
        return await self._collection.find_one_and_update(filter, update, *args, **kwargs)
    
    async def find_one_and_replace(self, filter: Dict[str, Any], replacement: Dict[str, Any], *args, **kwargs):
        """Find and replace a single document with tenant filtering"""
        filter = await self._add_tenant_filter(filter)
        replacement = await self._ensure_tenant_in_document(replacement)
        
        logger.debug(f"[TENANT_DB] find_one_and_replace on {self._collection_name}")
        return await self._collection.find_one_and_replace(filter, replacement, *args, **kwargs)
    
    async def find_one_and_delete(self, filter: Dict[str, Any], *args, **kwargs):
        """Find and delete a single document with tenant filtering"""
        filter = await self._add_tenant_filter(filter)
        
        logger.debug(f"[TENANT_DB] find_one_and_delete on {self._collection_name}")
        return await self._collection.find_one_and_delete(filter, *args, **kwargs)
    
    # PASS-THROUGH METHODS FOR NON-DATA OPERATIONS
    async def create_index(self, *args, **kwargs):
        """Create index - pass through to underlying collection"""
        return await self._collection.create_index(*args, **kwargs)
    
    async def drop_index(self, *args, **kwargs):
        """Drop index - pass through to underlying collection"""
        return await self._collection.drop_index(*args, **kwargs)
    
    async def list_indexes(self, *args, **kwargs):
        """List indexes - pass through to underlying collection"""
        return await self._collection.list_indexes(*args, **kwargs)


class TenantAwareCursor:
    """
    Wrapper around AsyncIOMotorCursor that maintains tenant filtering.
    """
    
    def __init__(self, cursor_coro, collection_name: str, user_id: str):
        self._cursor_coro = cursor_coro
        self._collection_name = collection_name
        self._user_id = user_id
        self._cursor = None
    
    async def _get_cursor(self):
        """Get the actual cursor"""
        if self._cursor is None:
            self._cursor = await self._cursor_coro
        return self._cursor
    
    async def to_list(self, length: Optional[int] = None):
        """Convert cursor to list"""
        cursor = await self._get_cursor()
        return await cursor.to_list(length)
    
    def sort(self, *args, **kwargs):
        """Sort the cursor"""
        async def _sorted_cursor():
            cursor = await self._get_cursor()
            return cursor.sort(*args, **kwargs)
        return TenantAwareCursor(_sorted_cursor(), self._collection_name, self._user_id)
    
    def limit(self, limit: int):
        """Limit the cursor results"""
        async def _limited_cursor():
            cursor = await self._get_cursor()
            return cursor.limit(limit)
        return TenantAwareCursor(_limited_cursor(), self._collection_name, self._user_id)
    
    def skip(self, skip: int):
        """Skip results in the cursor"""
        async def _skipped_cursor():
            cursor = await self._get_cursor()
            return cursor.skip(skip)
        return TenantAwareCursor(_skipped_cursor(), self._collection_name, self._user_id)
    
    def batch_size(self, batch_size: int):
        """Set batch size for the cursor"""
        async def _batch_sized_cursor():
            cursor = await self._get_cursor()
            return cursor.batch_size(batch_size)
        return TenantAwareCursor(_batch_sized_cursor(), self._collection_name, self._user_id)
    
    async def __aiter__(self):
        """Async iterator"""
        cursor = await self._get_cursor()
        async for doc in cursor:
            yield doc
    
    async def __anext__(self):
        """Async next"""
        cursor = await self._get_cursor()
        return await cursor.__anext__()


class TenantAwareDatabase:
    """
    Factory for creating tenant-aware collection wrappers.
    """
    
    def __init__(self, database, user_id: str):
        self._database = database
        self._user_id = user_id
    
    def get_collection(self, collection_name: str) -> TenantAwareCollection:
        """Get a tenant-aware collection wrapper"""
        collection = self._database[collection_name]
        return TenantAwareCollection(collection, collection_name, self._user_id)
    
    def __getitem__(self, collection_name: str) -> TenantAwareCollection:
        """Allow dict-like access to collections"""
        return self.get_collection(collection_name)


def get_tenant_aware_db(database, user_id: str) -> TenantAwareDatabase:
    """
    Create a tenant-aware database wrapper.
    
    Usage:
        tenant_db = get_tenant_aware_db(get_db(), user_id)
        users_collection = tenant_db['users']
        user = await users_collection.find_one({"email": "user@example.com"})
    """
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User ID required for tenant-aware database access"
        )
    
    return TenantAwareDatabase(database, user_id)


def get_tenant_aware_collections(collections: Dict[str, Any], user_id: str) -> Dict[str, "TenantAwareCollection"]:
    """
    Convert a dictionary of collections to tenant-aware collections.
    
    Usage:
        collections = get_collections()
        tenant_collections = get_tenant_aware_collections(collections, user_id)
        user = await MongoStorageService.find_one("users", {"email": "user@example.com"})
    """
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User ID required for tenant-aware database access"
        )
    
    tenant_collections = {}
    for name, collection in collections.items():
        tenant_collections[name] = TenantAwareCollection(collection, name, user_id)
    
    return tenant_collections
