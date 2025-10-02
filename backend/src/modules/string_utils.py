"""
String manipulation utilities for dynamic function execution.
"""

def reverse_string(text: str) -> str:
    """
    Reverse a string.
    
    Args:
        text: The string to reverse
        
    Returns:
        The reversed string
    """
    return text[::-1]


def count_words(text: str, case_sensitive: bool = False) -> int:
    """
    Count the number of words in a text.
    
    Args:
        text: The text to count words in
        case_sensitive: Whether to consider case when counting
        
    Returns:
        Number of words in the text
    """
    if not case_sensitive:
        text = text.lower()
    
    words = text.split()
    return len(words)


def extract_emails(text: str) -> list:
    """
    Extract email addresses from text using simple pattern matching.
    
    Args:
        text: The text to search for email addresses
        
    Returns:
        List of email addresses found
    """
    import re
    email_pattern = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
    emails = re.findall(email_pattern, text)
    return emails


def capitalize_words(text: str, delimiter: str = " ") -> str:
    """
    Capitalize the first letter of each word in a string.
    
    Args:
        text: The text to capitalize
        delimiter: The delimiter to split words on (defaults to space)
        
    Returns:
        Text with each word capitalized
    """
    words = text.split(delimiter)
    capitalized_words = [word.capitalize() for word in words]
    return delimiter.join(capitalized_words)


def remove_duplicates(text: str, preserve_order: bool = True) -> str:
    """
    Remove duplicate characters from a string.
    
    Args:
        text: The input string
        preserve_order: Whether to preserve the order of first occurrence
        
    Returns:
        String with duplicate characters removed
    """
    if preserve_order:
        seen = set()
        result = []
        for char in text:
            if char not in seen:
                seen.add(char)
                result.append(char)
        return ''.join(result)
    else:
        return ''.join(set(text))


def text_statistics(text: str) -> dict:
    """
    Get various statistics about a text.
    
    Args:
        text: The text to analyze
        
    Returns:
        Dictionary containing text statistics
    """
    return {
        "length": len(text),
        "word_count": len(text.split()),
        "character_count": len(text),
        "unique_characters": len(set(text)),
        "line_count": len(text.splitlines()),
        "uppercase_count": sum(1 for c in text if c.isupper()),
        "lowercase_count": sum(1 for c in text if c.islower()),
        "digit_count": sum(1 for c in text if c.isdigit()),
        "space_count": sum(1 for c in text if c.isspace())
    }