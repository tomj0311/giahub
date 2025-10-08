"""
Curl Models - Simplified interface for direct API calls
"""
from typing import Optional
from ai.model.curl.curl_gen import CurlGenModel as CurlGenModelBase


class CurlGen(CurlGenModelBase):
    """
    Simplified CurlGen image generation model interface.
    This is a wrapper around CurlGenModel for Azure FLUX image generation API.
    """
    
    def __init__(
        self,
        # Core parameters
        api_key: str = None,
        base_url: str = "https://tomj0-mf6aqr8i-eastus2.services.ai.azure.com",
        
        # API configuration
        deployment_name: str = "FLUX-1.1-pro-2",
        api_version: str = "2025-04-01-preview",
        
        # Image generation parameters
        size: str = "1024x1024",
        output_format: str = "png",
        n: int = 1,
        
        # Pass through any additional parameters
        **kwargs
    ):
        """
        Initialize CurlGen image generation model.
        
        Args:
            api_key: Azure API key for authentication
            base_url: Azure endpoint base URL
            deployment_name: Azure deployment name (default: FLUX-1.1-pro-2)
            api_version: Azure API version
            size: Image size (e.g., "1024x1024", "512x512")
            output_format: Output format (default: "png")
            n: Number of images to generate (default: 1)
            **kwargs: Additional parameters passed to underlying implementation
        """
        super().__init__(
            api_key=api_key,
            base_url=base_url,
            deployment_name=deployment_name,
            api_version=api_version,
            size=size,
            output_format=output_format,
            n=n,
            **kwargs
        )


# Alias for backward compatibility
CurlGenModel = CurlGen
