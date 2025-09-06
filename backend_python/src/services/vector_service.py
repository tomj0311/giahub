"""
Vector Service

This service handles all vector database operations including collection management,
document indexing, search, and vector database configurations.
"""

import os
import ast
import tempfile
import importlib
from pathlib import Path
from typing import List, Optional, Dict, Any
from fastapi import HTTPException, status

from ..utils.log import logger


class VectorService:
    """Service for managing vector database operations"""
    
    @staticmethod
    def _get_vector_collection_name(user_id: str, payload: dict) -> str:
        """Generate vector collection name in format: userid_collectionname"""
        return f"{payload['collection']}_{user_id}"
    
    @staticmethod
    async def _get_qdrant_client(user_id: str, collection: str):
        # Load embedder exactly like agent_util.py
        embedder_instance = None
        # Check if collection is a dictionary or object with embedder attribute
        if collection and isinstance(collection, dict) and 'embedder' in collection:
            config = collection['embedder']
            module_path = config.get("strategy")
            params = config.get("params", {})
            
            if module_path:
                try:
                    # Import the module
                    module = importlib.import_module(module_path)

                    # Extract the first class name from the module's source using AST
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
                        embedder_class = getattr(module, class_name)
                        embedder_instance = embedder_class(**params)
                except Exception as e:
                    embedder_instance = None
        
        if embedder_instance is None:
            logger.error("[VECTOR] No valid embedder configuration found, defaulting to OpenAIEmbedder")

        
        return {
            "host": os.getenv("QDRANT_HOST", "localhost"),
            "port": int(os.getenv("QDRANT_PORT", "8805")),
            "https": os.getenv("QDRANT_HTTPS", "false").lower() == "true",
            "api_key": os.getenv("QDRANT_API_KEY", None),
            "embedder": embedder_instance,
        }
    
    @classmethod
    async def get_vector_db_client(cls, user_id: str, payload: dict):
        """Get a vector database client for the specified user and collection"""
        from ai.vectordb.qdrant import Qdrant
        
        vector_collection_name = cls._get_vector_collection_name(user_id, payload)
        qdrant_config = await cls._get_qdrant_client(user_id, payload)
        
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
            "host": os.getenv("QDRANT_HOST", "localhost"),
            "port": int(os.getenv("QDRANT_PORT", "8805")),
            "https": os.getenv("QDRANT_HTTPS", "false").lower() == "true",
            "api_key": os.getenv("QDRANT_API_KEY", None),
        }
        
        return Qdrant(
            collection=collection,
            **qdrant_config
        )
    
    @classmethod
    async def delete_collection(cls, user_id: str, collection: str) -> bool:
        """Delete a vector database collection"""
        try:
            vector_collection_name = cls._get_vector_collection_name(user_id, collection)
            vector_db = await cls.get_vector_db_client(user_id, collection)
            
            # Delete the collection
            vector_db.delete()
            logger.info(f"[VECTOR] Deleted collection: {vector_collection_name}")
            return True
            
        except Exception as e:
            logger.error(f"[VECTOR] Failed to delete collection {collection} for user {user_id}: {e}")
            # Don't raise exception for cleanup operations
            return False
    
    @classmethod
    async def collection_exists(cls, user_id: str, collection: str) -> bool:
        """Check if a vector collection exists"""
        try:
            vector_db = await cls.get_vector_db_client(user_id, collection)
            return vector_db.exists()
        except Exception as e:
            logger.error(f"[VECTOR] Failed to check collection existence for {collection}: {e}")
            return False

    @classmethod
    async def index_knowledge_files(cls, user_id: str, collection: str, payload: dict) -> bool:
        """Index files from MinIO bucket to the vector database"""
        try:
            import tempfile
            from pathlib import Path
            from ..services.file_service import FileService
            
            vector_db = await cls.get_vector_db_client(user_id, payload)
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
                        
                        # Create appropriate knowledge base based on file type
                        knowledge_base = None
                        if file_ext in ['.pdf']:
                            knowledge_base = PDFKnowledgeBase(path=str(temp_path), vector_db=vector_db)
                        elif file_ext in ['.docx', '.doc']:
                            knowledge_base = DocxKnowledgeBase(path=str(temp_path), vector_db=vector_db)
                        elif file_ext in ['.txt', '.py', '.js', '.json', '.csv']:
                            knowledge_base = TextKnowledgeBase(path=str(temp_path), vector_db=vector_db)
                        else:
                            # Use combined knowledge base for unknown types
                            pdf_kb = PDFKnowledgeBase(path=str(temp_path), vector_db=vector_db)
                            text_kb = TextKnowledgeBase(path=str(temp_path), vector_db=vector_db)
                            docx_kb = DocxKnowledgeBase(path=str(temp_path), vector_db=vector_db)
                            knowledge_base = CombinedKnowledgeBase(sources=[pdf_kb, text_kb, docx_kb], vector_db=vector_db)
                        
                        if knowledge_base:
                            logger.info(f"[VECTOR] Loading file {filename} using knowledge base")
                            knowledge_base.load(recreate=False, upsert=True)
                            logger.info(f"[VECTOR] Successfully indexed {filename}")
                        else:
                            logger.error(f"[VECTOR] No suitable knowledge base found for {filename}")
                
                return True
                
        except Exception as e:
            logger.error(f"[VECTOR] Failed to index files: {e}")
            return False

    @classmethod
    async def search(cls, user_id: str, collection: str, query: str, limit: int = 5) -> List[Dict[str, Any]]:
        """Search for documents in the vector database"""
        try:
            vector_db = await cls.get_vector_db_client(user_id, collection)
            
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
            
            vector_collection_name = cls._get_vector_collection_name(user_id, collection)
            logger.info(f"[VECTOR] Found {len(search_results)} results for query in collection {vector_collection_name}")
            return search_results
            
        except Exception as e:
            logger.error(f"[VECTOR] Failed to search in collection {collection}: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Vector search failed: {str(e)}"
            )
    
    @classmethod
    async def delete_document(cls, user_id: str, collection: str, file_path: str) -> bool:
        """Delete a specific document from the vector database"""
        try:
            vector_db = await cls.get_vector_db_client(user_id, collection)
            
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
    async def get_collection_stats(cls, user_id: str, collection: str) -> Dict[str, Any]:
        """Get statistics about a vector collection"""
        try:
            vector_db = await cls.get_vector_db_client(user_id, collection)
            vector_collection_name = cls._get_vector_collection_name(user_id, collection)
            
            # Get collection info
            # Note: This depends on the vector DB implementation
            stats = {
                "collection_name": vector_collection_name,
                "exists": await cls.collection_exists(user_id, collection),
                # TODO: Add more stats like document count, size, etc.
            }
            
            return stats
            
        except Exception as e:
            logger.error(f"[VECTOR] Failed to get collection stats for {collection}: {e}")
            return {"error": str(e)}

    @classmethod
    async def list_collections(cls, user_id: str) -> List[str]:
        """List all vector collections for a user"""
        try:
            # This would require accessing the Qdrant client directly to list collections
            # For now, return empty list - this can be implemented based on needs
            logger.info(f"[VECTOR] Listing collections for user {user_id}")
            return []
            
        except Exception as e:
            logger.error(f"[VECTOR] Failed to list collections for user {user_id}: {e}")
            return []
