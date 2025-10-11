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
        api_url: str = "https://tomj0-mf6aqr8i-eastus2.services.ai.azure.com/openai/deployments/FLUX-1.1-pro/images/generations?api-version=2025-04-01-preview",
        
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
            api_url: Full Azure API endpoint URL (including deployment, api-version, etc.)
                     Example: "https://tomj0-mf6aqr8i-eastus2.services.ai.azure.com/openai/deployments/FLUX-1.1-pro/images/generations?api-version=2025-04-01-preview"
            size: Image size (e.g., "1024x1024", "512x512")
            output_format: Output format (default: "png")
            n: Number of images to generate (default: 1)
            **kwargs: Additional parameters passed to underlying implementation
        """
        super().__init__(
            api_key=api_key,
            api_url=api_url,
            size=size,
            output_format=output_format,
            n=n,
            **kwargs
        )


# Alias for backward compatibility
CurlGenModel = CurlGen
