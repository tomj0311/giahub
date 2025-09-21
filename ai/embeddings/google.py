"""
Google Gemini Embeddings - Simplified interface
"""
from typing import Optional, Dict, List, Tuple, Any

from ai.embedder.google import GeminiEmbedder


class Google(GeminiEmbedder):
    """
    Simplified Google Gemini Embedder interface with optional configuration parameters.
    This is a wrapper around GeminiEmbedder that exposes common parameters for easier configuration.
    """
    
    def __init__(
        self,
        # Core parameters
        model: str = "models/embedding-001",
        api_key: str = None,
        
        # Embedding-specific parameters
        task_type: Optional[str] = "RETRIEVAL_QUERY",
        title: Optional[str] = None,
        dimensions: Optional[int] = 1536,
        
        # Advanced parameters
        request_params: Optional[Dict[str, Any]] = None,
        client_params: Optional[Dict[str, Any]] = None,
        
        # Pass through any additional parameters
        **kwargs
    ):
        """
        Initialize Google Gemini embedder with optional configuration parameters.
        
        Args:
            model: Embedding model ID (e.g., "models/embedding-001")
            api_key: Google API key
            task_type: The task type for the embedding (e.g., "RETRIEVAL_QUERY", "RETRIEVAL_DOCUMENT")
            title: Optional title for the content being embedded
            dimensions: Number of dimensions for the embedding output
            request_params: Additional parameters for embedding requests
            client_params: Additional parameters for Google client initialization
            **kwargs: Additional parameters passed to underlying implementation
        """
        super().__init__(
            model=model,
            api_key=api_key,
            task_type=task_type,
            title=title,
            dimensions=dimensions,
            request_params=request_params,
            client_params=client_params,
            **kwargs
        )


# Aliases for backward compatibility
GoogleEmbedder = Google
GeminiEmbedder = Google