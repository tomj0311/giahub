"""Centralized MongoDB storage utilities for all CRUD operations."""
from typing import Dict, Optional, Any, List, Union
from datetime import datetime
from pymongo.results import InsertOneResult, UpdateResult, DeleteResult
from bson import ObjectId

from .log import logger

class MongoStorageService:
    """Centralized MongoDB storage service for all CRUD operations"""
    
    @staticmethod
    def _get_collections():
        """Get database collections with proper error handling"""
        try:
            from ..db import get_collections
            return get_collections()
        except Exception as e:
            logger.error(f"[DB] Database not connected - call connect_db() first")
            logger.error(f"Failed to get database collections: {e}")
            raise RuntimeError("DB not connected. Call connect_db() first.")
    
    @staticmethod
    def _ensure_tenant_filter(filter_dict: Dict[str, Any], tenant_id: Optional[str], collection_name: str) -> Dict[str, Any]:
        """Ensure tenant isolation for multi-tenant collections"""
        # Collections that are tenant-isolated
        tenant_collections = {
            'roles', 'userRoles', 'modelConfig', 'toolConfig', 'embedderConfig',
            'knowledgeConfig', 'agents', 'conversations', 'agent_runs',
            'workflowConfig'
        }
        
        # Special handling for users collection during OAuth flows
        if collection_name == 'users':
            # Only enforce tenant isolation if tenant_id is explicitly provided
            if tenant_id:
                filter_dict["tenantId"] = tenant_id
        elif collection_name in tenant_collections:
            if not tenant_id:
                logger.error(f"[TENANT_ENFORCEMENT] CRITICAL: {collection_name} operation requires tenant_id but none provided")
                raise ValueError(f"tenant_id is required for {collection_name} operations")
            filter_dict["tenantId"] = tenant_id
        
        return filter_dict
    
    @staticmethod
    def _ensure_tenant_data(data: Dict[str, Any], tenant_id: Optional[str], collection_name: str) -> Dict[str, Any]:
        """Ensure tenant isolation for insert/update operations"""
        # Collections that are tenant-isolated
        tenant_collections = {
            'roles', 'userRoles', 'modelConfig', 'toolConfig', 'embedderConfig',
            'knowledgeConfig', 'agents', 'conversations', 'agent_runs',
            'workflowConfig'
        }
        
        # Special handling for users collection during OAuth flows  
        if collection_name == 'users':
            # Only enforce tenant isolation if tenant_id is explicitly provided
            if tenant_id:
                data["tenantId"] = tenant_id
        elif collection_name in tenant_collections:
            if not tenant_id:
                logger.error(f"[TENANT_ENFORCEMENT] CRITICAL: {collection_name} operation requires tenant_id but none provided")
                raise ValueError(f"tenant_id is required for {collection_name} operations")
            data["tenantId"] = tenant_id
        
        return data

    # ====================
    # READ OPERATIONS
    # ====================
    
    @classmethod
    async def find_one(cls, collection_name: str, filter_dict: Dict[str, Any], 
                      tenant_id: Optional[str] = None, projection: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
        """Find a single document"""
        try:
            collections = cls._get_collections()
            collection = collections.get(collection_name)
            if collection is None:
                logger.warning(f"{collection_name} collection not available")
                return None
            
            filter_dict = cls._ensure_tenant_filter(filter_dict, tenant_id, collection_name)
            result = await collection.find_one(filter_dict, projection)
            
            return result
        except Exception as e:
            logger.error(f"Failed to find document in {collection_name}: {e}")
            return None
    
    @classmethod
    async def find_many(cls, collection_name: str, filter_dict: Dict[str, Any] = None, 
                       tenant_id: Optional[str] = None, projection: Optional[Dict[str, Any]] = None,
                       sort_field: Optional[str] = None, sort_order: int = 1, limit: Optional[int] = None, skip: Optional[int] = None) -> List[Dict[str, Any]]:
        """Find multiple documents"""
        try:
            collections = cls._get_collections()
            collection = collections.get(collection_name)
            if collection is None:
                logger.warning(f"{collection_name} collection not available")
                return []
            
            filter_dict = filter_dict or {}
            filter_dict = cls._ensure_tenant_filter(filter_dict, tenant_id, collection_name)
            
            cursor = collection.find(filter_dict, projection)
            
            if sort_field:
                cursor = cursor.sort(sort_field, sort_order)
            if skip:
                cursor = cursor.skip(skip)
            if limit:
                cursor = cursor.limit(limit)
            
            # CRITICAL FIX: Don't pass None to to_list() - it ignores limit!
            # Use length_or_none=None only when no limit is set
            max_results = limit if limit else None
            results = await cursor.to_list(length=max_results)
            
            return results
        except Exception as e:
            logger.error(f"Failed to find documents in {collection_name}: {e}")
            return []
    
    @classmethod
    async def count_documents(cls, collection_name: str, filter_dict: Dict[str, Any] = None,
                             tenant_id: Optional[str] = None) -> int:
        """Count documents matching filter"""
        try:
            collections = cls._get_collections()
            collection = collections.get(collection_name)
            if collection is None:
                logger.warning(f"{collection_name} collection not available")
                return 0
            
            filter_dict = filter_dict or {}
            filter_dict = cls._ensure_tenant_filter(filter_dict, tenant_id, collection_name)
            
            count = await collection.count_documents(filter_dict)
            
            return count
        except Exception as e:
            logger.error(f"Failed to count documents in {collection_name}: {e}")
            return 0

    # ====================
    # WRITE OPERATIONS
    # ====================
    
    @classmethod
    async def insert_one(cls, collection_name: str, document: Dict[str, Any], 
                        tenant_id: Optional[str] = None) -> Optional[str]:
        """Insert a single document"""
        try:
            collections = cls._get_collections()
            collection = collections.get(collection_name)
            if collection is None:
                logger.warning(f"{collection_name} collection not available")
                return None
            
            logger.debug(f"[MONGO] Ensuring tenant data for {collection_name}")
            document = cls._ensure_tenant_data(document, tenant_id, collection_name)
            
            # Add timestamps if not present
            logger.debug(f"[MONGO] Adding timestamps to document in {collection_name}")
            now = datetime.utcnow()
            if 'created_at' not in document:
                document['created_at'] = now
            if 'updated_at' not in document:
                document['updated_at'] = now
            
            logger.debug(f"[MONGO] Executing insert_one on {collection_name}")
            result = await collection.insert_one(document)
            
            if result.acknowledged:
                logger.info(f"Inserted document in {collection_name} with ID: {result.inserted_id}")
                return str(result.inserted_id)
            
            return None
        except Exception as e:
            logger.error(f"Failed to insert document in {collection_name}: {e}")
            raise
    
    @classmethod
    async def insert_many(cls, collection_name: str, documents: List[Dict[str, Any]], 
                         tenant_id: Optional[str] = None) -> List[str]:
        """Insert multiple documents"""
        try:
            collections = cls._get_collections()
            collection = collections.get(collection_name)
            if collection is None:
                logger.warning(f"{collection_name} collection not available")
                return []
            
            # Ensure tenant isolation and add timestamps
            now = datetime.utcnow()
            for doc in documents:
                doc = cls._ensure_tenant_data(doc, tenant_id, collection_name)
                if 'created_at' not in doc:
                    doc['created_at'] = now
                if 'updated_at' not in doc:
                    doc['updated_at'] = now
            
            result = await collection.insert_many(documents)
            
            if result.acknowledged:
                inserted_ids = [str(id_) for id_ in result.inserted_ids]
                logger.info(f"Inserted {len(inserted_ids)} documents in {collection_name}")
                return inserted_ids
            
            return []
        except Exception as e:
            logger.error(f"Failed to insert documents in {collection_name}: {e}")
            raise

    # ====================
    # UPDATE OPERATIONS
    # ====================
    
    @classmethod
    async def update_one(cls, collection_name: str, filter_dict: Dict[str, Any], 
                        update_data: Dict[str, Any], tenant_id: Optional[str] = None,
                        upsert: bool = False) -> bool:
        """Update a single document"""
        try:
            collections = cls._get_collections()
            collection = collections.get(collection_name)
            if collection is None:
                logger.warning(f"{collection_name} collection not available")
                return False
            
            filter_dict = cls._ensure_tenant_filter(filter_dict, tenant_id, collection_name)
            
            # Ensure update_data has proper structure
            if not any(key.startswith('$') for key in update_data.keys()):
                # Convert to $set operation if not already an update operator
                update_data = {"$set": update_data}
            
            # Add updated timestamp
            if "$set" in update_data:
                update_data["$set"]["updated_at"] = datetime.utcnow()
            else:
                update_data["$set"] = {"updated_at": datetime.utcnow()}
            
            # Ensure tenant data for upserts
            if upsert and "$set" in update_data:
                update_data["$set"] = cls._ensure_tenant_data(update_data["$set"], tenant_id, collection_name)
            
            result = await collection.update_one(filter_dict, update_data, upsert=upsert)
            
            if result.acknowledged:
                logger.info(f"Updated document in {collection_name}: matched={result.matched_count}, modified={result.modified_count}")
                return result.modified_count > 0 or (upsert and result.upserted_id is not None)
            
            return False
        except Exception as e:
            logger.error(f"Failed to update document in {collection_name}: {e}")
            raise
    
    @classmethod
    async def update_many(cls, collection_name: str, filter_dict: Dict[str, Any], 
                         update_data: Dict[str, Any], tenant_id: Optional[str] = None) -> int:
        """Update multiple documents"""
        try:
            collections = cls._get_collections()
            collection = collections.get(collection_name)
            if collection is None:
                logger.warning(f"{collection_name} collection not available")
                return 0
            
            filter_dict = cls._ensure_tenant_filter(filter_dict, tenant_id, collection_name)
            
            # Ensure update_data has proper structure
            if not any(key.startswith('$') for key in update_data.keys()):
                update_data = {"$set": update_data}
            
            # Add updated timestamp
            if "$set" in update_data:
                update_data["$set"]["updated_at"] = datetime.utcnow()
            else:
                update_data["$set"] = {"updated_at": datetime.utcnow()}
            
            result = await collection.update_many(filter_dict, update_data)
            
            if result.acknowledged:
                logger.info(f"Updated {result.modified_count} documents in {collection_name}")
                return result.modified_count
            
            return 0
        except Exception as e:
            logger.error(f"Failed to update documents in {collection_name}: {e}")
            raise
    
    @classmethod
    async def replace_one(cls, collection_name: str, filter_dict: Dict[str, Any], 
                         replacement: Dict[str, Any], tenant_id: Optional[str] = None,
                         upsert: bool = False) -> bool:
        """Replace a single document"""
        try:
            collections = cls._get_collections()
            collection = collections.get(collection_name)
            if collection is None:
                logger.warning(f"{collection_name} collection not available")
                return False
            
            filter_dict = cls._ensure_tenant_filter(filter_dict, tenant_id, collection_name)
            replacement = cls._ensure_tenant_data(replacement, tenant_id, collection_name)
            
            # Add updated timestamp
            replacement["updated_at"] = datetime.utcnow()
            if upsert and "created_at" not in replacement:
                replacement["created_at"] = datetime.utcnow()
            
            result = await collection.replace_one(filter_dict, replacement, upsert=upsert)
            
            if result.acknowledged:
                logger.info(f"Replaced document in {collection_name}: matched={result.matched_count}, modified={result.modified_count}")
                return result.modified_count > 0 or (upsert and result.upserted_id is not None)
            
            return False
        except Exception as e:
            logger.error(f"Failed to replace document in {collection_name}: {e}")
            raise

    # ====================
    # DELETE OPERATIONS
    # ====================
    
    @classmethod
    async def delete_one(cls, collection_name: str, filter_dict: Dict[str, Any], 
                        tenant_id: Optional[str] = None) -> bool:
        """Delete a single document"""
        try:
            collections = cls._get_collections()
            collection = collections.get(collection_name)
            if collection is None:
                logger.warning(f"{collection_name} collection not available")
                return False
            
            filter_dict = cls._ensure_tenant_filter(filter_dict, tenant_id, collection_name)
            
            result = await collection.delete_one(filter_dict)
            
            if result.acknowledged:
                logger.info(f"Deleted {result.deleted_count} document from {collection_name}")
                return result.deleted_count > 0
            
            return False
        except Exception as e:
            logger.error(f"Failed to delete document from {collection_name}: {e}")
            raise
    
    @classmethod
    async def delete_many(cls, collection_name: str, filter_dict: Dict[str, Any], 
                         tenant_id: Optional[str] = None) -> int:
        """Delete multiple documents"""
        try:
            collections = cls._get_collections()
            collection = collections.get(collection_name)
            if collection is None:
                logger.warning(f"{collection_name} collection not available")
                return 0
            
            filter_dict = cls._ensure_tenant_filter(filter_dict, tenant_id, collection_name)
            
            result = await collection.delete_many(filter_dict)
            
            if result.acknowledged:
                logger.info(f"Deleted {result.deleted_count} documents from {collection_name}")
                return result.deleted_count
            
            return 0
        except Exception as e:
            logger.error(f"Failed to delete documents from {collection_name}: {e}")
            raise

    # ====================
    # SPECIALIZED OPERATIONS
    # ====================
    
    @classmethod
    async def find_one_and_update(cls, collection_name: str, filter_dict: Dict[str, Any], 
                                 update_data: Dict[str, Any], tenant_id: Optional[str] = None,
                                 upsert: bool = False, return_document_after: bool = True) -> Optional[Dict[str, Any]]:
        """Find and update a document atomically"""
        try:
            from pymongo import ReturnDocument
            
            collections = cls._get_collections()
            collection = collections.get(collection_name)
            if collection is None:
                logger.warning(f"{collection_name} collection not available")
                return None
            
            filter_dict = cls._ensure_tenant_filter(filter_dict, tenant_id, collection_name)
            
            # Ensure update_data has proper structure
            if not any(key.startswith('$') for key in update_data.keys()):
                update_data = {"$set": update_data}
            
            # Add updated timestamp
            if "$set" in update_data:
                update_data["$set"]["updated_at"] = datetime.utcnow()
            else:
                update_data["$set"] = {"updated_at": datetime.utcnow()}
            
            # Ensure tenant data for upserts
            if upsert and "$set" in update_data:
                update_data["$set"] = cls._ensure_tenant_data(update_data["$set"], tenant_id, collection_name)
            
            return_doc = ReturnDocument.AFTER if return_document_after else ReturnDocument.BEFORE
            
            result = await collection.find_one_and_update(
                filter_dict, update_data, upsert=upsert, return_document=return_doc
            )
            
            return result
        except Exception as e:
            logger.error(f"Failed to find and update document in {collection_name}: {e}")
            raise
    
    @classmethod
    async def find_one_and_delete(cls, collection_name: str, filter_dict: Dict[str, Any], 
                                 tenant_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Find and delete a document atomically"""
        try:
            collections = cls._get_collections()
            collection = collections.get(collection_name)
            if collection is None:
                logger.warning(f"{collection_name} collection not available")
                return None
            
            filter_dict = cls._ensure_tenant_filter(filter_dict, tenant_id, collection_name)
            
            result = await collection.find_one_and_delete(filter_dict)
            
            if result:
                logger.info(f"Found and deleted document from {collection_name}")
            
            return result
        except Exception as e:
            logger.error(f"Failed to find and delete document from {collection_name}: {e}")
            raise



    @classmethod
    async def distinct(cls, collection_name: str, field: str, filter_dict: Dict[str, Any] = None,
                      tenant_id: Optional[str] = None) -> List[Any]:
        """Get distinct values for a field"""
        try:
            collections = cls._get_collections()
            collection = collections.get(collection_name)
            if collection is None:
                logger.warning(f"{collection_name} collection not available")
                return []
            
            filter_dict = filter_dict or {}
            filter_dict = cls._ensure_tenant_filter(filter_dict, tenant_id, collection_name)
            
            distinct_values = await collection.distinct(field, filter_dict)
            
            return distinct_values
        except Exception as e:
            logger.error(f"Failed to get distinct values for {field} in {collection_name}: {e}")
            return []



# Legacy compatibility functions
def model_config_get(config_name: str, tenant_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Get model configuration from MongoDB. (Legacy function - use MongoStorageService.find_one instead)"""
    try:
        import asyncio
        return asyncio.run(MongoStorageService.find_one(
            "modelConfig", 
            {"name": config_name}, 
            tenant_id=tenant_id
        ))
    except Exception as e:
        logger.error(f"Failed to get model config {config_name}: {e}")
        return None

def tools_config_get(config_name: str, tenant_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Get tools configuration from MongoDB. (Legacy function - use MongoStorageService.find_one instead)"""
    try:
        import asyncio
        return asyncio.run(MongoStorageService.find_one(
            "toolConfig", 
            {"name": config_name}, 
            tenant_id=tenant_id
        ))
    except Exception as e:
        logger.error(f"Failed to get tools config {config_name}: {e}")
        return None

def agent_run_upsert(run_data: Dict[str, Any]) -> None:
    """Insert or update agent run data in MongoDB. (Legacy function - use MongoStorageService.replace_one instead)"""
    try:
        import asyncio
        correlation_id = run_data.get('correlation_id')
        if not correlation_id:
            logger.error("No correlation_id in run_data")
            return
        
        tenant_id = run_data.get('tenantId')
        if not tenant_id:
            logger.error(f"[TENANT_ENFORCEMENT] CRITICAL: agent_run_upsert requires tenant_id but none found in run_data for correlation_id: {correlation_id}")
            raise ValueError("tenant_id is required for agent_runs upsert operations")
        
        asyncio.run(MongoStorageService.replace_one(
            "agent_runs",
            {"correlation_id": correlation_id},
            run_data,
            tenant_id=tenant_id,
            upsert=True
        ))
        logger.info(f"Agent run data upserted for {correlation_id} with tenant_id: {tenant_id}")
    except Exception as e:
        logger.error(f"Failed to upsert agent run data: {e}")
        raise

def agent_run_update_status(correlation_id: str, status: str, error: Optional[str] = None, tenant_id: Optional[str] = None) -> None:
    """Update agent run status in MongoDB. (Legacy function - use MongoStorageService.update_one instead)"""
    try:
        import asyncio
        
        if not tenant_id:
            logger.error(f"[TENANT_ENFORCEMENT] CRITICAL: agent_run_update_status requires tenant_id but none provided for correlation_id: {correlation_id}")
            raise ValueError("tenant_id is required for agent_runs update operations")
        
        update_data = {"status": status}
        if error:
            update_data["error"] = error
        
        asyncio.run(MongoStorageService.update_one(
            "agent_runs",
            {"correlation_id": correlation_id},
            update_data,
            tenant_id=tenant_id
        ))
        logger.info(f"Agent run status updated for {correlation_id} with tenant_id: {tenant_id}: {status}")
    except Exception as e:
        logger.error(f"Failed to update agent run status: {e}")
        raise
