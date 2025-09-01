from os import getenv, path, makedirs
import logging
import sys
import warnings

from rich.logging import RichHandler

# Import centralized logging
try:
    from logger.logger import get_logger as centralized_get_logger
    CENTRALIZED_LOGGING_AVAILABLE = True
except ImportError:
    CENTRALIZED_LOGGING_AVAILABLE = False
    warnings.warn("Centralized logging not available, using local implementation")

LOGGER_NAME = "ai"


def get_logger(logger_name: str) -> logging.Logger:
    """
    Get a logger instance. Uses centralized logging if available,
    falls back to local implementation otherwise.
    """
    if CENTRALIZED_LOGGING_AVAILABLE:
        return centralized_get_logger(logger_name)
    
    # Fallback to local implementation
    return _get_local_logger(logger_name)


def _get_local_logger(logger_name: str) -> logging.Logger:
    """Local logger implementation (fallback)."""
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
    file_handler = logging.FileHandler(path.join(logs_dir, "ai.log"))
    file_handler.setFormatter(
        logging.Formatter(
            fmt="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
    )

    _logger = logging.getLogger(logger_name)
    if not _logger.handlers:  # Avoid duplicate handlers
        _logger.addHandler(rich_handler)
        _logger.addHandler(file_handler)
        _logger.setLevel(logging.DEBUG)
        _logger.propagate = False
    return _logger


logger: logging.Logger = get_logger(LOGGER_NAME)


def set_log_level_to_debug():
    if CENTRALIZED_LOGGING_AVAILABLE:
        from logger.logger import set_log_level_to_debug as centralized_set_debug
        centralized_set_debug(LOGGER_NAME)
    else:
        _logger = logging.getLogger(LOGGER_NAME)
        _logger.setLevel(logging.DEBUG)


def set_log_level_to_info():
    if CENTRALIZED_LOGGING_AVAILABLE:
        from logger.logger import set_log_level_to_info as centralized_set_info
        centralized_set_info(LOGGER_NAME)
    else:
        _logger = logging.getLogger(LOGGER_NAME)
        _logger.setLevel(logging.INFO)
