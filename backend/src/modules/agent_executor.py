"""
Simple agent execution module.
"""

async def run_agent(agent_name: str, prompt: str, user: dict = None, conv_id: str = None):
    """Run agent with agent name and prompt, stream=False"""
    import sys
    import os
    import asyncio
    import uuid
    
    # Add the BACKEND directory to path - this is the key!
    backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
    sys.path.insert(0, backend_dir)
    
    try:
        # Import from the full path
        from src.services.agent_runtime_service import AgentRuntimeService
        
        if user is None:
            raise ValueError("User information must be provided")
        
        result = ""
        async for response in AgentRuntimeService.execute_agent(agent_name, prompt, user, conv_id, stream=False):
            # Handle both dict and string responses
            if isinstance(response, str):
                result += response
            elif isinstance(response, dict):
                if response.get("type") in ["agent_chunk", "agent_response"]:
                    content = response.get("payload", {}).get("content", "")
                    if content:
                        result += content
            else:
                # Convert whatever it is to string
                result += str(response)
        return result
        
    finally:
        sys.path.remove(backend_dir)