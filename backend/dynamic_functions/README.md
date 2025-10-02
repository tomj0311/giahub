# Dynamic Function Execution System

A powerful Python system for dynamically discovering, inspecting, and executing functions from modules at runtime. This system allows you to create modular function libraries and execute them dynamically without hardcoding function calls.

## Features

- 🔍 **Dynamic Module Discovery**: Automatically discover Python modules in a directory
- 📋 **Function Signature Inspection**: Get detailed information about function parameters, types, and documentation
- ⚡ **Dynamic Function Execution**: Execute functions with runtime parameter validation
- 🌐 **REST API Integration**: Ready-to-use FastAPI endpoints for web integration
- 🛡️ **Error Handling**: Comprehensive error handling with detailed error messages
- 📚 **Type Annotations**: Full type annotation support for better code clarity

## Directory Structure

```
dynamic_functions/
├── __init__.py                 # Package initialization
├── function_executor.py        # Core dynamic execution system
├── api.py                     # FastAPI endpoints
├── demo.py                    # Demonstration script
├── README.md                  # This file
├── math_operations.py         # Example: Mathematical operations
├── string_utils.py            # Example: String utilities
└── date_utils.py             # Example: Date/time utilities
```

## Quick Start

### 1. Basic Usage

```python
from function_executor import DynamicFunctionExecutor

# Initialize the executor
executor = DynamicFunctionExecutor()

# Discover available modules
modules = executor.discover_modules()
print("Available modules:", modules)

# List all functions
all_functions = executor.list_all_functions()

# Execute a function
result = executor.execute_function(
    module_name="math_operations",
    function_name="add_numbers",
    a=10,
    b=25
)
print(f"Result: {result}")  # Output: Result: 35
```

### 2. Function Signature Inspection

```python
# Get signature for a specific function
signature = executor.get_function_signature("math_operations", "multiply_numbers")
print(signature)

# Output:
# {
#   "multiply_numbers": {
#     "signature": "(x: float, y: float, z: float = 1.0) -> float",
#     "docstring": "Multiply three numbers together...",
#     "parameters": {
#       "x": {"name": "x", "type": "float", "required": true},
#       "y": {"name": "y", "type": "float", "required": true},
#       "z": {"name": "z", "type": "float", "default": "1.0", "required": false}
#     },
#     "return_type": "float"
#   }
# }
```

### 3. Running the Demo

```bash
cd backend/dynamic_functions
python demo.py
```

This will demonstrate:
- Module discovery
- Function listing with signatures
- Function execution examples
- Error handling scenarios

## Example Function Modules

### Math Operations (`math_operations.py`)

```python
def add_numbers(a: float, b: float) -> float:
    """Add two numbers together."""
    return a + b

def factorial(n: int) -> int:
    """Calculate the factorial of a number."""
    # Implementation...

def is_prime(num: int) -> bool:
    """Check if a number is prime."""
    # Implementation...
```

### String Utilities (`string_utils.py`)

```python
def reverse_string(text: str) -> str:
    """Reverse a string."""
    return text[::-1]

def extract_emails(text: str) -> list:
    """Extract email addresses from text."""
    # Implementation...

def text_statistics(text: str) -> dict:
    """Get various statistics about a text."""
    # Implementation...
```

### Date Utilities (`date_utils.py`)

```python
def current_timestamp() -> str:
    """Get the current timestamp as a string."""
    return datetime.now().isoformat()

def calculate_age(birth_date: str) -> int:
    """Calculate age based on birth date."""
    # Implementation...

def is_weekend(date_str: str) -> bool:
    """Check if a given date falls on a weekend."""
    # Implementation...
```

## REST API Usage

### Integrating with FastAPI

```python
from fastapi import FastAPI
from dynamic_functions.api import router

app = FastAPI()
app.include_router(router)
```

### API Endpoints

