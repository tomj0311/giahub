# Routes package
from . import auth, users, payments, uploads, profile, roles, role_management, menu, discovery

__all__ = ["auth", "users", "payments", "uploads", "profile", "roles", "role_management", "menu", "discovery"]
from .discovery import discovery_router
