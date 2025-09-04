"""
Vector Service

This service handles all vector database operations including collection management,
document indexing, search, and vector database configurations.
"""

import os
import tempfile
from pathlib import Path
from typing import List, Optional, Dict, Any
from fastapi import HTTPException, status

from ..utils.log import logger


class VectorService:
    """Service for managing vector database operations"""
    
    @staticmethod
    def _get_vector_collection_name(user_id: str, collection: str) -> str:
        """Generate vector collection name in format: userid_collectionname"""
        return f"{user_id}_{collection}"
    
    @staticmethod
    def _get_qdrant_client():
        """Get configured Qdrant client"""
        from ai.vectordb.qdrant import Qdrant
        from ai.embedder.openai import OpenAIEmbedder
        
        return {
            "host": os.getenv("QDRANT_HOST", "localhost"),
            "port": int(os.getenv("QDRANT_PORT", "8805")),
            "https": os.getenv("QDRANT_HTTPS", "false").lower() == "true",
            "api_key": os.getenv("QDRANT_API_KEY", None),
            "embedder": OpenAIEmbedder()
        }
    
    @classmethod
    def get_vector_db_client(cls, user_id: str, collection: str):
        """Get a vector database client for the specified user and collection"""
        from ai.vectordb.qdrant import Qdrant
        
        vector_collection_name = cls._get_vector_collection_name(user_id, collection)
        qdrant_config = cls._get_qdrant_client()
        
        return Qdrant(
            collection=vector_collection_name,
            **qdrant_config
        )
    
    @classmethod
    def get_vector_db_client_with_collection(cls, collection: str):
        """Get a vector database client for the specified collection"""
        from ai.vectordb.qdrant import Qdrant
        
        qdrant_config = cls._get_qdrant_client()
        
        return Qdrant(
            collection=collection,
            **qdrant_config
        )
    
    @classmethod
    async def create_collection(cls, user_id: str, collection: str) -> bool:
        """Create a new vector database collection"""
        try:
            vector_collection_name = cls._get_vector_collection_name(user_id, collection)
            vector_db = cls.get_vector_db_client(user_id, collection)
            
            # Create the collection in Qdrant
            vector_db.create()
            logger.info(f"[VECTOR] Created collection: {vector_collection_name}")
            return True
            
        except Exception as e:
            logger.error(f"[VECTOR] Failed to create collection {collection} for user {user_id}: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to create vector collection: {str(e)}"
            )
    
    @classmethod
    async def delete_collection(cls, user_id: str, collection: str) -> bool:
        """Delete a vector database collection"""
        try:
            vector_collection_name = cls._get_vector_collection_name(user_id, collection)
            vector_db = cls.get_vector_db_client(user_id, collection)
            
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
            vector_db = cls.get_vector_db_client(user_id, collection)
            return vector_db.exists()
        except Exception as e:
            logger.error(f"[VECTOR] Failed to check collection existence for {collection}: {e}")
            return False

    @classmethod
    async def index_files_batch(cls, user_id: str, collection: str, files: List[str], 
                               vector_collection: str, chunk: int = 1024, category: str = None,
                               minio_client=None) -> int:
        """Index multiple files using knowledge bases"""
        try:
            vector_db = cls.get_vector_db_client(user_id, collection)
            total_files = len(files)
            
            # Count file types for logging
            file_types = {}
            for file_key in files:
                filename = Path(file_key).name
                ext = filename.split('.')[-1].lower() if '.' in filename else 'unknown'
                file_types[ext] = file_types.get(ext, 0) + 1

            logger.info(f"[VECTOR] Starting batch indexing of {total_files} files with types: {file_types}")

            # Download all files
            with tempfile.TemporaryDirectory() as temp_dir:
                temp_path = Path(temp_dir)
                
                for i, file_key in enumerate(files):
                    filename = Path(file_key).name
                    
                    logger.info(f"[VECTOR] Downloading file {i+1}/{total_files}: {filename}")
                        
                    file_data = minio_client.get_bytes(file_key, bucket="uploads")
                    local_path = temp_path / Path(file_key).name
                    local_path.write_bytes(file_data)
                
                logger.info("[VECTOR] All files downloaded, preparing knowledge bases")
                
                from ai.knowledge.pdf import PDFKnowledgeBase
                from ai.knowledge.text import TextKnowledgeBase
                from ai.knowledge.docx import DocxKnowledgeBase
                from ai.knowledge.combined import CombinedKnowledgeBase
                
                pdf_kb = PDFKnowledgeBase(path=str(temp_path), vector_db=vector_db)
                text_kb = TextKnowledgeBase(path=str(temp_path), vector_db=vector_db)
                docx_kb = DocxKnowledgeBase(path=str(temp_path), vector_db=vector_db)
                knowledge_base = CombinedKnowledgeBase(sources=[pdf_kb, text_kb, docx_kb], vector_db=vector_db)
                
                logger.info("[VECTOR] Starting indexing process")
                
                knowledge_base.load(recreate=False, upsert=True)
                
                logger.info("[VECTOR] Indexing complete, finalizing")
                
                # Get final document count
                collection_info = vector_db.client.get_collection(vector_collection)
                total_docs = collection_info.points_count
                
                # Save metadata
                try:
                    from ..utils.mongo_storage import knowledge_meta_save, knowledge_meta_get
                    meta = knowledge_meta_get(vector_collection) or {}
                    meta.update({
                        'collection': vector_collection,
                        'chunk': chunk,
                        'files': files,
                        'doc_count': total_docs,
                        'category': category  # Preserve the category
                    })
                    logger.info(f'[VECTOR] Final metadata save for collection: {vector_collection}, meta: {meta}')
                    knowledge_meta_save(vector_collection, meta)
                except Exception as e:
                    logger.error(f'[VECTOR] Save meta error for collection: {vector_collection}, error: {str(e)}')
                
                logger.info(f"[VECTOR] Batch indexing completed. Total documents: {total_docs}")
                return total_docs
                
        except Exception as e:
            logger.error(f"[VECTOR] Failed to index files batch for collection {collection}: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to index files batch: {str(e)}"
            )
    
    @classmethod
    async def index_file(cls, user_id: str, collection: str, filename: str, content: bytes, file_path: str) -> bool:
        """Index a single file to the vector database"""
        try:
            import tempfile
            from pathlib import Path
            
            vector_db = cls.get_vector_db_client(user_id, collection)
            vector_collection_name = cls._get_vector_collection_name(user_id, collection)
            
            logger.info(f"[VECTOR] Indexing file {filename} to collection {vector_collection_name}")
            
            # Create a temporary file for processing
            with tempfile.TemporaryDirectory() as temp_dir:
                temp_path = Path(temp_dir)
                file_ext = Path(filename).suffix.lower()
                
                # Write content to temporary file
                temp_file_path = temp_path / filename
                temp_file_path.write_bytes(content)
                
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
                    logger.info(f"[VECTOR] Successfully indexed file {filename}")
                    return True
                else:
                    logger.error(f"[VECTOR] No suitable knowledge base found for file {filename}")
                    return False
                
        except Exception as e:
            logger.error(f"[VECTOR] Failed to index file {filename}: {e}")
            return False

    @classmethod
    async def search(cls, user_id: str, collection: str, query: str, limit: int = 5) -> List[Dict[str, Any]]:
        """Search for documents in the vector database"""
        try:
            vector_db = cls.get_vector_db_client(user_id, collection)
            
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
            vector_db = cls.get_vector_db_client(user_id, collection)
            
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
            vector_db = cls.get_vector_db_client(user_id, collection)
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