- `GET /dynamic-functions/modules` - List all available modules
- `GET /dynamic-functions/functions` - List all functions from all modules
- `GET /dynamic-functions/modules/{module_name}/functions` - List functions in a specific module
- `GET /dynamic-functions/modules/{module_name}/functions/{function_name}` - Get function signature
- `POST /dynamic-functions/execute` - Execute a function
- `GET /dynamic-functions/health` - Health check

### Example API Calls

```bash
# List all modules
curl http://localhost:8000/dynamic-functions/modules

# Get functions in math_operations module
curl http://localhost:8000/dynamic-functions/modules/math_operations/functions

# Execute a function
curl -X POST http://localhost:8000/dynamic-functions/execute \
  -H "Content-Type: application/json" \
  -d '{
    "module_name": "math_operations",
    "function_name": "add_numbers",
    "parameters": {"a": 10, "b": 25}
  }'
```

## Creating Custom Function Modules

### 1. Create a New Module

Create a new Python file in the `dynamic_functions` directory:

```python
# my_custom_functions.py

def custom_function(param1: str, param2: int = 10) -> str:
    """
    A custom function example.
    
    Args:
        param1: A string parameter
        param2: An integer parameter with default value
        
    Returns:
        A formatted string
    """
    return f"Hello {param1}, number is {param2}"

def another_function(data: list) -> dict:
    """Process a list and return statistics."""
    return {
        "length": len(data),
        "sum": sum(data) if all(isinstance(x, (int, float)) for x in data) else None,
        "types": list(set(type(x).__name__ for x in data))
    }
```

### 2. Function Requirements

For functions to be discovered and executed properly:

- ✅ Use type annotations for parameters and return values
- ✅ Include comprehensive docstrings
- ✅ Handle errors gracefully
- ✅ Avoid functions starting with underscore (private functions)
- ✅ Use meaningful parameter names

## Advanced Features

### Error Handling

The system provides comprehensive error handling:

```python
try:
    result = executor.execute_function("invalid_module", "some_function")
except FileNotFoundError:
    print("Module not found")
except ValueError:
    print("Function not found")
except TypeError:
    print("Invalid parameters")
```

### Parameter Validation

The system automatically validates:
- Required vs optional parameters
- Parameter types (at runtime)
- Function signatures

### Performance Considerations

- Modules are loaded once and cached
- Function signatures are computed once per module load
- Minimal overhead for function execution

## Integration Examples

### With Your Existing Backend

```python
# In your main.py or wherever you set up FastAPI
from dynamic_functions.api import router as dynamic_functions_router

app = FastAPI()
app.include_router(dynamic_functions_router)
```

### Programmatic Usage

```python
from dynamic_functions.function_executor import DynamicFunctionExecutor

class MyService:
    def __init__(self):
        self.executor = DynamicFunctionExecutor()
    
    def process_data(self, operation: str, **params):
        # Dynamically execute operations based on user input
        return self.executor.execute_function(
            module_name="data_processing",
            function_name=operation,
            **params
        )
```

## Testing

```python
# Test the system
def test_dynamic_execution():
    executor = DynamicFunctionExecutor()
    
    # Test module discovery
    modules = executor.discover_modules()
    assert len(modules) > 0
    
    # Test function execution
    result = executor.execute_function(
        "math_operations", "add_numbers", a=2, b=3
    )
    assert result == 5
```

## Troubleshooting

### Common Issues

1. **Module not found**: Ensure the Python file is in the `dynamic_functions` directory
2. **Function not discovered**: Check that the function doesn't start with underscore
3. **Import errors**: Ensure all dependencies are installed
4. **Type errors**: Verify parameter types match function signatures

### Debug Mode

```python
# Enable detailed error messages
executor = DynamicFunctionExecutor()
try:
    result = executor.execute_function(...)
except Exception as e:
    print(f"Detailed error: {e}")
    import traceback
    traceback.print_exc()
```

## License

This dynamic function execution system is part of your project and follows your project's licensing terms.