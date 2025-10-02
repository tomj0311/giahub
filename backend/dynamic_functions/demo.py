#!/usr/bin/env python3
"""
Demo script for the Dynamic Function Execution System.
This script demonstrates how to use the DynamicFunctionExecutor to discover,
inspect, and execute functions from modules dynamically.
"""

import sys
import os

# Add the current directory to Python path
sys.path.insert(0, os.path.dirname(__file__))

from function_executor import DynamicFunctionExecutor
import json


def print_separator(title: str):
    """Print a formatted separator with title."""
    print("\n" + "="*60)
    print(f" {title} ")
    print("="*60)


def demo_basic_usage():
    """Demonstrate basic usage of the function executor."""
    print_separator("BASIC USAGE DEMO")
    
    # Initialize the executor
    executor = DynamicFunctionExecutor()
    
    # Discover available modules
    print("\n1. Discovering available modules:")
    modules = executor.discover_modules()
    for i, module in enumerate(modules, 1):
        print(f"   {i}. {module}")
    
    print(f"\nFound {len(modules)} modules")


def demo_function_listing():
    """Demonstrate listing all functions with their signatures."""
    print_separator("FUNCTION LISTING DEMO")
    
    executor = DynamicFunctionExecutor()
    
    # List all functions from all modules
    all_functions = executor.list_all_functions()
    
    for module_name, functions in all_functions.items():
        print(f"\n📦 Module: {module_name}")
        print("-" * 40)
        
        for func_name, func_info in functions.items():
            print(f"  🔧 {func_name}{func_info['signature']}")
            print(f"     📝 {func_info['docstring'][:80]}...")
            print(f"     🔄 Returns: {func_info['return_type']}")
            
            # Show parameters
            if func_info['parameters']:
                print("     📋 Parameters:")
                for param_name, param_info in func_info['parameters'].items():
                    required = "required" if param_info['required'] else "optional"
                    default = f" (default: {param_info['default']})" if param_info['default'] else ""
                    print(f"        - {param_name}: {param_info['type']} ({required}){default}")
            print()


def demo_function_execution():
    """Demonstrate executing functions dynamically."""
    print_separator("FUNCTION EXECUTION DEMO")
    
    executor = DynamicFunctionExecutor()
    
    # Example 1: Math operations
    print("\n🧮 Math Operations:")
    
    try:
        result1 = executor.execute_function("math_operations", "add_numbers", a=10, b=25)
        print(f"add_numbers(10, 25) = {result1}")
        
        result2 = executor.execute_function("math_operations", "multiply_numbers", x=3, y=4, z=5)
        print(f"multiply_numbers(3, 4, 5) = {result2}")
        
        result3 = executor.execute_function("math_operations", "calculate_power", base=2, exponent=8)
        print(f"calculate_power(2, 8) = {result3}")
        
        result4 = executor.execute_function("math_operations", "factorial", n=5)
        print(f"factorial(5) = {result4}")
        
        result5 = executor.execute_function("math_operations", "is_prime", num=17)
        print(f"is_prime(17) = {result5}")
        
    except Exception as e:
        print(f"Error in math operations: {e}")
    
    # Example 2: String utilities
    print("\n📝 String Utilities:")
    
    try:
        text = "Hello World Python Programming"
        
        result1 = executor.execute_function("string_utils", "reverse_string", text=text)
        print(f"reverse_string('{text}') = '{result1}'")
        
        result2 = executor.execute_function("string_utils", "count_words", text=text)
        print(f"count_words('{text}') = {result2}")
        
        result3 = executor.execute_function("string_utils", "capitalize_words", text="hello world", delimiter=" ")
        print(f"capitalize_words('hello world') = '{result3}'")
        
        email_text = "Contact us at support@example.com or admin@test.org for help"
        result4 = executor.execute_function("string_utils", "extract_emails", text=email_text)
        print(f"extract_emails(...) = {result4}")
        
        result5 = executor.execute_function("string_utils", "text_statistics", text=text)
        print(f"text_statistics('{text}') = {result5}")
        
    except Exception as e:
        print(f"Error in string utilities: {e}")
    
    # Example 3: Date utilities
    print("\n📅 Date Utilities:")
    
    try:
        result1 = executor.execute_function("date_utils", "current_timestamp")
        print(f"current_timestamp() = {result1}")
        
        result2 = executor.execute_function("date_utils", "add_days_to_date", date_str="2025-01-01", days=30)
        print(f"add_days_to_date('2025-01-01', 30) = {result2}")
        
        result3 = executor.execute_function("date_utils", "calculate_age", birth_date="1990-05-15")
        print(f"calculate_age('1990-05-15') = {result3}")
        
        result4 = executor.execute_function("date_utils", "days_between_dates", 
                                          start_date="2025-01-01", end_date="2025-12-31")
        print(f"days_between_dates('2025-01-01', '2025-12-31') = {result4}")
        
        result5 = executor.execute_function("date_utils", "is_weekend", date_str="2025-10-04")
        print(f"is_weekend('2025-10-04') = {result5}")  # Saturday
        
    except Exception as e:
        print(f"Error in date utilities: {e}")


def demo_signature_inspection():
    """Demonstrate function signature inspection."""
    print_separator("SIGNATURE INSPECTION DEMO")
    
    executor = DynamicFunctionExecutor()
    
    # Get signature for a specific function
    print("\n🔍 Inspecting specific function signature:")
    
    try:
        signature = executor.get_function_signature("math_operations", "multiply_numbers")
        print(json.dumps(signature, indent=2, default=str))
        
        print("\n🔍 Inspecting all functions in a module:")
        signatures = executor.get_function_signature("string_utils")
        
        for func_name, func_info in signatures.items():
            print(f"\n{func_name}:")
            print(f"  Signature: {func_info['signature']}")
            print(f"  Description: {func_info['docstring'][:100]}...")
            
    except Exception as e:
        print(f"Error inspecting signatures: {e}")


def demo_error_handling():
    """Demonstrate error handling."""
    print_separator("ERROR HANDLING DEMO")
    
    executor = DynamicFunctionExecutor()
    
    print("\n⚠️  Testing error scenarios:")
    
    # Test non-existent module
    try:
        executor.execute_function("non_existent_module", "some_function")
    except Exception as e:
        print(f"1. Non-existent module: {type(e).__name__}: {e}")
    
    # Test non-existent function
    try:
        executor.execute_function("math_operations", "non_existent_function")
    except Exception as e:
        print(f"2. Non-existent function: {type(e).__name__}: {e}")
    
    # Test wrong parameters
    try:
        executor.execute_function("math_operations", "add_numbers", a=10)  # Missing 'b'
    except Exception as e:
        print(f"3. Missing parameter: {type(e).__name__}: {e}")
    
    # Test invalid parameter types (this will be caught at runtime)
    try:
        executor.execute_function("date_utils", "add_days_to_date", date_str="invalid-date", days=5)
    except Exception as e:
        print(f"4. Invalid parameter value: {type(e).__name__}: {e}")


def main():
    """Main demo function."""
    print("🚀 Dynamic Function Execution System Demo")
    print("This demo shows how to dynamically discover and execute functions from modules.")
    
    demo_basic_usage()
    demo_function_listing()
    demo_function_execution()
    demo_signature_inspection()
    demo_error_handling()
    
    print_separator("DEMO COMPLETE")
    print("✅ Demo completed successfully!")
    print("\nTo use this system in your own code:")
    print("1. Create function modules in the dynamic_functions directory")
    print("2. Import and initialize DynamicFunctionExecutor")
    print("3. Use discover_modules(), list_all_functions(), and execute_function()")


if __name__ == "__main__":
    main()