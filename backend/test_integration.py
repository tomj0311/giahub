#!/usr/bin/env python3
"""
Test script for the integrated dynamic execution system.
"""
import sys
import os
sys.path.insert(0, '/home/tom/Desktop/giahub/backend')

from src.services.module_service import ModuleService

def test_integration():
    """Test the module service integration."""
    print("🧪 Testing Dynamic Execution Integration")
    print("=" * 50)
    
    # Initialize service
    service = ModuleService()
    
    # Test module discovery
    print("\n1. Testing module discovery:")
    modules = service.discover_modules()
    print(f"   Found modules: {modules}")
    
    # Test function listing
    print("\n2. Testing function listing:")
    if modules:
        for module in modules[:2]:  # Test first 2 modules
            functions = service.get_module_functions(module)
            print(f"   Module '{module}': {list(functions.keys())}")
    
    # Test function execution
    print("\n3. Testing function execution:")
    try:
        if 'math_operations' in modules:
            result = service.execute_function('math_operations', 'add_numbers', a=10, b=25)
            print(f"   math_operations.add_numbers(10, 25) = {result}")
        
        if 'string_utils' in modules:
            result = service.execute_function('string_utils', 'reverse_string', text="Hello")
            print(f"   string_utils.reverse_string('Hello') = '{result}'")
    except Exception as e:
        print(f"   Error: {e}")
    
    print("\n✅ Integration test completed!")

if __name__ == "__main__":
    test_integration()