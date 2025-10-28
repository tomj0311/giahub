"""
FAISS-based VectorService (disk-only, no external server)

This service handles all vector database operations using FAISS including collection management,
document indexing, search, and vector database configurations.
"""

import os
import ast
import json
import pickle
import shutil
import importlib
import faiss
import numpy as np
from pathlib import Path
from typing import List, Dict, Any, Optional

from fastapi import HTTPException, status

from ..utils.log import logger


# ----------------------------------------------------------------------
# Helper – load embedder exactly like the original code
# ----------------------------------------------------------------------
def module_loader(module_path: str):
    """Load a module and return the first class found in it"""
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
            logger.info(f"[FAISS] module_loader found class {class_name} in {module_path}")
            return getattr(module, class_name)
        else:
            logger.error(f"[FAISS] module_loader could not find any class in {module_path}")
    except Exception as e:
        logger.error(f"[FAISS] module_loader failed for {module_path}: {e}")
    return None


# ----------------------------------------------------------------------
# FAISS VectorService
# ----------------------------------------------------------------------
class VectorService:
    """Service for managing FAISS vector database operations"""
    
    # ------------------------------------------------------------------
    # Disk layout configuration
    # ------------------------------------------------------------------
    ROOT = Path("./faiss_collections")
    ROOT.mkdir(parents=True, exist_ok=True)

    # ------------------------------------------------------------------
    # Helper methods
    # ------------------------------------------------------------------
    @staticmethod
    def _get_vector_collection_name(user_id: str, payload: dict) -> str:
        """Generate vector collection name in format: userid_collectionname"""
        return f"{payload['collection']}_{user_id}"
    
    @staticmethod
    def _coll_path(user_id: str, collection: str) -> Path:
        """Get the folder path for a user's collection on disk"""
        return VectorService.ROOT / f"{user_id}_{collection}"
    
    @staticmethod
    async def _get_embedder_config(user: dict, payload: dict):
        """Load embedder from model config by model_id"""
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
                            logger.info(f"[FAISS] Successfully loaded embedder from model config {model_id}")
                        except Exception as e:
                            logger.error(f"[FAISS] Failed to create embedder instance: {e}")
                            embedder_instance = None
                    else:
                        logger.error(f"[FAISS] Failed to load embedder class from {module_path}")
                else:
                    logger.error(f"[FAISS] No embedding config found in model {model_id}")
                    
            except Exception as e:
                logger.error(f"[FAISS] Failed to get model config {model_id}: {e}")
        
        if embedder_instance is None:
            logger.error("[FAISS] No valid embedder configuration found")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="No valid embedder configuration found"
            )
        
        return embedder_instance

    # ------------------------------------------------------------------
    # FAISS Client (FAISS index + metadata)
    # ------------------------------------------------------------------
    class _FAISSClient:
        """Internal FAISS client for managing index and metadata"""
        
        def __init__(self, folder: Path, embedder):
            self.folder = folder
            self.folder.mkdir(parents=True, exist_ok=True)
            self.index_path = folder / "index.faiss"
            self.meta_path = folder / "meta.pkl"
            self.embedder = embedder
            self.dim = None
            self.index: Optional[faiss.Index] = None
            self._load_or_create()

        def _load_or_create(self):
            """Load existing index or prepare to create new one"""
            if self.index_path.exists():
                try:
                    self.index = faiss.read_index(str(self.index_path))
                    with open(self.meta_path, "rb") as f:
                        meta = pickle.load(f)
                    self.dim = meta["dim"]
                    logger.info(f"[FAISS] Loaded index {self.folder.name} ({meta['count']} vectors, dim={self.dim})")
                except Exception as e:
                    logger.error(f"[FAISS] Failed to load existing index: {e}")
                    self.index = None
                    self.dim = None
            else:
                # First time – we will create index on first upsert
                self.index = None
                self.dim = None

        def _ensure_index(self, dim: int):
            """Create FAISS index if it doesn't exist"""
            if self.index is not None:
                return
            
            # Use IVF-PQ for fast & compact indexing
            # For small collections, start with simpler flat index
            nlist = max(100, int(np.sqrt(10_000)))  # heuristic for nlist
            m = 8  # number of subquantizers
            quantizer = faiss.IndexFlatL2(dim)
            self.index = faiss.IndexIVFPQ(quantizer, dim, nlist, m, 8)
            self.index.nprobe = 10  # trade-off speed/accuracy
            self.dim = dim
            logger.info(f"[FAISS] Created new IVF-PQ index with dim={dim}, nlist={nlist}")

        def upsert(self, texts: List[str], ids: List[str], metas: List[dict]):
            """Add or update vectors in the index"""
            if not texts:
                return

            # Embed texts
            vectors = self.embedder.encode(texts, batch_size=64, show_progress_bar=False)
            vectors = np.array(vectors).astype("float32")
            
            if self.dim is None:
                self.dim = vectors.shape[1]
                self._ensure_index(self.dim)

            # Train index if needed
            if not self.index.is_trained:
                logger.info(f"[FAISS] Training index with {len(vectors)} vectors")
                self.index.train(vectors)

            # Normalize vectors (helps with cosine similarity)
            faiss.normalize_L2(vectors)
            
            # Convert string IDs to integers for FAISS
            id_ints = np.array([hash(id_str) % (2**63) for id_str in ids], dtype=np.int64)
            
            # Add vectors to index
            self.index.add_with_ids(vectors, id_ints)

            # Persist metadata
            existing = {}
            if self.meta_path.exists():
                with open(self.meta_path, "rb") as f:
                    existing = pickle.load(f).get("docs", {})

            for id_str, txt, meta in zip(ids, texts, metas):
                existing[id_str] = {"text": txt, "meta": meta}

            with open(self.meta_path, "wb") as f:
                pickle.dump({"dim": self.dim, "count": len(existing), "docs": existing}, f)

            # Save index to disk
            faiss.write_index(self.index, str(self.index_path))
            logger.info(f"[FAISS] Upserted {len(texts)} chunks → {self.folder.name}")

        def search(self, query: str, limit: int = 5) -> List[Dict]:
            """Search for similar vectors"""
            if self.index is None or self.dim is None:
                logger.warning(f"[FAISS] No index available for search in {self.folder.name}")
                return []

            # Embed query
            q_vec = np.array(self.embedder.encode([query])).astype("float32")
            faiss.normalize_L2(q_vec)
            
            # Search
            D, I = self.index.search(q_vec, limit)

            # Load metadata
            if not self.meta_path.exists():
                return []
                
            with open(self.meta_path, "rb") as f:
                meta_data = pickle.load(f)
                docs = meta_data.get("docs", {})

            # Build results
            results = []
            for dist, idx in zip(D[0], I[0]):
                if idx == -1:
                    continue
                
                # Find the document by reverse-hashing (store mapping in meta)
                found = False
                for doc_id, doc_data in docs.items():
                    if hash(doc_id) % (2**63) == idx:
                        results.append({
                            "content": doc_data.get("text", ""),
                            "metadata": doc_data.get("meta", {}),
                            "name": doc_data.get("meta", {}).get("source", ""),
                            "score": float(dist),
                        })
                        found = True
                        break
                
                if not found:
                    logger.warning(f"[FAISS] Could not find document for index {idx}")
            
            return results

        def delete(self):
            """Delete the entire collection"""
            if self.folder.exists():
                shutil.rmtree(self.folder)
                logger.info(f"[FAISS] Deleted collection folder {self.folder.name}")

        def exists(self) -> bool:
            """Check if collection exists"""
            return self.folder.exists() and self.index_path.exists()

    # ------------------------------------------------------------------
    # Public API (matches original Qdrant-based VectorService)
    # ------------------------------------------------------------------
    
    @classmethod
    async def get_vector_db_client(cls, user: dict, payload: dict):
        """Get a FAISS vector database client for the specified user and collection"""
        user_id = user.get("id") or user.get("userId")
        folder = cls._coll_path(user_id, payload['collection'])

        embedder = await cls._get_embedder_config(user, payload)
        return cls._FAISSClient(folder, embedder)
    
    @classmethod
    def get_vector_db_client_with_collection(cls, collection: str):
        """Get a FAISS vector database client for the specified collection (no embedder)"""
        folder = cls.ROOT / collection
        
        # Dummy embedder for admin operations that don't need embedding
        class _DummyEmbedder:
            def encode(self, *args, **kwargs):
                raise RuntimeError("Dummy embedder – not meant for real operations")
        
        return cls._FAISSClient(folder, _DummyEmbedder())
    
    @classmethod
    async def delete_collection(cls, user: dict, collection: str) -> bool:
        """Delete a vector database collection"""
        try:
            user_id = user.get("id") or user.get("userId")
            folder = cls._coll_path(user_id, collection)
            
            if folder.exists():
                shutil.rmtree(folder)
                logger.info(f"[FAISS] Deleted collection: {folder.name}")
            return True
            
        except Exception as e:
            user_id = user.get("id") or user.get("userId")
            logger.error(f"[FAISS] Failed to delete collection {collection} for user {user_id}: {e}")
            return False
    
    @classmethod
    async def collection_exists(cls, user: dict, collection: str) -> bool:
        """Check if a vector collection exists"""
        try:
            user_id = user.get("id") or user.get("userId")
            folder = cls._coll_path(user_id, collection)
            return folder.exists() and (folder / "index.faiss").exists()
        except Exception as e:
            logger.error(f"[FAISS] Failed to check collection existence for {collection}: {e}")
            return False

    @classmethod
    async def index_knowledge_files(cls, user: dict, collection: str, payload: dict) -> bool:
        """Index files from MinIO bucket to the FAISS vector database"""
        try:
            import tempfile
            from pathlib import Path as PPath
            from ..services.file_service import FileService
            
            user_id = user.get("id") or user.get("userId")
            client: VectorService._FAISSClient = await cls.get_vector_db_client(user, payload)
            
            logger.info(f"[FAISS] Indexing files from MinIO to collection {user_id}_{collection}")
            
            # Use FileService to download files
            folder_path = f"uploads/{user_id}/{collection}"
            
            with tempfile.TemporaryDirectory() as temp_dir:
                temp_path = PPath(temp_dir)
                
                # Download all files using FileService
                file_keys = await FileService.list_files_at_path(folder_path)
                file_keys = [key for key in file_keys if not key.endswith('/')]
                for file_key in file_keys:
                    filename = PPath(file_key).name
                    if filename:
                        file_content = await FileService.get_file_content_from_path(file_key)
                        (temp_path / filename).write_bytes(file_content)
                
                # Process each downloaded file with knowledge base modules
                for temp_file_path in temp_path.iterdir():
                    if not temp_file_path.is_file():
                        continue
                    
                    filename = temp_file_path.name
                    file_ext = temp_file_path.suffix.lower()
                    
                    # Import knowledge base classes
                    from ai.knowledge.pdf import PDFKnowledgeBase
                    from ai.knowledge.text import TextKnowledgeBase
                    from ai.knowledge.docx import DocxKnowledgeBase
                    from ai.knowledge.combined import CombinedKnowledgeBase
                    
                    # Skip vector indexing for image files
                    image_extensions = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.tiff', '.tif'}
                    if file_ext in image_extensions:
                        logger.info(f"[FAISS] Skipping vector indexing for image file: {filename}")
                        continue
                    
                    # Create appropriate knowledge base based on file type
                    knowledge_base = None
                    
                    if file_ext in ['.pdf']:
                        try:
                            knowledge_base = PDFKnowledgeBase(path=str(temp_path), vector_db=None)
                        except Exception as e:
                            logger.warning(f"[FAISS] PDF processing failed for {filename}, falling back to text processing: {e}")
                            knowledge_base = TextKnowledgeBase(path=str(temp_path), vector_db=None)
                    elif file_ext in ['.docx', '.doc']:
                        knowledge_base = DocxKnowledgeBase(path=str(temp_path), vector_db=None)
                    elif file_ext in ['.txt', '.py', '.js', '.json', '.csv']:
                        knowledge_base = TextKnowledgeBase(path=str(temp_path), vector_db=None)
                    else:
                        # Use combined knowledge base for unknown types
                        text_kb = TextKnowledgeBase(path=str(temp_path), vector_db=None)
                        docx_kb = DocxKnowledgeBase(path=str(temp_path), vector_db=None)
                        sources = [text_kb, docx_kb]
                        
                        try:
                            pdf_kb = PDFKnowledgeBase(path=str(temp_path), vector_db=None)
                            sources.insert(0, pdf_kb)  # Add PDF processing if available
                        except Exception as e:
                            logger.warning(f"[FAISS] PDF processing not available for {filename}, using text/docx only: {e}")
                        
                        knowledge_base = CombinedKnowledgeBase(sources=sources, vector_db=None)
                    
                    if knowledge_base:
                        try:
                            logger.info(f"[FAISS] Loading file {filename} using knowledge base")
                            # Load and extract chunks
                            chunks = knowledge_base.load(recreate=False, upsert=False)
                            
                            # Prepare data for FAISS
                            texts = [c.get("page_content", "") for c in chunks]
                            # Use deterministic IDs: <filename>_<chunk_index>
                            ids = [f"{filename}_{i}" for i in range(len(texts))]
                            metas = [c.get("metadata", {}) for c in chunks]
                            
                            # Add source filename to metadata
                            for meta in metas:
                                meta["source"] = filename
                            
                            # Upsert to FAISS
                            client.upsert(texts, ids, metas)
                            logger.info(f"[FAISS] Successfully indexed {len(texts)} chunks from {filename}")
                            
                        except Exception as e:
                            logger.error(f"[FAISS] Failed to load knowledge base for {filename}: {e}")
                    else:
                        logger.error(f"[FAISS] No suitable knowledge base found for {filename}")
                
                return True
                
        except Exception as e:
            logger.error(f"[FAISS] Failed to index files: {e}")
            return False

    @classmethod
    async def search(cls, user: dict, collection: str, query: str, limit: int = 5) -> List[Dict[str, Any]]:
        """Search for documents in the FAISS vector database"""
        try:
            user_id = user.get("id") or user.get("userId")
            # Create payload dictionary for get_vector_db_client
            payload = {"collection": collection}
            client: VectorService._FAISSClient = await cls.get_vector_db_client(user, payload)
            
            # Perform search
            results = client.search(query, limit)
            
            logger.info(f"[FAISS] Found {len(results)} results for query in collection {user_id}_{collection}")
            return results
            
        except Exception as e:
            logger.error(f"[FAISS] Failed to search in collection {collection}: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Vector search failed: {str(e)}"
            )
    
    @classmethod
    async def delete_document(cls, user: dict, collection: str, file_path: str) -> bool:
        """
        Delete a specific document from the FAISS vector database.
        Note: FAISS does not support per-document deletion without rebuilding the index.
        This is a placeholder for future implementation.
        """
        try:
            user_id = user.get("id") or user.get("userId")
            logger.warning(f"[FAISS] Per-document delete not fully implemented for {file_path} in collection {user_id}_{collection}")
            logger.warning("[FAISS] Document deletion would require rebuilding the entire index")
            
            # TODO: Implement by:
            # 1. Loading all metadata
            # 2. Filtering out documents matching file_path
            # 3. Rebuilding the index with remaining documents
            
            return True
            
        except Exception as e:
            logger.error(f"[FAISS] Failed to delete document {file_path}: {e}")
            return False
    
    @classmethod
    async def get_collection_stats(cls, user: dict, collection: str) -> Dict[str, Any]:
        """Get statistics about a FAISS vector collection"""
        try:
            user_id = user.get("id") or user.get("userId")
            folder = cls._coll_path(user_id, collection)
            
            if not folder.exists():
                return {
                    "collection_name": f"{user_id}_{collection}",
                    "exists": False
                }
            
            meta_path = folder / "meta.pkl"
            if not meta_path.exists():
                return {
                    "collection_name": f"{user_id}_{collection}",
                    "exists": True,
                    "vector_count": 0
                }
            
            with open(meta_path, "rb") as f:
                meta = pickle.load(f)
            
            stats = {
                "collection_name": f"{user_id}_{collection}",
                "exists": True,
                "vector_count": meta.get("count", 0),
                "dimension": meta.get("dim"),
                "index_type": "FAISS IVF-PQ"
            }
            
            return stats
            
        except Exception as e:
            logger.error(f"[FAISS] Failed to get collection stats for {collection}: {e}")
            return {"error": str(e)}

    @classmethod
    async def list_collections(cls, user: dict) -> List[str]:
        """List all FAISS vector collections for a user"""
        try:
            user_id = user.get("id") or user.get("userId")
            prefix = f"{user_id}_"
            
            collections = [
                p.name[len(prefix):] for p in cls.ROOT.iterdir()
                if p.is_dir() and p.name.startswith(prefix)
            ]
            
            logger.info(f"[FAISS] Found {len(collections)} collections for user {user_id}")
            return collections
            
        except Exception as e:
            user_id = user.get("id") or user.get("userId")
            logger.error(f"[FAISS] Failed to list collections for user {user_id}: {e}")
            return []
