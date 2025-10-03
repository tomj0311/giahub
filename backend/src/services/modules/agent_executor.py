"""
Simple agent execution module.
"""

def run_agent(agent_name: str, prompt: str, user: dict = None, conv_id: str = None):
    """Run agent with agent name and prompt, stream=False"""
    # Import AgentRuntimeService dynamically to avoid import issues
    import sys
    import os
    from pathlib import Path
    
    # Get the services directory path
    services_path = Path(__file__).parent.parent
    backend_src_path = services_path.parent
    
    # Add to sys.path if not already there
    if str(backend_src_path) not in sys.path:
        sys.path.insert(0, str(backend_src_path))
    
    # Import the service
    from services.agent_runtime_service import AgentRuntimeService
    
    if user is None:
        user = {"id": "user1", "tenantId": "tenant1"}
    
    result = ""
    for response in AgentRuntimeService.execute_agent(agent_name, prompt, user, conv_id=conv_id, stream=False):
        if response.get("payload", {}).get("content"):
            result += response["payload"]["content"]
    
    return result