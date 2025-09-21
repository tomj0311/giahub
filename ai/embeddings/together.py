"""
Together Embeddings - Simplified interface
"""
from typing import Optional, Dict, List, Tuple, Any
from typing_extensions import Literal

from ai.embedder.together import TogetherEmbedder


class Together(TogetherEmbedder):
    """
    Simplified Together Embedder interface with optional configuration parameters.
    This is a wrapper around TogetherEmbedder that exposes common parameters for easier configuration.
    """
    
    def __init__(
        self,
        # Core parameters
        model: str = "togethercomputer/m2-bert-80M-32k-retrieval",
        api_key: str = None,
        
        # Embedding-specific parameters
        dimensions: Optional[int] = 768,
        encoding_format: Literal["float", "base64"] = "float",
        user: Optional[str] = None,
        
        # Client configuration
        organization: Optional[str] = None,
        base_url: str = "https://api.together.xyz/v1",
        
        # Advanced parameters
        request_params: Optional[Dict[str, Any]] = None,
        client_params: Optional[Dict[str, Any]] = None,
        
        # Pass through any additional parameters
        **kwargs
    ):
        """
        Initialize Together embedder with optional configuration parameters.
        
        Args:
            model: Embedding model ID (e.g., "togethercomputer/m2-bert-80M-32k-retrieval")
            api_key: Together API key
            dimensions: Number of dimensions for the embedding
            encoding_format: Format for the embedding output ("float" or "base64")
            user: A unique identifier representing your end-user
            organization: Organization ID (if applicable)
            base_url: Together API base URL
            request_params: Additional parameters for embedding requests
            client_params: Additional parameters for Together client initialization
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
TogetherEmbedder = Together