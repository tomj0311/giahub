"""
Mathematical operations module for dynamic function execution.
"""

def add_numbers(a: float, b: float) -> float:
    """
    Add two numbers together.
    
    Args:
        a: First number
        b: Second number
        
    Returns:
        Sum of a and b
    """
    return a + b


def multiply_numbers(x: float, y: float, z: float = 1.0) -> float:
    """
    Multiply three numbers together.
    
    Args:
        x: First number
        y: Second number
        z: Third number (optional, defaults to 1.0)
        
    Returns:
        Product of x, y, and z
    """
    return x * y * z


def calculate_power(base: float, exponent: int = 2) -> float:
    """
    Calculate base raised to the power of exponent.
    
    Args:
        base: The base number
        exponent: The exponent (defaults to 2 for square)
        
    Returns:
        Result of base^exponent
    """
    return base ** exponent


def factorial(n: int) -> int:
    """
    Calculate the factorial of a number.
    
    Args:
        n: A non-negative integer
        
    Returns:
        Factorial of n
        
    Raises:
        ValueError: If n is negative
    """
    if n < 0:
        raise ValueError("Factorial is not defined for negative numbers")
    
    if n == 0 or n == 1:
        return 1
    
    result = 1
    for i in range(2, n + 1):
        result *= i
    
    return result


def is_prime(num: int) -> bool:
    """
    Check if a number is prime.
    
    Args:
        num: The number to check
        
    Returns:
        True if the number is prime, False otherwise
    """
    if num < 2:
        return False
    
    for i in range(2, int(num ** 0.5) + 1):
        if num % i == 0:
            return False
    
    return True