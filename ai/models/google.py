"""
Google Models - Simplified interface
"""
from ai.model.google.gemini import Gemini as GeminiBase

try:
    from ai.model.google.gemini_openai import GeminiOpenAIChat as GeminiOpenAIChatBase
except ImportError:
    class GeminiOpenAIChatBase:  # type: ignore
        def __init__(self, *args, **kwargs):
            raise ImportError(
                "GeminiOpenAIChat requires the 'openai' library. Please install it via `pip install openai`"
            )


"""
Google Models - Simplified interface
"""
from typing import Optional, List, Dict, Any
from ai.model.google.gemini import Gemini as GeminiBase

try:
    from ai.model.google.gemini_openai import GeminiOpenAIChat as GeminiOpenAIChatBase
except ImportError:
    class GeminiOpenAIChatBase:  # type: ignore
        def __init__(self, *args, **kwargs):
            raise ImportError(
                "GeminiOpenAIChat requires the 'openai' library. Please install it via `pip install openai`"
            )


class Google(GeminiBase):
    """
    Simplified Google Gemini model interface with optional fine-tuning parameters.
    This is a wrapper around Gemini that exposes common parameters for easier configuration.
    """
    
    def __init__(
        self,
        # Core parameters
        id: str = "gemini-2.0-flash-exp",
        api_key: str = None,
        
        # Fine-tuning parameters - commonly used Google Gemini settings
        generation_config: Optional[Any] = None,
        safety_settings: Optional[Any] = None,
        
        # Client configuration
        client_params: Optional[Dict[str, Any]] = None,
        generative_model_kwargs: Optional[Dict[str, Any]] = None,
        
        # Pass through any additional parameters
        **kwargs
    ):
        """
        Initialize Google Gemini model with optional fine-tuning parameters.
        
        Args:
            id: Model ID (e.g., "gemini-2.0-flash-exp", "gemini-1.5-pro", "gemini-1.5-flash")
            api_key: Google API key
            generation_config: Generation configuration (temperature, max_output_tokens, etc.)
            safety_settings: Safety filter settings
            client_params: Additional client configuration parameters
            generative_model_kwargs: Additional keyword arguments for GenerativeModel
            **kwargs: Additional parameters passed to underlying implementation
        """
        super().__init__(
            id=id,
            api_key=api_key,
            generation_config=generation_config,
            safety_settings=safety_settings,
            client_params=client_params,
            generative_model_kwargs=generative_model_kwargs,
            **kwargs
        )


class GoogleOpenAI(GeminiOpenAIChatBase):
    """
    Simplified Google Gemini OpenAI-compatible model interface.
    This is a direct wrapper around GeminiOpenAIChat for easier imports.
    """
    pass


# Aliases for backward compatibility
Gemini = Google
GeminiOpenAIChat = GoogleOpenAI
