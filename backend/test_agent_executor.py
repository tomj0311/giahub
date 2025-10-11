#!/usr/bin/env python3
"""
Test script to verify the agent_executor module works correctly.
"""

import sys
import os
from pathlib import Path

# Add the backend/src directory to the Python path
backend_src_path = Path(__file__).parent / "src"
sys.path.insert(0, str(backend_src_path))

from services.module_service import ModuleService

def test_module_discovery():
    """Test that the agent_executor module can be discovered."""
    module_service = ModuleService()
    
    # Discover modules
    modules = module_service.discover_modules()
    print(f"Discovered modules: {modules}")
    
    # Check if agent_executor is in the list
    if "agent_executor" in modules:
        print("✓ agent_executor module discovered successfully")
    else:
        print("✗ agent_executor module not found")
        return False
    
    return True

def test_module_loading():
    """Test that the agent_executor module can be loaded."""
    module_service = ModuleService()
    
    try:
        # Load the agent_executor module
        module = module_service.load_module("agent_executor")
        print("✓ agent_executor module loaded successfully")
        
        # Get functions from the module
        functions = module_service.get_module_functions("agent_executor")
        print(f"Functions in agent_executor: {list(functions.keys())}")
        
        # Check for expected functions
        expected_functions = ["run_agent", "run_agent_sync", "create_user_context"]
        for func_name in expected_functions:
            if func_name in functions:
                print(f"✓ Function '{func_name}' found")
            else:
                print(f"✗ Function '{func_name}' not found")
        
        return True
        
    except Exception as e:
        print(f"✗ Failed to load agent_executor module: {e}")
        return False

if __name__ == "__main__":
    print("Testing agent_executor module...")
    print("=" * 50)
    
    # Test module discovery
    print("1. Testing module discovery...")
    discovery_success = test_module_discovery()
    
    print("\n2. Testing module loading...")
    loading_success = test_module_loading()
    
    print("\n" + "=" * 50)
    if discovery_success and loading_success:
        print("✓ All tests passed! The agent_executor module is working correctly.")
    else:
        print("✗ Some tests failed. Please check the errors above.")