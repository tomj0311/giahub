"""Simple cURL-based model for Azure FLUX image generation API."""

import base64
import json
import requests
from typing import Dict, Any, List, Optional, Iterator

from ai.model.base import Model
from ai.model.message import Message
from ai.model.response import ModelResponse
from ai.utils.log import logger


class CurlGenModel(Model):
    """Model that directly calls Azure FLUX image generation API using requests."""
    
    id: str = "FLUX-1.1-pro"
    name: str = "CurlGen"
    provider: str = "Azure FLUX"
    
    # API configuration
    api_url: str = ""
    api_key: Optional[str] = None
    
    # Image parameters
    output_format: str = "png"
    n: int = 1
    size: str = "1024x1024"

    def __init__(self, **kwargs: Any):
        """Initialize the CurlGenModel with API configuration."""
        super().__init__(**kwargs)
        if self.metrics is None:
            self.metrics = {}

    @property
    def request_kwargs(self) -> Dict[str, Any]:
        """Return minimal request configuration."""
        return {
            "api_url": self.api_url,
            "api_key": self.api_key,
        }

    def _build_url(self) -> str:
        """Return the complete API endpoint URL."""
        return self.api_url

    def _build_headers(self) -> Dict[str, str]:
        """Build request headers."""
        if not self.api_key:
            raise ValueError("API key is required")
        
        return {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}"
        }

    def _build_payload(self, prompt: str) -> Dict[str, Any]:
        """Build the request payload."""
        return {
            "prompt": prompt,
            "output_format": self.output_format,
            "n": self.n,
            "size": self.size
        }

    def _extract_prompt(self, messages: List[Message]) -> str:
        """Extract prompt from messages."""
        if not messages:
            return "A default image"
        
        # Get the last user message as the prompt
        last_message = messages[-1]
        return last_message.content if last_message.content else "A default image"

    def response(self, messages: List[Message]) -> ModelResponse:
        """Generate image and return base64 encoded data."""
        prompt = self._extract_prompt(messages)
        
        try:
            logger.info(f"Generating image with prompt: {prompt}")
            
            response = requests.post(
                self._build_url(),
                headers=self._build_headers(),
                json=self._build_payload(prompt),
                timeout=60
            )
            response.raise_for_status()
            
            data = response.json()
            
            # Extract base64 image data
            if "data" in data and len(data["data"]) > 0:
                b64_image = data["data"][0].get("b64_json", "")
                logger.info("Image generated successfully")
                return ModelResponse(
                    content=b64_image
                )
            else:
                logger.error("No image data in response")
                return ModelResponse(content="")
                
        except requests.exceptions.RequestException as e:
            logger.error(f"Request failed: {e}")
            return ModelResponse(content="")
        except Exception as e:
            logger.error(f"Unexpected error: {e}")
            return ModelResponse(content="")

    def response_stream(self, messages: List[Message]) -> Iterator[ModelResponse]:
        """Stream not supported for image generation, returns single response."""
        yield self.response(messages)

    def invoke(self, *args, **kwargs) -> ModelResponse:
        """Invoke the model with messages."""
        messages = kwargs.get("messages", [])
        return self.response(messages)

    def invoke_stream(self, *args, **kwargs) -> Iterator[ModelResponse]:
        """Invoke streaming (returns single result for images)."""
        messages = kwargs.get("messages", [])
        return self.response_stream(messages)

    async def aresponse(self, messages: List[Message]) -> ModelResponse:
        """Async response (synchronous implementation)."""
        return self.response(messages)

    async def ainvoke(self, *args, **kwargs) -> ModelResponse:
        """Async invoke."""
        return self.invoke(*args, **kwargs)

    async def ainvoke_stream(self, *args, **kwargs) -> Iterator[ModelResponse]:
        """Async invoke stream."""
        return self.invoke_stream(*args, **kwargs)

    def save_image(self, b64_data: str, output_path: str) -> bool:
        """Helper method to save base64 image data to file."""
        try:
            image_data = base64.b64decode(b64_data)
            with open(output_path, "wb") as f:
                f.write(image_data)
            logger.info(f"Image saved to {output_path}")
            return True
        except Exception as e:
            logger.error(f"Failed to save image: {e}")
            return False
