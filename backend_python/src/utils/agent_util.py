import importlib
from typing import Any, Dict


def load_model_from_config(config: Dict[str, Any] = None) -> Any:
    """
    Load and instantiate a model from MongoDB config.
    
    Args:
        config: MongoDB document with 'model' and 'model_params' fields
        
    Returns:
        Instantiated model object
    """
    # Hardcoded config for now
    if config is None:
        config = {
            "name": "Gpt-4o",
            "category": "OpenAI",
            "model": "ai.models.openai",
            "model_params": {
                "id": "gpt-4o",
                "api_key": "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"
            }
        }
    
    # Get the module path (e.g., "ai.models.openai")
    module_path = config["model"]
    
    # Import the module
    module = importlib.import_module(module_path)
    
    # Get the class (assume it's the main class, like "OpenAI" for OpenAI)
    category = config["category"]  # e.g., "OpenAI"
    model_class = getattr(module, category)
    
    # Get params and instantiate
    params = config["model_params"]
    
    # Return the instantiated model
    return model_class(**params)


def load_agent_from_config(config: Dict[str, Any] = None) -> Any:
    """
    Load and instantiate an agent from config.
    
    Args:
        config: Agent configuration
        
    Returns:
        Instantiated agent object
    """
    # Hardcoded config for now
    if config is None:
        config = {
            "_id": {
                "$oid": "68b6c643209f94ef8ee25df5"
            },
            "tenantId": "system",
            "userId": "SX7VDFHdcJdbp_bfsUkMhA",
            "name": "TesT",
            "category": "test",
            "description": "",
            "instructions": "",
            "model": {
                "name": "Gpt-4o"
            },
            "tools": {},
            "collection": "",
            "memory": {
                "history": {
                    "enabled": False,
                    "num": 3
                }
            },
            "updated_at": {
                "$date": "2025-09-02T10:26:11.609Z"
            },
            "created_at": {
                "$date": "2025-09-02T10:26:11.610Z"
            }
        }
    
    # Import the agent module
    module = importlib.import_module("ai.agent.core")
    
    # Get the Agent class
    agent_class = getattr(module, "Agent")
    
    # Return the instantiated agent
    return agent_class(**config)


def load_tool_from_config(config: Dict[str, Any] = None) -> Any:
    """
    Load and instantiate a tool from config.
    
    Args:
        config: Tool configuration with 'tool' and 'tool_params' fields
        
    Returns:
        Instantiated tool object
    """
    # Hardcoded config for now
    if config is None:
        config = {
            "_id": {
                "$oid": "68b6d33c209f94ef8ee25df6"
            },
            "name": "crawl",
            "category": "test",
            "tool": "ai.functions.firecrawl",
            "tool_params": {
                "api_key": "fc-862eca126e5a428fa5bb12e536e21e70"
            },
            "type": "toolConfig",
            "created_at": {
                "$date": "2025-09-02T11:21:32.797Z"
            },
            "updated_at": {
                "$date": "2025-09-02T11:22:24.756Z"
            },
            "created_by": "SX7VDFHdcJdbp_bfsUkMhA"
        }
    
    # Get the module path (e.g., "ai.functions.firecrawl")
    module_path = config["tool"]
    
    # Import the module
    module = importlib.import_module(module_path)
    
    # Get the class name from the module path
    # For "ai.functions.firecrawl", we want "Firecrawl" class
    module_name = module_path.split(".")[-1]  # "firecrawl"
    class_name = module_name.capitalize()  # "Firecrawl"
    
    # Get the tool class
    tool_class = getattr(module, class_name)
    
    # Get params and instantiate
    params = config["tool_params"]
    
    # Return the instantiated tool
    return tool_class(**params)



