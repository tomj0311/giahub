"""
Knowledge Service

This service handles all knowledge-related business logic including knowledge
configuration, file uploads, vector database operations, and component discovery.
"""

import os
import sys
from datetime import datetime
from typing import List, Optional, Dict, Any
from fastapi import HTTPException, status, UploadFile

from ..utils.log import logger
from ..utils.mongo_storage import MongoStorageService
from src.utils.component_discovery import discover_components, get_detailed_class_info
from .file_service import FileService
from .vector_service import VectorService


class KnowledgeService:
    """Service for managing knowledge configurations and operations"""
    
    @staticmethod
    async def validate_tenant_access(user: dict) -> str:
        """Validate tenant access and return tenant_id"""
        tenant_id = user.get("tenantId")
        if not tenant_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User tenant information missing. Please re-login."
            )
        return tenant_id
    
    @classmethod
    async def discover_chunking_components(cls) -> List[Dict[str, Any]]:
        """Discover available chunking components"""
        logger.info("[KNOWLEDGE] Discovering chunking components")
        
        try:
            components = discover_components("ai.document.chunking")
            result = []
            
            for comp in components:
                try:
                    module_path = f"ai.document.chunking.{comp}"
                    class_info = get_detailed_class_info(module_path, comp)
                    
                    result.append({
                        "name": comp,
                        "module": module_path,
                        "description": class_info.get("description", ""),
                        "parameters": class_info.get("parameters", {}),
                        "examples": class_info.get("examples", {})
                    })
                except Exception as e:
                    logger.warning(f"[KNOWLEDGE] Failed to introspect {comp}: {e}")
                    result.append({
                        "name": comp,
                        "module": f"ai.document.chunking.{comp}",
                        "description": "Component introspection failed",
                        "parameters": {},
                        "examples": {}
                    })
            
            logger.info(f"[KNOWLEDGE] Found {len(result)} chunking components")
            return result
            
        except Exception as e:
            logger.error(f"[KNOWLEDGE] Failed to discover components: {e}")
            raise HTTPException(status_code=500, detail="Failed to discover chunking components")
    
    @classmethod
    async def get_component_details(cls, component_name: str) -> Dict[str, Any]:
        """Get detailed information about a specific component"""
        logger.info(f"[KNOWLEDGE] Getting details for component: {component_name}")
        
        try:
            module_path = f"ai.document.chunking.{component_name}"
            class_info = get_detailed_class_info(module_path, component_name)
            
            return {
                "name": component_name,
                "module": module_path,
                "description": class_info.get("description", ""),
                "parameters": class_info.get("parameters", {}),
                "examples": class_info.get("examples", {})
            }
            
        except Exception as e:
            logger.error(f"[KNOWLEDGE] Failed to get component details for {component_name}: {e}")
            raise HTTPException(status_code=404, detail=f"Component '{component_name}' not found")
    
    @classmethod
    async def list_knowledge_configs(cls, user: dict) -> List[Dict[str, Any]]:
        """List knowledge configurations for current tenant"""
        tenant_id = await cls.validate_tenant_access(user)
        user_id = user.get("id") or user.get("userId")
        
        logger.info(f"[KNOWLEDGE] Listing configs for tenant: {tenant_id}, user: {user_id}")
        
        try:
            docs = await MongoStorageService.find_many(
                "knowledgeConfig",
                {"userId": user_id},
                tenant_id=tenant_id,
                sort_field="name",
                sort_order=1
            )
            
            configs = []
            for doc in docs:
                config = {
                    "id": str(doc["_id"]),
                    "name": doc.get("name"),
                    "description": doc.get("description", ""),
                    "chunker": doc.get("chunker", {}),
                    "created_at": doc.get("created_at"),
                    "updated_at": doc.get("updated_at"),
                    "file_count": doc.get("file_count", 0)
                }
                configs.append(config)
            
            logger.info(f"[KNOWLEDGE] Found {len(configs)} configurations")
            return configs
            
        except Exception as e:
            logger.error(f"[KNOWLEDGE] Failed to list configs: {e}")
            raise HTTPException(status_code=500, detail="Failed to retrieve knowledge configurations")
    
    @classmethod
    async def get_knowledge_config(cls, collection_name: str, user: dict) -> Dict[str, Any]:
        """Get specific knowledge configuration"""
        tenant_id = await cls.validate_tenant_access(user)
        user_id = user.get("id") or user.get("userId")
        
        try:
            doc = await MongoStorageService.find_one(
                "knowledgeConfig",
                {"userId": user_id, "name": collection_name},
                tenant_id=tenant_id
            )
            
            if not doc:
                raise HTTPException(status_code=404, detail="Knowledge configuration not found")
            
            config = {
                "id": str(doc["_id"]),
                "name": doc.get("name"),
                "description": doc.get("description", ""),
                "chunker": doc.get("chunker", {}),
                "created_at": doc.get("created_at"),
                "updated_at": doc.get("updated_at"),
                "file_count": doc.get("file_count", 0)
            }
            
            return config
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"[KNOWLEDGE] Failed to get config {collection_name}: {e}")
            raise HTTPException(status_code=500, detail="Failed to retrieve knowledge configuration")
    
    @classmethod
    async def create_knowledge_config(cls, config_data: Dict[str, Any], user: dict) -> Dict[str, str]:
        """Create new knowledge configuration"""
        tenant_id = await cls.validate_tenant_access(user)
        user_id = user.get("id") or user.get("userId")
        
        name = config_data.get("name", "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="Configuration name is required")
        
        logger.info(f"[KNOWLEDGE] Creating config '{name}' for tenant: {tenant_id}, user: {user_id}")
        
        try:
            # Check if config already exists
            existing = await MongoStorageService.find_one(
                "knowledgeConfig",
                {"userId": user_id, "name": name},
                tenant_id=tenant_id
            )
            
            if existing:
                raise HTTPException(status_code=409, detail="Configuration with this name already exists")
            
            # Create configuration record
            record = {
                "userId": user_id,
                "name": name,
                "description": config_data.get("description", ""),
                "chunker": config_data.get("chunker", {}),
                "file_count": 0
            }
            
            await MongoStorageService.insert_one("knowledgeConfig", record, tenant_id=tenant_id)
            
            # Initialize vector collection
            await cls._initialize_vector_collection(tenant_id, user_id, name)
            
            logger.info(f"[KNOWLEDGE] Successfully created config '{name}'")
            return {"message": "Knowledge configuration created", "name": name}
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"[KNOWLEDGE] Failed to create config '{name}': {e}")
            raise HTTPException(status_code=500, detail="Failed to create knowledge configuration")
    
    @classmethod
    async def update_knowledge_config(cls, collection_name: str, config_data: Dict[str, Any], user: dict) -> Dict[str, str]:
        """Update existing knowledge configuration"""
        tenant_id = await cls.validate_tenant_access(user)
        user_id = user.get("id") or user.get("userId")
        
        logger.info(f"[KNOWLEDGE] Updating config '{collection_name}' for tenant: {tenant_id}")
        
        try:
            update_data = {}
            
            # Only update allowed fields
            allowed_fields = ["description", "chunker"]
            for field in allowed_fields:
                if field in config_data:
                    update_data[field] = config_data[field]
            
            result = await MongoStorageService.update_one(
                "knowledgeConfig",
                {"userId": user_id, "name": collection_name},
                update_data,
                tenant_id=tenant_id
            )
            
            if not result:
                raise HTTPException(status_code=404, detail="Knowledge configuration not found")
            
            logger.info(f"[KNOWLEDGE] Successfully updated config '{collection_name}'")
            return {"message": "Knowledge configuration updated"}
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"[KNOWLEDGE] Failed to update config '{collection_name}': {e}")
            raise HTTPException(status_code=500, detail="Failed to update knowledge configuration")

    @classmethod
    async def delete_knowledge_config(cls, name: str, user: dict) -> dict:
        """Delete a knowledge collection configuration"""
        tenant_id = await cls.validate_tenant_access(user)
        user_id = user.get("id") or user.get("userId")
        
        logger.info(f"[KNOWLEDGE] Deleting config '{name}' for tenant: {tenant_id}")
        
        try:
            # Delete configuration
            result = await MongoStorageService.delete_one(
                "knowledgeConfig",
                {"userId": user_id, "name": name},
                tenant_id=tenant_id
            )
            
            if not result:
                raise HTTPException(status_code=404, detail="Knowledge configuration not found")
            
            # Delete vector collection
            await cls._delete_vector_collection(tenant_id, user_id, name)
            
            logger.info(f"[KNOWLEDGE] Successfully deleted config '{name}'")
            return {"message": f"Knowledge configuration '{name}' deleted"}
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"[KNOWLEDGE] Failed to delete config '{name}': {e}")
            raise HTTPException(status_code=500, detail="Failed to delete knowledge configuration")
    
    @classmethod
    async def _initialize_vector_collection(cls, tenant_id: str, user_id: str, collection: str):
        """Initialize a new vector database collection for this knowledge collection"""
        try:
            await VectorService.create_collection(user_id, collection)
            logger.info(f"[KNOWLEDGE] Initialized vector collection for: {collection}")
            
        except Exception as e:
            logger.error(f"[KNOWLEDGE] Failed to initialize vector collection {collection}: {e}")
            raise
    
    @classmethod
    async def _delete_vector_collection(cls, tenant_id: str, user_id: str, collection: str):
        """Delete a vector database collection"""
        try:
            await VectorService.delete_collection(user_id, collection)
            logger.info(f"[KNOWLEDGE] Deleted vector collection for: {collection}")
            
        except Exception as e:
            logger.error(f"[KNOWLEDGE] Failed to delete vector collection {collection}: {e}")
            # Don't raise exception for cleanup operations
    
    @classmethod
    async def search_knowledge(cls, user: dict, collection: str, query: str, limit: int = 5) -> List[Dict[str, Any]]:
        """Search for documents in the vector database"""
        try:
            user_id = user.get("id")
            if not user_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="User ID missing from token"
                )
            
            # Use VectorService for search
            results = await VectorService.search(user_id, collection, query, limit)
            logger.info(f"[KNOWLEDGE] Found {len(results)} results for query in collection {collection}")
            return results
            
        except Exception as e:
            logger.error(f"[KNOWLEDGE] Failed to search knowledge in collection {collection}: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Knowledge search failed: {str(e)}"
            )
    
    @classmethod
    async def upload_files(cls, user: dict, files: List[UploadFile], knowledge_collection: str):
        """Upload files to MinIO and index them in vector database using FileService"""
        tenant_id = await cls.validate_tenant_access(user)
        user_id = user.get("id")
        
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User ID missing from token"
            )
        
        # Validate knowledge collection exists
        config = await cls.get_knowledge_config(knowledge_collection, user)
        if not config:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Knowledge collection '{knowledge_collection}' not found"
            )
        
        logger.info(f"[KNOWLEDGE] Uploading {len(files)} files for collection: {knowledge_collection}")
        
        try:
            # Upload files using FileService
            upload_result = await FileService.upload_multiple_files(files, tenant_id, user_id, knowledge_collection)
            
            uploaded_files = upload_result.get("uploaded_files", [])
            
            # Index each uploaded file to vector database
            for file_info in uploaded_files:
                try:
                    # Get the file content from MinIO for indexing
                    file_content = await FileService.get_file_content(file_info["file_path"])
                    
                    # Index to vector database using VectorService
                    await VectorService.index_file(
                        user_id, knowledge_collection,
                        file_info["filename"], file_content, file_info["file_path"]
                    )
                    
                    logger.info(f"[KNOWLEDGE] Successfully indexed: {file_info['filename']}")
                    
                except Exception as e:
                    logger.error(f"[KNOWLEDGE] Failed to index {file_info['filename']}: {e}")
                    # Continue with other files even if one indexing fails
                    
            response = {
                "message": f"Successfully uploaded {len(uploaded_files)} files",
                "files": uploaded_files
            }
            
            # Include any upload errors from FileService
            if "errors" in upload_result:
                response["errors"] = upload_result["errors"]
                
            return response
            
        except Exception as e:
            logger.error(f"[KNOWLEDGE] File upload failed: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"File upload failed: {str(e)}"
            )
    
    @classmethod
    async def list_categories(cls, user: dict) -> List[str]:
        """List knowledge categories for current tenant"""
        tenant_id = await cls.validate_tenant_access(user)
        
        try:
            categories = await MongoStorageService.distinct("knowledgeConfig", "category", {}, tenant_id=tenant_id)
            return sorted(categories)
        except Exception as e:
            logger.error(f"[KNOWLEDGE] Failed to list categories: {e}")
            raise HTTPException(status_code=500, detail="Failed to list categories")
    
    @classmethod
    async def introspect_component(cls, module_name: str) -> Dict[str, Any]:
        """Introspect a chunking component to get its parameters"""
        logger.info(f"[KNOWLEDGE] Introspecting component: {module_name}")
        
        try:
            component_name = module_name.split('.')[-1]
            class_info = get_detailed_class_info(module_name, component_name)
            
            if not class_info:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"No class information found for {module_name}"
                )

            # Flatten formatted_params for frontend compatibility (like ModelConfig)
            # If only one class, put its formatted_params at top level
            if "classes" in class_info and class_info["classes"]:
                first_class = next(iter(class_info["classes"].values()))
                class_info["class_name"] = first_class.get("class_name", "")
                class_info["formatted_params"] = first_class.get("formatted_params", [])

            return class_info
            
        except Exception as e:
            logger.error(f"[KNOWLEDGE] Failed to introspect {module_name}: {e}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Failed to introspect module '{module_name}'"
            )
    
    @classmethod
    async def upsert_knowledge_config(cls, user: dict, payload: dict) -> dict:
        """Create or update a knowledge collection configuration"""
        from datetime import datetime
        
        tenant_id = await cls.validate_tenant_access(user)
        user_id = user.get("id") or user.get("userId") or "unknown"
        
        name = (payload.get("name") or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="name is required")

        record = {
            "name": name,
            "category": payload.get("category", ""),
            "chunk_strategy": payload.get("chunk_strategy", ""),
            "chunk_strategy_params": payload.get("chunk_strategy_params", {}),
            "chunk_size": payload.get("chunk_size", 5000),
            "chunk_overlap": payload.get("chunk_overlap", 0),
            "add_context": payload.get("add_context", True),
            "search_knowledge": payload.get("search_knowledge", True),
            "files": payload.get("files", []),
            "tenantId": tenant_id,
            "userId": user_id,
            "updated_at": datetime.utcnow(),
        }

        
        # Create vs update
        existing = await MongoStorageService.find_one("knowledgeConfig", {"name": name}, tenant_id=tenant_id)
        if existing:
            await MongoStorageService.update_one("knowledgeConfig", {"_id": existing["_id"]}, {"$set": record}, tenant_id=tenant_id)
            action = "updated"
        else:
            record["created_at"] = datetime.utcnow()
            await MongoStorageService.insert_one("knowledgeConfig", record, tenant_id=tenant_id)
            action = "created"
            
            # Initialize vector collection for new knowledge config
            try:
                await cls._initialize_vector_collection(tenant_id, user_id, name)
            except Exception as e:
                logger.error(f"[KNOWLEDGE] Failed to initialize vector collection for {name}: {e}")
                # Don't fail the entire operation for vector DB issues

        return {"message": f"Collection {action}", "name": name}
    
    @classmethod
    async def delete_knowledge_config(cls, user: dict, name: str) -> dict:
        """Delete a knowledge collection configuration"""
        tenant_id = await cls.validate_tenant_access(user)
        user_id = user.get("id") or user.get("userId") or "unknown"
        
        
        # Check if config exists
        existing = await MongoStorageService.find_one("knowledgeConfig", {"name": name}, tenant_id=tenant_id)
        if not existing:
            raise HTTPException(status_code=404, detail="Collection not found")
        
        # Delete from MongoDB
        result = await MongoStorageService.delete_one("knowledgeConfig", {"name": name}, tenant_id=tenant_id)
        
        # Delete vector collection
        try:
            await cls._delete_vector_collection(tenant_id, user_id, name)
        except Exception as e:
            logger.error(f"[KNOWLEDGE] Failed to delete vector collection for {name}: {e}")
            # Don't fail the entire operation for vector DB cleanup issues
        
        return {"message": f"Collection '{name}' deleted"}
    
    @classmethod
    async def get_defaults(cls, user: dict) -> Dict[str, Any]:
        """Return global defaults for knowledge chunking configuration"""
        defaults = {
            "chunk_size": int(os.getenv("KNOWLEDGE_CHUNK_SIZE", "5000")),
            "chunk_overlap": int(os.getenv("KNOWLEDGE_CHUNK_OVERLAP", "0")),
            "add_context": os.getenv("KNOWLEDGE_ADD_CONTEXT", "true").lower() == "true",
            "search_knowledge": os.getenv("KNOWLEDGE_SEARCH", "true").lower() == "true",
        }
        return {"defaults": defaults}
    
    @classmethod
    async def list_categories(cls, user: dict) -> Dict[str, List[str]]:
        """Return distinct knowledge categories for the user's tenant"""
        tenant_id = await cls.validate_tenant_access(user)
        
        try:
            logger.debug(f"[KNOWLEDGE] Getting categories for tenant: {tenant_id}")
            cats = await MongoStorageService.distinct("knowledgeConfig", "category", {}, tenant_id=tenant_id)
            # filter out empty
            categories = [c for c in cats if c]
            return {"categories": categories}
        except Exception as e:
            logger.error(f"[KNOWLEDGE] Database error in list_categories: {str(e)}")
            import traceback
            logger.error(f"[KNOWLEDGE] Categories traceback: {traceback.format_exc()}")
            raise
    
    @classmethod
    async def list_collections(cls, user: dict) -> Dict[str, List[str]]:
        """List knowledge collections for current tenant"""
        tenant_id = await cls.validate_tenant_access(user)
        
        try:
            logger.debug(f"[KNOWLEDGE] Getting collections list for tenant: {tenant_id}")
            docs = await MongoStorageService.find_many("knowledgeConfig", {}, tenant_id=tenant_id, projection={"collection": 1}, sort_field="collection", sort_order=1)
            collections_list = sorted({d.get("collection") for d in docs if d.get("collection")})
            return {"collections": list(collections_list)}
        except Exception as e:
            logger.error(f"[KNOWLEDGE] Database error in list_collections: {str(e)}")
            import traceback
            logger.error(f"[KNOWLEDGE] Collections traceback: {traceback.format_exc()}")
            raise
    
    @classmethod
    async def get_collection(cls, collection_name: str, user: dict) -> Dict[str, Any]:
        """Get collection details with files from MinIO"""
        tenant_id = await cls.validate_tenant_access(user)
        
        doc = await MongoStorageService.find_one(
            "knowledgeConfig", 
            {"collection": collection_name}, 
            tenant_id=tenant_id
        )
        if not doc:
            raise HTTPException(status_code=404, detail="collection not found")

        # Load files from MinIO (fallback if not in doc)
        if "files" not in doc or not doc.get("files"):
            try:
                # If ownerId saved in doc use it, else current user
                owner_id = doc.get("ownerId") or user.get("id")
                path_prefix = f"uploads/{tenant_id}/{owner_id}/{collection_name}/"
                
                file_names = await FileService.list_files_by_prefix(path_prefix)
                doc["files"] = file_names
            except Exception as e:
                logger.warning(f"[KNOWLEDGE] MinIO listing failed for collection {collection_name}: {e}")
                if "files" not in doc:
                    doc["files"] = []

        # shape compatible with UI
        owner_id = doc.get("ownerId") or user.get("id")
        return {
            "collection": doc.get("collection"),
            "vector_collection": doc.get("vector_collection", f"{doc.get('collection', '')}_user@{owner_id}"),
            "category": doc.get("category", ""),
            "chunk": doc.get("chunk", {}),
            "embedder": doc.get("embedder", {}),  # Include embedder field from MongoDB
            "created_at": doc.get("created_at"),
            "updated_at": doc.get("updated_at"),
            "files": doc.get("files", []),  # Return files as stored in MongoDB without path
            "doc_counts": doc.get("doc_counts", {}),
            "files_by_type": doc.get("files_by_type", {}),
            "file_count": len(doc.get("files", [])),
        }
    
    @classmethod
    async def save_collection(cls, payload: dict, user: dict) -> Dict[str, Any]:
        """Create or update a knowledge collection configuration in MongoDB and trigger indexing"""
        tenant_id = await cls.validate_tenant_access(user)
        user_id = user.get("id")
        if not user_id or not user_id.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User ID missing. Please re-login."
            )

        collection_name = payload.get("collection") or payload.get("name")
        if not collection_name or not collection_name.strip():
            raise HTTPException(status_code=400, detail="collection is required")

        # Clean collection name (remove special characters that might cause issues)
        collection_name = collection_name.strip()

        overwrite = bool(payload.get("overwrite"))
        now_ms = int(datetime.utcnow().timestamp() * 1000)

        doc = await MongoStorageService.find_one(
            "knowledgeConfig", 
            {"collection": collection_name}, 
            tenant_id=tenant_id
        )
        if doc and not overwrite:
            return {"exists": True, "message": "collection exists"}

        # Create vector collection name for storage in MongoDB
        vector_collection_name = f"{collection_name}_user@{user_id}"

        # Accept frontend structure as-is and only add required backend fields
        record = dict(payload)  # Preserve original structure
        record.update({
            "tenantId": tenant_id,
            "ownerId": user_id,
            "collection": collection_name,
            "vector_collection": vector_collection_name,
            "updated_at": now_ms,
        })
        
        if not doc:
            record["created_at"] = now_ms

        # Upsert
        await MongoStorageService.update_one(
            "knowledgeConfig",
            {"collection": collection_name},
            record,
            tenant_id=tenant_id,
            upsert=True
        )

        # If this is a new collection creation, initialize vector DB collection
        if not doc:
            try:
                await cls._initialize_vector_collection(tenant_id, user_id, collection_name)
            except Exception as e:
                logger.error(f"[KNOWLEDGE] Failed to initialize vector collection: {e}")
                # Don't fail the entire operation for vector DB issues

        return {"ok": True, "collection": collection_name, "vector_collection": vector_collection_name}

    @classmethod  
    async def delete_collection(cls, collection_name: str, user: dict) -> Dict[str, Any]:
        """Delete knowledge collection configuration and vector collection"""
        tenant_id = await cls.validate_tenant_access(user)
        user_id = user.get("id")
        if not user_id or not user_id.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User ID missing. Please re-login."
            )
        
        result = await MongoStorageService.delete_one(
            "knowledgeConfig", 
            {"collection": collection_name}, 
            tenant_id=tenant_id
        )
        if not result:
            raise HTTPException(status_code=404, detail="collection not found")
        
        # Also try to delete the vector DB collection
        try:
            await cls._delete_vector_collection(tenant_id, user_id, collection_name)
        except Exception as e:
            logger.warning(f"[KNOWLEDGE] Failed to delete vector collection: {e}")
        
        return {"deleted": True, "collection": collection_name, "vector_collection": f"{collection_name}_user@{user_id}"}
    
    @classmethod
    async def delete_file_from_collection(cls, collection_name: str, filename: str, user: dict) -> Dict[str, Any]:
        """Delete a specific file from a knowledge collection"""
        tenant_id = await cls.validate_tenant_access(user)
        user_id = user.get("id")
        if not user_id or not user_id.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User ID missing. Please re-login."
            )
        
        logger.info(f"[KNOWLEDGE] Deleting file '{filename}' from collection '{collection_name}' for tenant {tenant_id}, user {user_id}")
        
        try:
            # Construct the file path in MinIO
            file_path = f"uploads/{tenant_id}/{user_id}/{collection_name}/{filename}"
            
            # Delete the file from MinIO using FileService
            success = await FileService.delete_file_at_path(file_path)
            
            if not success:
                logger.error(f"[KNOWLEDGE] Failed to delete file '{filename}' from MinIO at path: {file_path}")
                raise HTTPException(status_code=500, detail=f"Failed to delete file: {filename}")
            
            # TODO: Also remove the file's embeddings from the vector database
            # This would require identifying and deleting specific vectors based on file metadata
            
            # Remove the file from the MongoDB collection's files array
            await MongoStorageService.update_one(
                "knowledgeConfig",
                {"collection": collection_name},
                {"$pull": {"files": filename}},
                tenant_id=tenant_id
            )
            
            logger.info(f"[KNOWLEDGE] Successfully deleted file '{filename}' from collection '{collection_name}'")
            return {"deleted": True, "filename": filename, "collection": collection_name}
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"[KNOWLEDGE] Error deleting file '{filename}': {e}")
            raise HTTPException(status_code=500, detail=f"Failed to delete file: {filename}")
    
    @classmethod
    async def upload_knowledge_files(cls, collection_name: str, files: List[UploadFile], user: dict) -> Dict[str, Any]:
        """Upload files to MinIO under uploads/tenantId/userId/collection/ and index them"""
        from io import BytesIO
        
        if not files:
            raise HTTPException(status_code=400, detail="No files provided")

        tenant_id = await cls.validate_tenant_access(user)
        user_id = user.get("id")
        if not user_id or not user_id.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User ID missing. Cannot upload files without user ID."
            )

        if not collection_name or not collection_name.strip():
            raise HTTPException(status_code=400, detail="Collection name is required")

        # Clean the collection name
        collection_name = collection_name.strip()

        # Constants
        ALLOWED_TYPES = {
            'application/pdf',
            'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/plain', 'text/csv', 'application/json',
            'text/x-python', 'application/javascript', 'text/javascript',
        }
        MAX_FILE_SIZE = 200 * 1024 * 1024

        try:
            # First, upload all files to MinIO
            results = []
            base_path = f"uploads/{tenant_id}/{user_id}/{collection_name}"

            for f in files:
                if f.content_type and f.content_type not in ALLOWED_TYPES:
                    raise HTTPException(status_code=400, detail=f"File type not allowed: {f.filename}")

                content = await f.read()
                if len(content) > MAX_FILE_SIZE:
                    raise HTTPException(status_code=400, detail=f"File too large: {f.filename}")

                # Use plain filename without timestamp
                object_name = f"{base_path}/{f.filename}"
                
                # Check if file already exists
                file_exists = await FileService.check_file_exists(object_name)
                warning_message = None
                if file_exists:
                    warning_message = f"File '{f.filename}' already exists and will be overwritten"
                    logger.warning(f"[KNOWLEDGE] File '{f.filename}' already exists at {object_name}. Overwriting existing file.")
                
                # Upload file
                await FileService.upload_file_content(object_name, content, f.content_type)

                result_item = {
                    "filename": f.filename,
                    "size": len(content),
                    "key": object_name,
                    "content": content,  # Keep content for indexing
                }
                
                if warning_message:
                    result_item["warning"] = warning_message
                    
                results.append(result_item)

            # Update the MongoDB collection with file information first (before indexing)
            vector_collection_name = f"{collection_name}_user@{user_id}"
            
            try:
                await MongoStorageService.update_one(
                    "knowledgeConfig",
                    {"collection": collection_name},
                    {
                        "$addToSet": {"files": {"$each": [r["filename"] for r in results]}},
                        "$set": {
                            "updated_at": int(datetime.utcnow().timestamp() * 1000),
                            "vector_collection": vector_collection_name,
                        }
                    },
                    tenant_id=tenant_id,
                    upsert=True
                )
                logger.info(f"[KNOWLEDGE] Updated MongoDB collection config for {collection_name}")
            except Exception as db_error:
                logger.error(f"[KNOWLEDGE] Failed to update MongoDB collection config: {db_error}")
                # Continue with indexing even if MongoDB update fails

            # Now attempt batch indexing (but don't fail upload if indexing fails)
            indexed_files = []
            indexing_errors = []
            
            # Try batch indexing first for better performance
            try:
                file_keys = [r["key"] for r in results]
                logger.info(f"[KNOWLEDGE] Attempting batch indexing of {len(file_keys)} files")
                
                # Get MinIO client for batch processing
                minio_client = FileService._get_client()
                
                total_docs = await VectorService.index_files_batch(
                    user_id=user_id,
                    collection=collection_name,
                    files=file_keys,
                    vector_collection=vector_collection_name,
                    chunk=1024,
                    category=None,
                    minio_client=minio_client
                )
                
                # If batch indexing succeeds, mark all files as indexed
                indexed_files = [r["filename"] for r in results]
                logger.info(f"[KNOWLEDGE] Batch indexing successful: {total_docs} documents indexed")
                
            except Exception as batch_error:
                logger.warning(f"[KNOWLEDGE] Batch indexing failed, falling back to individual indexing: {batch_error}")
                
                # Fall back to individual file indexing
                for file_result in results:
                    try:
                        success = await VectorService.index_file(
                            user_id=user_id,
                            collection=collection_name,
                            filename=file_result["filename"],
                            content=file_result["content"],
                            file_path=file_result["key"]
                        )
                        if success:
                            indexed_files.append(file_result["filename"])
                            logger.info(f"[KNOWLEDGE] Successfully indexed file: {file_result['filename']}")
                        else:
                            indexing_errors.append(f"Failed to index {file_result['filename']}: Unknown error")
                            logger.warning(f"[KNOWLEDGE] Failed to index file {file_result['filename']}: Unknown error")
                    except Exception as e:
                        error_msg = f"Failed to index {file_result['filename']}: {str(e)}"
                        indexing_errors.append(error_msg)
                        logger.error(f"[KNOWLEDGE] {error_msg}")

            # Remove content from results before returning (too large for response)
            for result in results:
                result.pop("content", None)

            response = {
                "uploaded": results, 
                "collection": collection_name,
                "vector_collection": vector_collection_name,
                "indexed_files": indexed_files,
                "tenant_id": tenant_id,
                "user_id": user_id
            }
            
            # Include indexing errors if any occurred
            if indexing_errors:
                response["indexing_errors"] = indexing_errors
                response["warning"] = f"Files uploaded successfully but {len(indexing_errors)} indexing errors occurred"
            
            return response

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"[KNOWLEDGE] Upload failed: {e}")
            raise HTTPException(status_code=500, detail="Upload failed")
    
    @classmethod
    async def get_diagnostics(cls) -> Dict[str, Any]:
        """Get knowledge service diagnostics"""
        try:
            from minio import Minio
            minio_status = "ok"
        except Exception as e:
            minio_status = f"missing: {e}"
        
        return {
            "minioImport": minio_status,
            "endpoint": os.getenv("MINIO_ENDPOINT", "127.0.0.1:8803"),
            "bucket": os.getenv("MINIO_BUCKET", "hcp"),
        }
    
    @classmethod
    async def get_collection_info(cls, user: dict, collection: str) -> Dict[str, Any]:
        """Get information about a vector collection"""
        try:
            user_id = user.get("id")
            if not user_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="User ID missing from token"
                )
            
            # Get collection statistics from VectorService
            stats = await VectorService.get_collection_stats(user_id, collection)
            return stats
            
        except Exception as e:
            logger.error(f"[KNOWLEDGE] Failed to get collection info for {collection}: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to get collection information: {str(e)}"
            )
