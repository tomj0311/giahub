import uuid
import secrets
import logging
from typing import Dict, Any

from ..db import get_collections

logger = logging.getLogger(__name__)

# Base AI agent configuration
BASE_AGENT = {
    "description": "AI consultation assistant",
    "category": "ConsultFlow",
    "instructions": "Provide general consultation guidance and support.",
    "model": {
        "path": "ai.model.openai",
        "api_key": "demo",
        "id": "gpt-4.1"
    },
    "tools": {
        "ai.tools.firecrawl": {},
        "ai.tools.exa": {
            "api_key": "exa_demo_key"
        }
    },
    "memory": {
        "history": {
            "enabled": True,
            "num": 3
        }
    },
    "knowledge": {
        "sources": {
            "ai.knowledge.text": {
                "uploaded_files": ["out.csv"],
                "path": "users/api-test/knowledge/ai.knowledge.text"
            }
        },
        "chunk": {
            "strategy": "semantic",
            "size": 800,
            "overlap": 80
        },
        "add_context": True
    }
}


async def seed_providers():
    """Seed initial providers in the database"""
    collections = get_collections()
    
    # Check if providers already exist
    count = await collections['providers'].estimated_document_count()
    if count > 0:
        logger.info('[SEED] Providers already exist, skipping seed')
        return
    
    logger.info('[SEED] Creating initial providers in DB...')
    
    # Provider names
    provider_names = [
        'Provider Ava',
        'Provider Liam', 
        'Provider Noah',
        'Provider Emma',
        'Provider Mia',
        'Provider Zoe'
    ]
    
    # Create provider documents
    providers = []
    for name in provider_names:
        provider = {
            "id": str(uuid.uuid4()),
            "name": name,
            "rank": secrets.randbelow(100),  # Random rank 0-99
            "role": "provider",
            "active": True,
            "aiAgent": {
                "name": name,
                **BASE_AGENT
            }
        }
        providers.append(provider)
    
    # Insert providers into database
    await collections['providers'].insert_many(providers)
    
    logger.info('[SEED] Providers seeded successfully')
