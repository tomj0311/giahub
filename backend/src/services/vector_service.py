"""
Vector Service

This service handles all vector database operations including collection management,
document indexing, search, and vector database configurations.
"""

import os
import ast
import importlib
from pathlib import Path
from typing import List, Optional, Dict, Any
from fastapi import HTTPException, status

from ..utils.log import logger


def module_loader(module_path: str):
    if not module_path:
        return None
    try:
        module = importlib.import_module(module_path)
        module_file = getattr(module, "__file__", None)
        class_name = None
        if module_file and module_file.endswith(".py"):
            with open(module_file, 'r', encoding='utf-8') as file:
                tree = ast.parse(file.read())
            for node in ast.walk(tree):
                if isinstance(node, ast.ClassDef):
                    class_name = node.name
                    break
        if class_name:
            logger.info(f"[VECTOR] module_loader found class {class_name} in {module_path}")
            return getattr(module, class_name)
        else:
            logger.error(f"[VECTOR] module_loader could not find any class in {module_path}")
    except Exception as e:
        logger.error(f"[VECTOR] module_loader failed for {module_path}: {e}")
    return None


class VectorService:
    """Service for managing vector database operations"""
    
    @staticmethod
    def _get_vector_collection_name(user_id: str, payload: dict) -> str:
        """Generate vector collection name in format: userid_collectionname"""
        return f"{payload['collection']}_{user_id}"
    
    @staticmethod
    async def _get_qdrant_client(user: dict, payload: dict):
        # Load embedder from model config by model_id
        embedder_instance = None
        
        # Check if payload has model_id
        if payload and isinstance(payload, dict) and 'model_id' in payload:
            model_id = payload['model_id']
            try:
                from ..services.model_config_service import ModelConfigService
                
                # Get model config using the service with proper user context
                doc = await ModelConfigService.get_model_config_by_id(model_id, user)
                
                if doc and "embedding" in doc:
                    embedding_config = doc["embedding"]
                    module_path = embedding_config.get("strategy")
                    params = embedding_config.get("params", {})
                    
                    embedder_class = module_loader(module_path)
                    if embedder_class:
                        try:
                            embedder_instance = embedder_class(**params)
                            logger.info(f"[VECTOR] Successfully loaded embedder from model config {model_id}")
                        except Exception as e:
                            logger.error(f"[VECTOR] Failed to create embedder instance: {e}")
                            embedder_instance = None
                    else:
                        logger.error(f"[VECTOR] Failed to load embedder class from {module_path}")
                else:
                    logger.error(f"[VECTOR] No embedding config found in model {model_id}")
                    
            except Exception as e:
                logger.error(f"[VECTOR] Failed to get model config {model_id}: {e}")
        
        if embedder_instance is None:
            logger.error("[VECTOR] No valid embedder configuration found")

        
        return {
            "host": os.getenv("QDRANT_HOST"),
            "port": int(os.getenv("QDRANT_PORT")),
            "https": os.getenv("QDRANT_HTTPS", "false").lower() == "true",
            "api_key": os.getenv("QDRANT_API_KEY"),
            "embedder": embedder_instance,
        }
    
    @classmethod
    async def get_vector_db_client(cls, user: dict, payload: dict):
        """Get a vector database client for the specified user and collection"""
        from ai.vectordb.qdrant import Qdrant
        
        user_id = user.get("id") or user.get("userId")
        vector_collection_name = cls._get_vector_collection_name(user_id, payload)
        qdrant_config = await cls._get_qdrant_client(user, payload)
        
        return Qdrant(
            collection=vector_collection_name,
            **qdrant_config
        )
    
    @classmethod
    def get_vector_db_client_with_collection(cls, collection: str):
        """Get a vector database client for the specified collection"""
        from ai.vectordb.qdrant import Qdrant
        
        # Simple config without tenant-specific settings
        qdrant_config = {
            "host": os.getenv("QDRANT_HOST"),
            "port": int(os.getenv("QDRANT_PORT")),
            "https": os.getenv("QDRANT_HTTPS", "false").lower() == "true",
            "api_key": os.getenv("QDRANT_API_KEY"),
        }
        
        return Qdrant(
            collection=collection,
            **qdrant_config
        )
    
    @classmethod
    async def delete_collection(cls, user: dict, collection: str) -> bool:
        """Delete a vector database collection"""
        try:
            user_id = user.get("id") or user.get("userId")
            # Create payload dictionary for _get_vector_collection_name
            payload = {"collection": collection}
            vector_collection_name = cls._get_vector_collection_name(user_id, payload)
            vector_db = await cls.get_vector_db_client(user, payload)
            
            # Delete the collection
            vector_db.delete()
            logger.info(f"[VECTOR] Deleted collection: {vector_collection_name}")
            return True
            
        except Exception as e:
            user_id = user.get("id") or user.get("userId")
            logger.error(f"[VECTOR] Failed to delete collection {collection} for user {user_id}: {e}")
            # Don't raise exception for cleanup operations
            return False
    
    @classmethod
    async def collection_exists(cls, user: dict, collection: str) -> bool:
        """Check if a vector collection exists"""
        try:
            # Create payload dictionary for get_vector_db_client
            payload = {"collection": collection}
            vector_db = await cls.get_vector_db_client(user, payload)
            return vector_db.exists()
        except Exception as e:
            logger.error(f"[VECTOR] Failed to check collection existence for {collection}: {e}")
            return False

    @classmethod
    async def index_knowledge_files(cls, user: dict, collection: str, payload: dict) -> bool:
        """Index files from MinIO bucket to the vector database"""
        try:
            import tempfile
            from pathlib import Path
            from ..services.file_service import FileService
            
            user_id = user.get("id") or user.get("userId")
            vector_db = await cls.get_vector_db_client(user, payload)
            vector_collection_name = cls._get_vector_collection_name(user_id, payload)
            
            logger.info(f"[VECTOR] Indexing files from MinIO to collection {vector_collection_name}")
            
            # Use FileService to download files
            folder_path = f"uploads/{user_id}/{collection}"
            
            with tempfile.TemporaryDirectory() as temp_dir:
                temp_path = Path(temp_dir)
                
                # Download all files using FileService
                file_keys = await FileService.list_files_at_path(folder_path)
                file_keys = [key for key in file_keys if not key.endswith('/')]
                for file_key in file_keys:
                    filename = Path(file_key).name
                    if filename:
                        file_content = await FileService.get_file_content_from_path(file_key)
                        (temp_path / filename).write_bytes(file_content)
                
                # Process each downloaded file with knowledge base modules
                for temp_file_path in temp_path.iterdir():
                    if temp_file_path.is_file():
                        filename = temp_file_path.name
                        file_ext = temp_file_path.suffix.lower()
                        
                        # Import knowledge base classes
                        from ai.knowledge.pdf import PDFKnowledgeBase
                        from ai.knowledge.text import TextKnowledgeBase
                        from ai.knowledge.docx import DocxKnowledgeBase
                        from ai.knowledge.combined import CombinedKnowledgeBase
                        
                        # Load chunking strategy if present
                        chunking_strategy = None
                        # TODO semnatic chunking
                        # if payload and isinstance(payload, dict) and 'embedder' in payload:
                        #     embedder_config = payload['embedder']
                            
                        #     # Load embedder for chunking
                        #     embedder_instance = None
                        #     embedder_module_path = embedder_config.get("strategy")
                        #     embedder_params = embedder_config.get("params", {})
                        #     embedder_class = module_loader(embedder_module_path)
                        #     if embedder_class:
                        #         try:
                        #             embedder_instance = embedder_class(**embedder_params)
                        #         except Exception as e:
                        #             embedder_instance = None
                            
                        #     if 'chunk' in embedder_config:
                        #         chunk_config = embedder_config['chunk']
                        #         chunk_module_path = chunk_config.get("strategy")
                        #         chunk_params = chunk_config.get("params", {})
                        #         chunk_class = module_loader(chunk_module_path)
                        #         if chunk_class and embedder_instance:
                        #             try:
                        #                 chunking_strategy = chunk_class(embedder=embedder_instance, **chunk_params)
                        #             except Exception as e:
                        #                 chunking_strategy = None
                        
                        # Create appropriate knowledge base based on file type
                        knowledge_base = None
                        
                        # Skip vector indexing for image files
                        image_extensions = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.tiff', '.tif'}
                        if file_ext in image_extensions:
                            logger.info(f"[VECTOR] Skipping vector indexing for image file: {filename}")
                            continue
                        
                        if file_ext in ['.pdf']:
                            try:
                                knowledge_base = PDFKnowledgeBase(path=str(temp_path), vector_db=vector_db)
                            except Exception as e:
                                logger.warning(f"[VECTOR] PDF processing failed for {filename}, falling back to text processing: {e}")
                                knowledge_base = TextKnowledgeBase(path=str(temp_path), vector_db=vector_db)
                        elif file_ext in ['.docx', '.doc']:
                            knowledge_base = DocxKnowledgeBase(path=str(temp_path), vector_db=vector_db)
                        elif file_ext in ['.txt', '.py', '.js', '.json', '.csv']:
                            knowledge_base = TextKnowledgeBase(path=str(temp_path), vector_db=vector_db)
                        else:
                            # Use combined knowledge base for unknown types, but handle PDF failures gracefully
                            text_kb = TextKnowledgeBase(path=str(temp_path), vector_db=vector_db)
                            docx_kb = DocxKnowledgeBase(path=str(temp_path), vector_db=vector_db)
                            sources = [text_kb, docx_kb]
                            
                            try:
                                pdf_kb = PDFKnowledgeBase(path=str(temp_path), vector_db=vector_db)
                                sources.insert(0, pdf_kb)  # Add PDF processing if available
                            except Exception as e:
                                logger.warning(f"[VECTOR] PDF processing not available for {filename}, using text/docx only: {e}")
                            
                            knowledge_base = CombinedKnowledgeBase(sources=sources, vector_db=vector_db)
                        
                        if knowledge_base:
                            try:
                                logger.info(f"[VECTOR] Loading file {filename} using knowledge base")
                                knowledge_base.load(recreate=False, upsert=True)
                                logger.info(f"[VECTOR] Successfully indexed {filename}")
                            except Exception as e:
                                logger.error(f"[VECTOR] Failed to load knowledge base for {filename}: {e}")
                        else:
                            logger.error(f"[VECTOR] No suitable knowledge base found for {filename}")
                
                return True
                
        except Exception as e:
            logger.error(f"[VECTOR] Failed to index files: {e}")
            return False

    @classmethod
    async def search(cls, user: dict, collection: str, query: str, limit: int = 5) -> List[Dict[str, Any]]:
        """Search for documents in the vector database"""
        try:
            user_id = user.get("id") or user.get("userId")
            # Create payload dictionary for get_vector_db_client
            payload = {"collection": collection}
            vector_db = await cls.get_vector_db_client(user, payload)
            
            # Perform search
            results = vector_db.search(query, limit=limit)
            
            # Convert results to dictionary format
            search_results = []
            for doc in results:
                search_results.append({
                    "content": doc.content,
                    "metadata": doc.meta_data,
                    "name": doc.name,
                    "score": getattr(doc, 'score', None)
                })
            
            # Use the same payload format for consistency
            vector_collection_name = cls._get_vector_collection_name(user_id, payload)
            logger.info(f"[VECTOR] Found {len(search_results)} results for query in collection {vector_collection_name}")
            return search_results
            
        except Exception as e:
            logger.error(f"[VECTOR] Failed to search in collection {collection}: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Vector search failed: {str(e)}"
            )
    
    @classmethod
    async def delete_document(cls, user: dict, collection: str, file_path: str) -> bool:
        """Delete a specific document from the vector database"""
        try:
            user_id = user.get("id") or user.get("userId")
            # Create payload dictionary for get_vector_db_client
            payload = {"collection": collection}
            vector_db = await cls.get_vector_db_client(user, payload)
            
            # Delete document by file_path (used as document ID)
            # Note: This depends on the vector DB implementation supporting document deletion
            # For now, we'll log the operation
            logger.info(f"[VECTOR] Deleting document {file_path} from collection {user_id}_{collection}")
            
            # TODO: Implement actual document deletion based on Qdrant capabilities
            # vector_db.delete_document(file_path)
            
            return True
            
        except Exception as e:
            logger.error(f"[VECTOR] Failed to delete document {file_path}: {e}")
            return False
    
    @classmethod
    async def get_collection_stats(cls, user: dict, collection: str) -> Dict[str, Any]:
        """Get statistics about a vector collection"""
        try:
            user_id = user.get("id") or user.get("userId")
            # Create payload dictionary for get_vector_db_client
            payload = {"collection": collection}
            vector_db = await cls.get_vector_db_client(user, payload)
            vector_collection_name = cls._get_vector_collection_name(user_id, payload)
            
            # Get collection info
            # Note: This depends on the vector DB implementation
            stats = {
                "collection_name": vector_collection_name,
                "exists": await cls.collection_exists(user, collection),
                # TODO: Add more stats like document count, size, etc.
            }
            
            return stats
            
        except Exception as e:
            logger.error(f"[VECTOR] Failed to get collection stats for {collection}: {e}")
            return {"error": str(e)}

    @classmethod
    async def list_collections(cls, user: dict) -> List[str]:
        """List all vector collections for a user"""
        try:
            user_id = user.get("id") or user.get("userId")
            # This would require accessing the Qdrant client directly to list collections
            # For now, return empty list - this can be implemented based on needs
            logger.info(f"[VECTOR] Listing collections for user {user_id}")
            return []
            
        except Exception as e:
            user_id = user.get("id") or user.get("userId")
            logger.error(f"[VECTOR] Failed to list collections for user {user_id}: {e}")
            return []
