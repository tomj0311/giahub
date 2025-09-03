from os import getenv, path, makedirs
import logging
import sys
from typing import Dict

from rich.logging import RichHandler

# Global logger registry to avoid duplicate loggers
_loggers: Dict[str, logging.Logger] = {}


def get_logger(logger_name: str) -> logging.Logger:
    """
    Get a logger instance with centralized configuration.
    Creates a new logger if it doesn't exist, returns existing one otherwise.
    """
    if logger_name in _loggers:
        return _loggers[logger_name]
    
    # Find the root directory of the program
    try:
        # Assuming the entry point is in the root directory
        root_dir = path.dirname(path.abspath(sys.argv[0]))
    except (AttributeError, IndexError):
        # Fallback to current working directory
        root_dir = path.abspath('.')
    
    # Console handler (Rich)
    rich_handler = RichHandler(
        show_time=False,
        rich_tracebacks=False,
        show_path=True if getenv("AI_API_RUNTIME") == "dev" else False,
        tracebacks_show_locals=False,
    )
    rich_handler.setFormatter(
        logging.Formatter(
            fmt="%(message)s",
            datefmt="[%X]",
        )
    )
    
    # File handler - create logs directory if it doesn't exist
    logs_dir = path.join(root_dir, "logs")
    makedirs(logs_dir, exist_ok=True)
    
    # Create separate log files for different modules
    log_filename = f"{logger_name}.log" if logger_name != "root" else "app.log"
    file_handler = logging.FileHandler(path.join(logs_dir, log_filename))
    file_handler.setFormatter(
        logging.Formatter(
            fmt="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
    )

    # Create and configure logger
    logger = logging.getLogger(logger_name)
    if not logger.handlers:  # Avoid duplicate handlers
        logger.addHandler(rich_handler)
        logger.addHandler(file_handler)
        logger.setLevel(logging.DEBUG)
        logger.propagate = False
    
    # Store in registry
    _loggers[logger_name] = logger
    return logger


def set_log_level_to_debug(logger_name: str):
    """Set log level to DEBUG for a specific logger."""
    if logger_name in _loggers:
        _loggers[logger_name].setLevel(logging.DEBUG)
    else:
        # Create logger with DEBUG level if it doesn't exist
        logger = get_logger(logger_name)
        logger.setLevel(logging.DEBUG)


def set_log_level_to_info(logger_name: str):
    """Set log level to INFO for a specific logger."""
    if logger_name in _loggers:
        _loggers[logger_name].setLevel(logging.INFO)
    else:
        # Create logger with INFO level if it doesn't exist
        logger = get_logger(logger_name)
        logger.setLevel(logging.INFO)


def set_global_log_level(level: int):
    """Set log level for all existing loggers."""
    for logger in _loggers.values():
        logger.setLevel(level)


# Default logger for the application
default_logger = get_logger("app")
