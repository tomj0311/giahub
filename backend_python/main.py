import os
import ssl
import logging
import sys
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.sessions import SessionMiddleware
import uvicorn
from dotenv import load_dotenv

# Add current directory to Python path for imports
current_dir = Path(__file__).parent
project_root = current_dir.parent  # Go up to gia_platform root
sys.path.insert(0, str(current_dir))
sys.path.insert(0, str(project_root))  # Add project root so we can import 'ai' module

from src.db import connect_db
from src.routes import auth, users, payments, uploads, profile, roles, role_management, menu, discovery
from src.routes.model_config import router as model_config_router
from src.services.rbac_service import init_default_roles
from src.services.menu_service import MenuService

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables FIRST
load_dotenv()

# Debug: Check if Google OAuth variables are loaded
logger.info("🔍 Environment Variables Check:")
logger.info(f"- GOOGLE_CLIENT_ID: {'Loaded ✅' if os.getenv('GOOGLE_CLIENT_ID') else 'Missing ❌'}")
logger.info(f"- GOOGLE_CLIENT_SECRET: {'Loaded ✅' if os.getenv('GOOGLE_CLIENT_SECRET') else 'Missing ❌'}")

# Basic startup diagnostics (non-sensitive)
if not os.getenv('JWT_SECRET'):
    os.environ['JWT_SECRET'] = 'dev_jwt_secret'
    logger.warning('[WARN] JWT_SECRET not set; using insecure development fallback.')

logger.info('[BOOT] Starting API with config: {}'.format({
    'PORT': os.getenv('PORT', 4000),
    'CLIENT_URL': os.getenv('CLIENT_URL'),
    'TLS': bool(os.getenv('TLS_KEY') and os.getenv('TLS_CERT')),
    'ENVIRONMENT': os.getenv('ENVIRONMENT', 'development')
}))


from fastapi import FastAPI
from contextlib import asynccontextmanager
from src.db import init_database, close_database
from src.routes import auth_router, users_router, payments_router, uploads_router, profile_router, roles_router, role_management_router, menu_router, discovery_router, model_config_router
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize database on startup
    await init_database()
    logger.info("Database initialized")
    
    # Initialize default roles
    await init_default_roles()
    logger.info("Default roles initialized")
    
    # Initialize default menu items
    await MenuService.seed_default_menu_items()
    logger.info("Default menu items initialized")
    
    yield
    # Close database on shutdown
    await close_database()
    logger.info("Database closed")


app = FastAPI(lifespan=lifespan)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],  # Frontend URLs
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth_router)
app.include_router(users_router)
app.include_router(payments_router)
app.include_router(uploads_router)
app.include_router(profile_router)
app.include_router(roles_router)
app.include_router(role_management_router)
app.include_router(menu_router)
app.include_router(discovery_router)
app.include_router(model_config_router)


@app.get("/")
async def root():
    return {"message": "GIA Platform API is running"}


# Create FastAPI app
app = FastAPI(
    title="ConsultFlow API",
    description="Healthcare consultation platform API",
    version="0.1.0",
    lifespan=lifespan
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv('CLIENT_URL', '*')],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Session middleware for OAuth
app.add_middleware(
    SessionMiddleware, 
    secret_key=os.getenv('JWT_SECRET', 'dev_jwt_secret'),
    max_age=86400  # 24 hours
)


@app.get("/health")
async def health_check():
    return {"status": "ok"}


# Include routers
app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(users.router, prefix="/users", tags=["users"])
app.include_router(profile.router, prefix="/profile", tags=["profile"])
app.include_router(payments.router, prefix="/payments", tags=["payments"])
app.include_router(uploads.router, prefix="/uploads", tags=["uploads"])
app.include_router(roles.router, prefix="/rbac", tags=["roles"])
app.include_router(role_management.router, prefix="/rbac", tags=["role-management"])
app.include_router(menu.router, prefix="/api", tags=["menu"])
app.include_router(discovery.router)
app.include_router(model_config_router)


# No WebSocket routes needed - only HTTP


if __name__ == "__main__":
    # FORCE PORT 4000 - NO BULLSHIT
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=4000,
        reload=False,
        access_log=False
    )
