"""
Semantic Chunking - Simplified interface
"""
from typing import List, Optional

from ai.document.chunking.semantic import SemanticChunking
from ai.document.base import Document
from ai.embedder.base import Embedder
from ai.embedder.openai import OpenAIEmbedder


class Semantic(SemanticChunking):
    """
    Simplified Semantic Chunking interface with optional configuration parameters.
    This is a wrapper around SemanticChunking that exposes common parameters for easier configuration.
    """
    
    def __init__(
        self,
        # Core parameters
        embedder: Optional[Embedder] = None,
        chunk_size: int = 5000,
        similarity_threshold: Optional[float] = 0.5,
        
        # Embedder configuration shortcuts
        embedding_model: str = "text-embedding-3-small",
        api_key: Optional[str] = None,
        
        # Pass through any additional parameters
        **kwargs
    ):
        """
        Initialize Semantic chunker with optional configuration parameters.
        
        Args:
            embedder: Custom embedder instance. If None, uses OpenAIEmbedder with embedding_model
            chunk_size: Maximum size of each chunk in characters
            similarity_threshold: Threshold for semantic similarity between chunks
            embedding_model: Model to use for embeddings if no custom embedder provided
            api_key: OpenAI API key (used only if no custom embedder provided)
            **kwargs: Additional parameters passed to underlying implementation
        """
        # If no custom embedder provided, create OpenAI embedder with specified model
        if embedder is None:
            embedder = OpenAIEmbedder(
                model=embedding_model,
                api_key=api_key
            )
        
        super().__init__(
            embedder=embedder,
            chunk_size=chunk_size,
            similarity_threshold=similarity_threshold,
            **kwargs
        )


# Aliases for backward compatibility
SemanticChunking = Semantic
