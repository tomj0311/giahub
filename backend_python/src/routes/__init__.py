# Routes package
from .auth import router as auth_router
from .users import router as users_router
from .payments import router as payments_router
from .uploads import router as uploads_router
from .profile import router as profile_router
from .roles import router as roles_router
from .role_management import router as role_management_router
from .menu import router as menu_router
from .discovery import discovery_router
from .model_config import router as model_config_router

__all__ = [
    "auth_router", 
    "users_router", 
    "payments_router", 
    "uploads_router", 
    "profile_router", 
    "roles_router", 
    "role_management_router", 
    "menu_router", 
    "discovery_router",
    "model_config_router"
]
