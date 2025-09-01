"""Simple logging utilities for component discovery."""

import logging

logger = logging.getLogger(__name__)

def log_event(event_name: str, **kwargs):
    """Log an event with additional metadata."""
    try:
        message = f"Event: {event_name}"
        if kwargs:
            message += f" | Data: {kwargs}"
        logger.info(message)
    except Exception as e:
        logger.warning(f"Failed to log event {event_name}: {e}")
