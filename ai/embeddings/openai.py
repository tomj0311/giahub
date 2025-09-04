"""
OpenAI Embeddings - Simplified interface
"""
from typing import Optional, Dict, List, Tuple, Any
from typing_extensions import Literal

from ai.embedder.openai import OpenAIEmbedder


class OpenAI(OpenAIEmbedder):
    """
    Simplified OpenAI Embedder interface with optional configuration parameters.
    This is a wrapper around OpenAIEmbedder that exposes common parameters for easier configuration.
    """
    
    def __init__(
        self,
        # Core parameters
        model: str = "text-embedding-ada-002",
        api_key: str = None,
        
        # Embedding-specific parameters
        dimensions: int = 1536,
        encoding_format: Literal["float", "base64"] = "float",
        user: Optional[str] = None,
        
        # Client configuration
        organization: Optional[str] = None,
        base_url: Optional[str] = None,
        
        # Advanced parameters
        request_params: Optional[Dict[str, Any]] = None,
        client_params: Optional[Dict[str, Any]] = None,
        
        # Pass through any additional parameters
        **kwargs
    ):
        """
        Initialize OpenAI embedder with optional configuration parameters.
        
        Args:
            model: Embedding model ID (e.g., "text-embedding-ada-002", "text-embedding-3-small", "text-embedding-3-large")
            api_key: OpenAI API key
            dimensions: Number of dimensions for the embedding (only for text-embedding-3 models)
            encoding_format: Format for the embedding output ("float" or "base64")
            user: A unique identifier representing your end-user
            organization: OpenAI organization ID
            base_url: Custom API base URL
            request_params: Additional parameters for embedding requests
            client_params: Additional parameters for OpenAI client initialization
            **kwargs: Additional parameters passed to underlying implementation
        """
        super().__init__(
            model=model,
            api_key=api_key,
            dimensions=dimensions,
            encoding_format=encoding_format,
            user=user,
            organization=organization,
            base_url=base_url,
            request_params=request_params,
            client_params=client_params,
            **kwargs
        )


# Aliases for backward compatibility
OpenAIEmbedder = OpenAI
