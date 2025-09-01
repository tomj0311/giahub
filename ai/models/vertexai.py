"""
Vertex AI Models - Simplified interface
"""
from typing import Optional, List, Dict, Any
from ai.model.vertexai.gemini import Gemini as VertexGeminiBase


class VertexAI(VertexGeminiBase):
    """
    Simplified Vertex AI Gemini model interface with optional fine-tuning parameters.
    This is a wrapper around Vertex AI Gemini that exposes common parameters for easier configuration.
    """
    
    def __init__(
        self,
        # Core parameters
        id: str = "gemini-2.0-flash-exp",
        
        # Vertex AI-specific parameters
        generation_config: Optional[Any] = None,
        safety_settings: Optional[Any] = None,
        generative_model_request_params: Optional[Dict[str, Any]] = None,
        
        # Pass through any additional parameters
        **kwargs
    ):
        """
        Initialize Vertex AI Gemini model with optional fine-tuning parameters.
        
        Args:
            id: Model ID (e.g., "gemini-2.0-flash-exp", "gemini-1.5-pro", "gemini-1.5-flash")
            generation_config: Generation configuration (temperature, max_output_tokens, etc.)
                Example: {"temperature": 0.7, "max_output_tokens": 1000, "top_p": 0.9}
            safety_settings: Safety filter settings
            generative_model_request_params: Additional request parameters for GenerativeModel
            **kwargs: Additional parameters passed to underlying implementation
        """
        super().__init__(
            id=id,
            generation_config=generation_config,
            safety_settings=safety_settings,
            generative_model_request_params=generative_model_request_params,
            **kwargs
        )


# Aliases for backward compatibility
VertexGemini = VertexAI
Gemini = VertexAI
