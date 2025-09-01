"""
xAI Models - Simplified interface
"""
from typing import Optional, List, Dict, Any, Union
from ai.model.xai.xai import xAI as xAIBase


class XAI(xAIBase):
    """
    Simplified xAI model interface with optional fine-tuning parameters.
    This is a wrapper around xAI that exposes common parameters for easier configuration.
    """
    
    def __init__(
        self,
        # Core parameters
        id: str = "grok-beta",
        api_key: Optional[str] = None,
        
        # Fine-tuning parameters - commonly used xAI settings
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        top_p: Optional[float] = None,
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
        
        # Pass through any additional parameters
        **kwargs
    ):
        """
        Initialize xAI model with optional fine-tuning parameters.
        
        Args:
            id: Model ID (e.g., "grok-beta", "grok-2")
            api_key: xAI API key
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
            **kwargs: Additional parameters passed to underlying implementation
        """
        super().__init__(
            id=id,
            api_key=api_key,
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
            **kwargs
        )


# Aliases for backward compatibility
xAI = XAI
