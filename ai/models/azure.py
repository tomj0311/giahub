"""
Azure Models - Simplified interface
"""
from typing import Optional, List, Dict, Any, Union
from ai.model.azure.openai_chat import AzureOpenAIChat as AzureOpenAIChatBase


class Azure(AzureOpenAIChatBase):
    """
    Simplified Azure OpenAI Chat model interface with optional fine-tuning parameters.
    This is a wrapper around AzureOpenAIChat that exposes common parameters for easier configuration.
    """
    
    def __init__(
        self,
        # Core parameters
        id: str,  # Required for Azure
        api_key: str = None,
        
        # Azure-specific parameters
        api_version: str = None,
        azure_endpoint: str = None,
        azure_deployment: str = None,
        azure_ad_token: Optional[str] = None,
        azure_ad_token_provider: Optional[Any] = None,
        
        # Fine-tuning parameters - commonly used Azure OpenAI settings
        temperature: float = None,
        max_tokens: Optional[int] = None,
        top_p: float = None,
        frequency_penalty: Optional[float] = None,
        presence_penalty: Optional[float] = None,
        stop: Optional[Union[str, List[str]]] = None,
        seed: Optional[int] = None,
        
        # Response format and structure
        response_format: Optional[Any] = None,
        logprobs: Optional[bool] = None,
        top_logprobs: Optional[int] = None,
        
        # Client configuration
        base_url: Optional[str] = None,
        timeout: Optional[float] = None,
        max_retries: Optional[int] = None,
        organization: Optional[str] = None,
        
        # Pass through any additional parameters
        **kwargs
    ):
        """
        Initialize Azure OpenAI model with optional fine-tuning parameters.
        
        Args:
            id: Azure deployment name or model ID (required)
            api_key: Azure OpenAI API key
            api_version: Azure OpenAI API version
            azure_endpoint: Azure OpenAI endpoint URL
            azure_deployment: Azure deployment name
            azure_ad_token: Azure AD token for authentication
            azure_ad_token_provider: Azure AD token provider
            temperature: Controls randomness (0.0 to 2.0). Higher = more creative
            max_tokens: Maximum tokens in response
            top_p: Nucleus sampling parameter (0.0 to 1.0)
            frequency_penalty: Penalize frequent tokens (-2.0 to 2.0)
            presence_penalty: Penalize new topics (-2.0 to 2.0)
            stop: Stop sequences for completion
            seed: Random seed for deterministic outputs
            response_format: Response format specification
            logprobs: Return log probabilities
            top_logprobs: Number of top logprobs to return
            base_url: Custom API base URL
            timeout: Request timeout in seconds
            max_retries: Maximum number of retries
            organization: Azure organization ID
            **kwargs: Additional parameters passed to underlying implementation
        """
        super().__init__(
            id=id,
            api_key=api_key,
            api_version=api_version,
            azure_endpoint=azure_endpoint,
            azure_deployment=azure_deployment,
            azure_ad_token=azure_ad_token,
            azure_ad_token_provider=azure_ad_token_provider,
            temperature=temperature,
            max_tokens=max_tokens,
            top_p=top_p,
            frequency_penalty=frequency_penalty,
            presence_penalty=presence_penalty,
            stop=stop,
            seed=seed,
            response_format=response_format,
            logprobs=logprobs,
            top_logprobs=top_logprobs,
            base_url=base_url,
            timeout=timeout,
            max_retries=max_retries,
            organization=organization,
            **kwargs
        )


# Aliases for backward compatibility
AzureOpenAIChat = Azure
