"""
Date and time utilities for dynamic function execution.
"""

from datetime import datetime, timedelta
from typing import Optional


def current_timestamp() -> str:
    """
    Get the current timestamp as a string.
    
    Returns:
        Current timestamp in ISO format
    """
    return datetime.now().isoformat()


def add_days_to_date(date_str: str, days: int) -> str:
    """
    Add a number of days to a date.
    
    Args:
        date_str: Date in YYYY-MM-DD format
        days: Number of days to add (can be negative)
        
    Returns:
        New date in YYYY-MM-DD format
    """
    try:
        date_obj = datetime.strptime(date_str, "%Y-%m-%d")
        new_date = date_obj + timedelta(days=days)
        return new_date.strftime("%Y-%m-%d")
    except ValueError:
        raise ValueError("Date must be in YYYY-MM-DD format")


def calculate_age(birth_date: str) -> int:
    """
    Calculate age based on birth date.
    
    Args:
        birth_date: Birth date in YYYY-MM-DD format
        
    Returns:
        Age in years
    """
    try:
        birth = datetime.strptime(birth_date, "%Y-%m-%d")
        today = datetime.now()
        age = today.year - birth.year - ((today.month, today.day) < (birth.month, birth.day))
        return age
    except ValueError:
        raise ValueError("Birth date must be in YYYY-MM-DD format")


def format_datetime(timestamp: str, format_string: str = "%Y-%m-%d %H:%M:%S") -> str:
    """
    Format a datetime string into a different format.
    
    Args:
        timestamp: Input timestamp (ISO format expected)
        format_string: Desired output format
        
    Returns:
        Formatted datetime string
    """
    try:
        dt = datetime.fromisoformat(timestamp)
        return dt.strftime(format_string)
    except ValueError:
        raise ValueError("Invalid timestamp format")


def days_between_dates(start_date: str, end_date: str) -> int:
    """
    Calculate the number of days between two dates.
    
    Args:
        start_date: Start date in YYYY-MM-DD format
        end_date: End date in YYYY-MM-DD format
        
    Returns:
        Number of days between the dates
    """
    try:
        start = datetime.strptime(start_date, "%Y-%m-%d")
        end = datetime.strptime(end_date, "%Y-%m-%d")
        return (end - start).days
    except ValueError:
        raise ValueError("Dates must be in YYYY-MM-DD format")


def is_weekend(date_str: str) -> bool:
    """
    Check if a given date falls on a weekend.
    
    Args:
        date_str: Date in YYYY-MM-DD format
        
    Returns:
        True if the date is a weekend (Saturday or Sunday), False otherwise
    """
    try:
        date_obj = datetime.strptime(date_str, "%Y-%m-%d")
        # weekday() returns 5 for Saturday, 6 for Sunday
        return date_obj.weekday() >= 5
    except ValueError:
        raise ValueError("Date must be in YYYY-MM-DD format")