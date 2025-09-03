#!/usr/bin/env python3
"""
Debug script to check user verification status
"""
import asyncio
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..'))

from backend_python.src.db import get_collections
from backend_python.src.utils.log import logger

async def check_user_verification(email: str):
    """Check the verification status of a user"""
    try:
        collections = get_collections()
        users_collection = collections["users"]
        
        logger.info(f"Looking up user: {email}")
        user = await users_collection.find_one({"email": email})
        
        if not user:
            logger.error(f"User not found: {email}")
            return
        
        logger.info(f"User found: {email}")
        logger.info(f"User ID: {user.get('_id')}")
        logger.info(f"Verified status: {user.get('verified', 'NOT SET')}")
        logger.info(f"Verification token: {user.get('verification_token', 'NOT SET')}")
        logger.info(f"Has tenantId: {user.get('tenantId', 'NOT SET')}")
        logger.info(f"Created at: {user.get('created_at', 'NOT SET')}")
        logger.info(f"Verified at: {user.get('verified_at', 'NOT SET')}")
        
        # Check all fields
        logger.info("All user fields:")
        for key, value in user.items():
            if key != 'password_hash':  # Don't log password hash
                logger.info(f"  {key}: {value}")
                
    except Exception as e:
        logger.error(f"Error checking user: {e}")

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python debug_user.py <email>")
        sys.exit(1)
    
    email = sys.argv[1]
    asyncio.run(check_user_verification(email))
