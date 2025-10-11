"""
OpenAI Models - Simplified interface
"""
import json
from typing import Optional, List, Dict, Any, Union
from ai.model.openai.chat import OpenAIChat
from ai.model.openai.like import OpenAILike as OpenAILikeBase


class OpenAI(OpenAIChat):
    """
    Simplified OpenAI Chat model interface with optional fine-tuning parameters.
    This is a wrapper around OpenAIChat that exposes common parameters for easier configuration.
    """
    
    def __init__(
        self,
        # Core parameters
        id: str = "gpt-4o",
        api_key: str = None,
        
        # Fine-tuning parameters - commonly used OpenAI settings
        temperature: float = None,
        max_tokens: int = None,
        top_p: float = None,
        frequency_penalty: Optional[float] = None,
        presence_penalty: Optional[float] = None,
        stop: Optional[Union[str, List[str]]] = None,
        seed: Optional[int] = None,
        
        # Response format and structure
        response_format: Optional[Any] = None,
        logprobs: Optional[bool] = None,
        top_logprobs: Optional[int] = None,
        
        # Audio parameters - for audio-enabled models
        modalities: Union[str, List[str]] = None,
        audio: Union[str, Dict[str, Any]] = None,
        
        # Client configuration
        base_url: str = None,
        timeout: Optional[float] = None,
        max_retries: Optional[int] = None,
        organization: Optional[str] = None,
        
        # Pass through any additional parameters
        **kwargs
    ):
        """
        Initialize OpenAI model with optional fine-tuning parameters.
        
        Args:
            id: Model ID (e.g., "gpt-4o", "gpt-4o-mini", "gpt-3.5-turbo", "gpt-audio")
            api_key: OpenAI API key
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
            modalities: List of modalities or JSON string (e.g., ["text", "audio"] or '["text", "audio"]')
            audio: Audio config dict or JSON string (e.g., {"voice": "alloy", "format": "wav"} or '{"voice": "alloy", "format": "wav"}')
            base_url: Custom API base URL
            timeout: Request timeout in seconds
            max_retries: Maximum number of retries
            organization: OpenAI organization ID
            **kwargs: Additional parameters passed to underlying implementation
        """
        # Convert modalities from string to list if needed
        if modalities is not None and isinstance(modalities, str):
            try:
                modalities = json.loads(modalities)
            except json.JSONDecodeError as e:
                raise ValueError(f"Invalid modalities JSON string: {modalities}. Error: {e}")
        
        # Convert audio from string to dict if needed
        if audio is not None and isinstance(audio, str):
            try:
                audio = json.loads(audio)
            except json.JSONDecodeError as e:
                raise ValueError(f"Invalid audio JSON string: {audio}. Error: {e}")
        
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
            modalities=modalities,
            audio=audio,
            base_url=base_url,
            timeout=timeout,
            max_retries=max_retries,
            organization=organization,
            **kwargs
        )


class OpenAILike(OpenAILikeBase):
    """
    Simplified OpenAI-like model interface.
    This is a direct wrapper around OpenAILike for easier imports.
    """
    pass


# Aliases for backward compatibility
OpenAIChat = OpenAI
