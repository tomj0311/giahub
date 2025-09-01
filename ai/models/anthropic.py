"""
Anthropic Models - Simplified interface
"""
from typing import Optional, List, Dict, Any
from ai.model.anthropic.claude import Claude as ClaudeBase


class Anthropic(ClaudeBase):
    """
    Simplified Anthropic Claude model interface with optional fine-tuning parameters.
    This is a wrapper around Claude that exposes common parameters for easier configuration.
    """
    
    def __init__(
        self,
        # Core parameters
        id: str = "claude-3-5-sonnet-20241022",
        api_key: str = None,
        
        # Fine-tuning parameters - commonly used Anthropic settings
        max_tokens: int = 25000,
        temperature: float = None,
        top_p: float = None,
        top_k: int = None,
        stop_sequences: Optional[List[str]] = None,
        
        # Client configuration
        client_params: Optional[Dict[str, Any]] = None,
        
        # Pass through any additional parameters
        **kwargs
    ):
        """
        Initialize Anthropic Claude model with optional fine-tuning parameters.
        
        Args:
            id: Model ID (e.g., "claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022")
            api_key: Anthropic API key
            max_tokens: Maximum tokens in response (required for Anthropic)
            temperature: Controls randomness (0.0 to 1.0). Higher = more creative
            top_p: Nucleus sampling parameter (0.0 to 1.0)
            top_k: Top-k sampling parameter (positive integer)
            stop_sequences: Custom stop sequences for completion
            client_params: Additional client configuration parameters
            **kwargs: Additional parameters passed to underlying implementation
        """
        super().__init__(
            id=id,
            api_key=api_key,
            max_tokens=max_tokens,
            temperature=temperature,
            top_p=top_p,
            top_k=top_k,
            stop_sequences=stop_sequences,
            client_params=client_params,
            **kwargs
        )


# Aliases for backward compatibility
Claude = Anthropic
