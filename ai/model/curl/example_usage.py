"""Example usage of CurlImageGenModel

This shows how to use the simple cURL-based image generation model.
"""

from ai.model.curl.curl_gen import CurlImageGenModel
from ai.model.message import Message

# Example 1: Basic usage
def example_basic():
    model = CurlImageGenModel(
        api_key="your-azure-api-key-here",
        base_url="https://tomj0-mf6aqr8i-eastus2.services.ai.azure.com"
    )
    
    messages = [
        Message(role="user", content="A photograph of a red fox in an autumn forest")
    ]
    
    response = model.response(messages)
    
    # Save the image
    if response.content:
        model.save_image(response.content, "generated_image.png")
        print("Image saved to generated_image.png")


# Example 2: Custom parameters
def example_custom():
    model = CurlImageGenModel(
        api_key="your-azure-api-key-here",
        size="512x512",  # Different size
        output_format="png"
    )
    
    messages = [
        Message(role="user", content="A beautiful sunset over mountains")
    ]
    
    response = model.invoke(messages=messages)
    
    if response.content:
        model.save_image(response.content, "sunset.png")


if __name__ == "__main__":
    # Run examples (uncomment to use)
    # example_basic()
    # example_custom()
    pass
