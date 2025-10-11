import platform
import numpy as np
from typing import Dict, List, Optional, Tuple, Union

from ai.embedder.base import Embedder
from ai.utils.log import logger

try:
    from sentence_transformers import SentenceTransformer

    if platform.system() == "Windows":
        numpy_version = np.__version__
        if numpy_version.startswith("2"):
            raise RuntimeError(
                "Incompatible NumPy version detected. Please install NumPy 1.x by running 'pip install numpy<2'."
            )
except ImportError:
    raise ImportError("sentence-transformers not installed, please run pip install sentence-transformers")


class SentenceTransformerEmbedder(Embedder):
    model: str = "sentence-transformers/all-mpnet-base-v2"  # 768 dimensions
    sentence_transformer_client: Optional[SentenceTransformer] = None
    target_dimensions: int = 1536  # Target dimension for compatibility with OpenAI embeddings
    pad_embeddings: bool = True  # Whether to pad embeddings to target dimensions

    def _pad_or_truncate_embedding(self, embedding: np.ndarray) -> List[float]:
        """
        Pad or truncate embedding to target dimensions for compatibility.
        """
        if not self.pad_embeddings:
            return embedding.tolist()
            
        current_dim = len(embedding)
        
        if current_dim == self.target_dimensions:
            return embedding.tolist()
        elif current_dim < self.target_dimensions:
            # Pad with zeros
            padded = np.zeros(self.target_dimensions)
            padded[:current_dim] = embedding
            logger.debug(f"Padded embedding from {current_dim} to {self.target_dimensions} dimensions")
            return padded.tolist()
        else:
            # Truncate
            truncated = embedding[:self.target_dimensions]
            logger.debug(f"Truncated embedding from {current_dim} to {self.target_dimensions} dimensions")
            return truncated.tolist()

    def get_embedding(self, text: Union[str, List[str]]) -> List[float]:
        if self.sentence_transformer_client is None:
            self.sentence_transformer_client = SentenceTransformer(model_name_or_path=self.model)
        
        try:
            embedding = self.sentence_transformer_client.encode(text)
            
            # Handle both single text and list of texts
            if isinstance(text, str):
                return self._pad_or_truncate_embedding(embedding)
            else:
                # For list of texts, process each embedding
                return [self._pad_or_truncate_embedding(emb) for emb in embedding]
                
        except Exception as e:
            logger.error(f"Error generating embedding: {e}")
            return []

    def get_embedding_and_usage(self, text: str) -> Tuple[List[float], Optional[Dict]]:
        return self.get_embedding(text=text), None
