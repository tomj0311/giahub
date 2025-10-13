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
        id: str = "gpt-4o-mini",  # Best balance of speed, quality, and cost for search
        api_key: str = None,
        
        # Fine-tuning parameters - optimized for intelligent search
        temperature: float = 0.3,  # Low temperature for more focused, factual responses
        max_tokens: int = None,  # Sufficient for detailed search results
        top_p: float = 0.9,  # Nucleus sampling for balanced diversity
        frequency_penalty: float = 0.3,  # Reduce repetition in search results
        presence_penalty: float = 0.2,  # Encourage topic diversity
        stop: Optional[Union[str, List[str]]] = None,
        seed: Optional[int] = None,

        # Audio parameters - for audio-enabled models
        modalities: Optional[Union[str, List[str]]] = None,
        audio: Optional[Union[str, Dict[str, Any]]] = None,

        # Response format and structure
        response_format: Optional[Any] = None,
        logprobs: Optional[bool] = None,
        top_logprobs: Optional[int] = None,
                
        # Client configuration
        base_url: str = None,
        timeout: Optional[float] = None,  # 60 seconds timeout for search operations
        max_retries: Optional[int] = None,  # Retry failed requests up to 3 times
        organization: Optional[str] = None,
        
        # Pass through any additional parameters
        **kwargs
    ):
        """
        Initialize OpenAI model with optimal defaults for intelligent search web applications.
        
        Args:
            id: Model ID (default: "gpt-4o-mini" - optimal for search: fast, cost-effective, high quality)
                Options: "gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo", "o1-preview", "o1-mini"
            api_key: OpenAI API key
            temperature: Controls randomness (0.0 to 2.0). Default: 0.3 for focused search results
            max_tokens: Maximum tokens in response. Default: 2048 for comprehensive answers
            top_p: Nucleus sampling parameter (0.0 to 1.0). Default: 0.9 for quality balance
            frequency_penalty: Penalize frequent tokens (-2.0 to 2.0). Default: 0.3 to reduce repetition
            presence_penalty: Penalize new topics (-2.0 to 2.0). Default: 0.2 for topic diversity
            stop: Stop sequences for completion
            seed: Random seed for deterministic outputs
            response_format: Response format specification (e.g., {"type": "json_object"})
            logprobs: Return log probabilities
            top_logprobs: Number of top logprobs to return (max: 20)
            modalities: List of modalities or JSON string (e.g., ["text", "audio"])
            audio: Audio config dict or JSON string (e.g., {"voice": "alloy", "format": "wav"})
            base_url: Custom API base URL
            timeout: Request timeout in seconds. Default: 60s for search operations
            max_retries: Maximum number of retries. Default: 3 for reliability
            organization: OpenAI organization ID
            **kwargs: Additional parameters passed to underlying implementation
        
        Optimized defaults for intelligent search:
        - Model: gpt-4o-mini (best speed/cost/quality balance)
        - Temperature: 0.3 (focused, factual responses)
        - Max tokens: 2048 (detailed answers)
        - Top-p: 0.9 (balanced diversity)
        - Frequency penalty: 0.3 (reduce repetition)
        - Presence penalty: 0.2 (encourage diversity)
        - Timeout: 60s (handle complex queries)
        - Max retries: 3 (ensure reliability)
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
