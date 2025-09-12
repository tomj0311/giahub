import os
import jwt  # PyJWT package
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from fastapi import HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from passlib.context import CryptContext

from .log import logger

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

JWT_SECRET = os.getenv('JWT_SECRET', 'dev_jwt_secret')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRATION_HOURS = 8


def hash_password(password: str) -> str:
    """Hash a password using bcrypt"""
    logger.debug(f"[AUTH] Hashing password (length: {len(password)})")
    try:
        hashed = pwd_context.hash(password)
        logger.debug("[AUTH] Password hashed successfully")
        return hashed
    except Exception as e:
        logger.error(f"[AUTH] Failed to hash password: {e}")
        raise


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash"""
    logger.debug("[AUTH] Verifying password")
    try:
        result = pwd_context.verify(plain_password, hashed_password)
        logger.debug(f"[AUTH] Password verification result: {'success' if result else 'failed'}")
        return result
    except Exception as e:
        logger.error(f"[AUTH] Password verification error: {e}")
        return False


def generate_token(payload: Dict[str, Any]) -> str:
    """Generate a JWT token"""
    logger.debug(f"[AUTH] Generating JWT token for: {payload.get('email', payload.get('username', 'unknown'))}")
    try:
        expiration = datetime.utcnow() + timedelta(hours=JWT_EXPIRATION_HOURS)
        payload.update({'exp': expiration})
        token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
        logger.debug(f"[AUTH] JWT token generated successfully (expires in {JWT_EXPIRATION_HOURS} hours)")
        return token
    except Exception as e:
        logger.error(f"[AUTH] Failed to generate JWT token: {e}")
        raise


def verify_token(token: str) -> Dict[str, Any]:
    """Verify and decode a JWT token"""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        # Only log successful verification once per session, not every request
        return payload
    except jwt.ExpiredSignatureError:
        logger.warning("[AUTH] Token verification failed - token expired")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "error": "token expired",
                "redirect": "/login",
                "message": "Your session has expired. Please log in again."
            }
        )
    except jwt.InvalidTokenError as e:
        logger.warning(f"[AUTH] Token verification failed - invalid token: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "error": "invalid token",
                "redirect": "/login", 
                "message": "Invalid authentication token. Please log in again."
            }
        )


async def verify_token_middleware(credentials: HTTPAuthorizationCredentials = Depends(security)) -> Dict[str, Any]:
    """FastAPI dependency for token verification"""
    if not credentials:
        logger.warning("[AUTH] Missing token in request")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "missing token"}
        )
    
    token = credentials.credentials
    return verify_token(token)


def normalize_email(email: str) -> str:
    """Normalize email address"""
    return (email or '').strip().lower()
