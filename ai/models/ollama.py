"""
Ollama Models - Simplified interface
"""
from typing import Optional, List, Dict, Any, Union
from ai.model.ollama.chat import Ollama as OllamaBase
from ai.model.ollama.hermes import Hermes as HermesBase
from ai.model.ollama.tools import OllamaTools as OllamaToolsBase


class Ollama(OllamaBase):
    """
    Simplified Ollama model interface with optional fine-tuning parameters.
    This is a wrapper around Ollama that exposes common parameters for easier configuration.
    """
    
    def __init__(
        self,
        # Core parameters
        id: str = "llama3.1",
        
        # Ollama-specific parameters
        host: Optional[str] = None,
        timeout: Optional[Any] = None,
        format: Optional[Any] = None,
        options: Optional[Dict[str, Any]] = None,
        keep_alive: Optional[Union[float, str]] = None,
        
        # Client configuration
        client_params: Optional[Dict[str, Any]] = None,
        
        # Pass through any additional parameters
        **kwargs
    ):
        """
        Initialize Ollama model with optional fine-tuning parameters.
        
        Args:
            id: Model ID (e.g., "llama3.1", "llama3.2", "mistral", "codellama")
            host: Ollama server host URL
            timeout: Request timeout
            format: Response format (e.g., "json")
            options: Model options (temperature, num_predict, top_p, etc.)
                Example: {"temperature": 0.7, "num_predict": 100, "top_p": 0.9}
            keep_alive: How long to keep model loaded
            client_params: Additional client configuration parameters
            **kwargs: Additional parameters passed to underlying implementation
        """
        super().__init__(
            id=id,
            host=host,
            timeout=timeout,
            format=format,
            options=options,
            keep_alive=keep_alive,
            client_params=client_params,
            **kwargs
        )


class Hermes(HermesBase):
    """
    Simplified Hermes model interface with optional fine-tuning parameters.
    This is a wrapper around Hermes that exposes common parameters for easier configuration.
    """
    
    def __init__(
        self,
        # Core parameters
        id: str = "adrienbrault/nous-hermes2pro:Q8_0",
        
        # Ollama-specific parameters
        host: Optional[str] = None,
        timeout: Optional[Any] = None,
        format: Optional[Any] = None,
        options: Optional[Dict[str, Any]] = None,
        keep_alive: Optional[Union[float, str]] = None,
        
        # Client configuration
        client_params: Optional[Dict[str, Any]] = None,
        
        # Pass through any additional parameters
        **kwargs
    ):
        """
        Initialize Hermes model with optional fine-tuning parameters.
        
        Args:
            id: Model ID (default: "adrienbrault/nous-hermes2pro:Q8_0")
            host: Ollama server host URL
            timeout: Request timeout
            format: Response format (e.g., "json")
            options: Model options (temperature, num_predict, top_p, etc.)
            keep_alive: How long to keep model loaded
            client_params: Additional client configuration parameters
            **kwargs: Additional parameters passed to underlying implementation
        """
        super().__init__(
            id=id,
            host=host,
            timeout=timeout,
            format=format,
            options=options,
            keep_alive=keep_alive,
            client_params=client_params,
            **kwargs
        )


class OllamaTools(OllamaToolsBase):
    """
    Simplified OllamaTools model interface with optional fine-tuning parameters.
    This is a wrapper around OllamaTools that exposes common parameters for easier configuration.
    """
    
    def __init__(
        self,
        # Core parameters
        id: str = "llama3.1",
        
        # Ollama-specific parameters
        host: Optional[str] = None,
        timeout: Optional[Any] = None,
        format: Optional[Any] = None,
        options: Optional[Dict[str, Any]] = None,
        keep_alive: Optional[Union[float, str]] = None,
        
        # Client configuration
        client_params: Optional[Dict[str, Any]] = None,
        
        # Pass through any additional parameters
        **kwargs
    ):
        """
        Initialize OllamaTools model with optional fine-tuning parameters.
        
        Args:
            id: Model ID (e.g., "llama3.1", "llama3.2", "mistral")
            host: Ollama server host URL
            timeout: Request timeout
            format: Response format (e.g., "json")
            options: Model options (temperature, num_predict, top_p, etc.)
            keep_alive: How long to keep model loaded
            client_params: Additional client configuration parameters
            **kwargs: Additional parameters passed to underlying implementation
        """
        super().__init__(
            id=id,
            host=host,
            timeout=timeout,
            format=format,
            options=options,
            keep_alive=keep_alive,
            client_params=client_params,
            **kwargs
        )
