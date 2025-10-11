"""
SentenceTransformer Embeddings - Simplified interface
"""
from typing import Optional, Dict, List, Tuple, Any, Union

from ai.embedder.sentence_transformer import SentenceTransformerEmbedder


class SentenceTransformer(SentenceTransformerEmbedder):
    """
    Simplified SentenceTransformer Embedder interface with optional configuration parameters.
    This is a wrapper around SentenceTransformerEmbedder that exposes common parameters for easier configuration.
    """
    
    def __init__(
        self,
        # Core parameters
        model: str = "sentence-transformers/all-mpnet-base-v2",
        target_dimensions: int = 1536,
        pad_embeddings: bool = True,
        
        # Pass through any additional parameters
        **kwargs
    ):
        """
        Initialize SentenceTransformer embedder with optional configuration parameters.
        
        Args:
            model: SentenceTransformer model name or path (e.g., "sentence-transformers/all-mpnet-base-v2", 
                   "sentence-transformers/all-MiniLM-L6-v2", "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2")
            target_dimensions: Target embedding dimensions (default 1536 for OpenAI compatibility)
            pad_embeddings: Whether to pad/truncate embeddings to target dimensions
            **kwargs: Additional parameters passed to underlying implementation
        """
        super().__init__(
            model=model,
            target_dimensions=target_dimensions,
            pad_embeddings=pad_embeddings,
            **kwargs
        )


# Aliases for backward compatibility
SentenceTransformerEmbedder = SentenceTransformer