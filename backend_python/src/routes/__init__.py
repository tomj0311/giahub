# Routes package
from .auth import router as auth_router
from .users import router as users_router
from .payments import router as payments_router
from .uploads import router as uploads_router
from .profile import router as profile_router
from .roles import router as roles_router
from .role_management import router as role_management_router
from .menu import router as menu_router
from .model_config import router as model_config_router
from .tool_config import router as tool_config_router
from .knowledge import router as knowledge_router
from .agents import router as agents_router
from .agent_runtime import router as agent_runtime_router
from .tenant import router as tenant_router
from .workflow_config import router as workflow_config_router

__all__ = [
    "auth_router", 
    "users_router", 
    "payments_router", 
    "uploads_router", 
    "profile_router", 
    "roles_router", 
    "role_management_router", 
    "menu_router", 
    "model_config_router",
    "tool_config_router",
    "knowledge_router",
    "agents_router",
    "agent_runtime_router",
    "tenant_router",
    "workflow_config_router",
]

