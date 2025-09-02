import os
import logging
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorGridFSBucket

logger = logging.getLogger(__name__)

DEFAULT_URI = os.getenv('MONGO_URL', 'mongodb://127.0.0.1:8801')
DEFAULT_DB = os.getenv('MONGO_DB', 'giap')

client = None
db = None


async def connect_db(uri: str = DEFAULT_URI, db_name: str = DEFAULT_DB):
    global client, db
    if db is not None:
        return db
    
    client = AsyncIOMotorClient(uri)
    db = client[db_name]
    logger.info(f"[DB] Connected to {uri}/{db_name}")
    await ensure_indexes()
    return db


def get_db():
    if db is None:
        raise RuntimeError('DB not connected. Call connect_db() first.')
    return db


def get_collections():
    database = get_db()
    return {
        'users': database['users'],
        'verificationTokens': database['verificationTokens'],
        'roles': database['roles'],
        'userRoles': database['userRoles'],
        'menuItems': database['menuItems'],
        'modelconfigs': database['modelconfigs'],
        'tool_config': database['tool_config'],
        'tenants': database['tenants'],
    'knowledge_Collection': database['knowledge_Collection'],
    }


def get_bucket(bucket_name: str = 'uploads'):
    return AsyncIOMotorGridFSBucket(get_db(), bucket_name=bucket_name)


async def ensure_indexes():
    collections = get_collections()
    
    # Create indexes
    try:
        await collections['users'].create_index("id", unique=True)
        await collections['users'].create_index("email", unique=True)
        await collections['verificationTokens'].create_index("token", unique=True)
        await collections['verificationTokens'].create_index(
            "createdAt", 
            expireAfterSeconds=60 * 60 * 24 * 3  # 3 days
        )
        
        # RBAC indexes
        await collections['roles'].create_index("roleId", unique=True)
        await collections['roles'].create_index("roleName", unique=True)
        await collections['userRoles'].create_index([("userId", 1), ("roleId", 1)], unique=True)
        await collections['userRoles'].create_index("userId")
        await collections['userRoles'].create_index("roleId")
        
        # Menu items indexes
        await collections['menuItems'].create_index("order")
        await collections['menuItems'].create_index("parentId")
        await collections['menuItems'].create_index("isActive")
        
        # Model configurations indexes
        await collections['modelconfigs'].create_index("name", unique=True)
        await collections['modelconfigs'].create_index("category")
        await collections['modelconfigs'].create_index("type")
        await collections['modelconfigs'].create_index("created_at")
        
        # Tool configurations indexes
        await collections['tool_config'].create_index("name", unique=True)
        await collections['tool_config'].create_index("category")
        await collections['tool_config'].create_index("type")
        await collections['tool_config'].create_index("created_at")
        
        # Tenant indexes
        await collections['tenants'].create_index("tenantId", unique=True)
        await collections['tenants'].create_index("name")
        await collections['tenants'].create_index("createdAt")
        
        # Add tenant_id indexes to existing collections for multi-tenancy
        await collections['users'].create_index("tenantId")
        await collections['roles'].create_index("tenantId")
        await collections['userRoles'].create_index("tenantId")
        await collections['menuItems'].create_index("tenantId")
        await collections['modelconfigs'].create_index("tenantId")
        await collections['tool_config'].create_index("tenantId")
        # Knowledge collection indexes
        await collections['knowledge_Collection'].create_index([("tenantId", 1), ("prefix", 1)], unique=True)
        await collections['knowledge_Collection'].create_index("category")
        await collections['knowledge_Collection'].create_index("created_at")

        logger.info("[DB] Indexes created successfully")
    except Exception as e:
        logger.error(f"[DB] Error creating indexes: {e}")


async def init_database(uri: str = DEFAULT_URI, db_name: str = DEFAULT_DB):
    """Initialize database connection - alias for connect_db"""
    return await connect_db(uri, db_name)


async def close_database():
    """Close database connection"""
    global client, db
    if client:
        client.close()
        client = None
        db = None
        logger.info("[DB] Database connection closed")

