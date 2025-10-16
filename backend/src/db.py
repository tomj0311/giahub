import os
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorGridFSBucket

from .utils.log import logger

DEFAULT_URI = os.getenv("MONGO_URL", "mongodb://127.0.0.1:8801")
DEFAULT_DB = os.getenv("MONGO_DB", "giap")

client = None
db = None
_collections_cache = None


async def connect_db(uri: str = DEFAULT_URI, db_name: str = DEFAULT_DB):
    global client, db
    if db is not None:
        return db

    logger.info(f"Connecting to database: {db_name}")
    try:
        client = AsyncIOMotorClient(uri)
        db = client[db_name]
        await ensure_indexes()
        return db
    except Exception as e:
        logger.error(f"Failed to connect to database: {e}")
        raise


def get_db():
    if db is None:
        logger.error("Database not connected - call connect_db() first")
        raise RuntimeError("DB not connected. Call connect_db() first.")
    return db


def get_collections():
    global _collections_cache
    if _collections_cache is not None:
        return _collections_cache
        
    database = get_db()
    _collections_cache = {
        "users": database["users"],
        "verificationTokens": database["verificationTokens"],
        "roles": database["roles"],
        "userRoles": database["userRoles"],
        "menuItems": database["menuItems"],
        "modelConfig": database["modelConfig"],
        "toolConfig": database["toolConfig"],
        "embedderConfig": database["embedderConfig"],
        "tenants": database["tenants"],
        "knowledgeConfig": database["knowledgeConfig"],
        "agents": database["agents"],
        "conversations": database["conversations"],
        "agent_runs": database["agent_runs"],
        "workflowConfig": database["workflowConfig"],
        "workflowInstances": database["workflowInstances"],
        "projects": database["projects"],
        "projectActivities": database["projectActivities"],
        "activityNotifications": database["activityNotifications"],
    }
    return _collections_cache


def clear_collections_cache():
    """Clear the collections cache to force refresh on next call"""
    global _collections_cache
    _collections_cache = None


def get_bucket(bucket_name: str = "uploads"):
    bucket = AsyncIOMotorGridFSBucket(get_db(), bucket_name=bucket_name)
    return bucket


async def ensure_indexes():
    logger.info("Creating database indexes...")
    collections = get_collections()
    # One-time migration: rename legacy collection 'knowledge_Collection' -> 'knowledgeConfig'
    try:
        database = get_db()
        names = await database.list_collection_names()
        if "knowledge_Collection" in names and "knowledgeConfig" not in names:
            await database["knowledge_Collection"].rename("knowledgeConfig")
            logger.info("Renamed collection 'knowledge_Collection' -> 'knowledgeConfig'")
            collections = get_collections()
    except Exception as e:
        logger.warning(f"Collection rename check failed: {e}")

    # Create indexes
    try:
        # User indexes
        await collections["users"].create_index("id", unique=True)
        await collections["users"].create_index("email", unique=True)
        
        # Verification token indexes
        await collections["verificationTokens"].create_index("token", unique=True)
        await collections["verificationTokens"].create_index(
            "createdAt", expireAfterSeconds=60 * 60 * 24 * 3  # 3 days
        )

        # RBAC indexes
        await collections["roles"].create_index("roleId", unique=True)
        await collections["roles"].create_index("roleName", unique=True)
        await collections["userRoles"].create_index(
            [("userId", 1), ("roleId", 1)], unique=True
        )
        await collections["userRoles"].create_index("userId")
        await collections["userRoles"].create_index("roleId")

        # Menu items indexes
        await collections["menuItems"].create_index("order")
        await collections["menuItems"].create_index("parentId")
        await collections["menuItems"].create_index("isActive")

        # Model configurations indexes - tenant-scoped unique name
        await collections["modelConfig"].create_index([("tenantId", 1), ("name", 1)], unique=True)
        await collections["modelConfig"].create_index("category")
        await collections["modelConfig"].create_index("type")
        await collections["modelConfig"].create_index("created_at")

        # Tool configurations indexes - tenant-scoped unique name
        await collections["toolConfig"].create_index([("tenantId", 1), ("name", 1)], unique=True)
        await collections["toolConfig"].create_index("category")
        await collections["toolConfig"].create_index("type")
        await collections["toolConfig"].create_index("created_at")

        # Embedder configurations indexes - tenant-scoped unique name
        await collections["embedderConfig"].create_index([("tenantId", 1), ("name", 1)], unique=True)
        await collections["embedderConfig"].create_index("category")
        await collections["embedderConfig"].create_index("type")
        await collections["embedderConfig"].create_index("created_at")

        # Tenant indexes
        await collections["tenants"].create_index("tenantId", unique=True)
        await collections["tenants"].create_index("name")
        await collections["tenants"].create_index("createdAt")

        # Add tenant_id indexes to existing collections for multi-tenancy
        await collections["users"].create_index("tenantId")
        await collections["roles"].create_index("tenantId")
        await collections["userRoles"].create_index("tenantId")
        await collections["modelConfig"].create_index("tenantId")
        await collections["toolConfig"].create_index("tenantId")
        await collections["embedderConfig"].create_index("tenantId")

        # Knowledge collection indexes
        try:
            # Try to drop old index if it exists
            try:
                await collections["knowledgeConfig"].drop_index("tenantId_1_prefix_1")
                logger.info("Dropped old tenantId_1_prefix_1 index")
            except Exception:
                pass  # Index might not exist
            
            # Create new index with collection field
            await collections["knowledgeConfig"].create_index(
                [("tenantId", 1), ("collection", 1)], unique=True
            )
        except Exception as e:
            logger.warning(f"Index creation warning: {e}")
            
        await collections["knowledgeConfig"].create_index("category")
        await collections["knowledgeConfig"].create_index("created_at")

        # Agents collection indexes
        await collections["agents"].create_index([("tenantId", 1), ("name", 1)], unique=True)
        await collections["agents"].create_index("category")
        await collections["agents"].create_index("created_at")

        # Conversations collection indexes
        await collections["conversations"].create_index([("tenantId", 1), ("conversation_id", 1)], unique=True)
        await collections["conversations"].create_index("updated_at")

        # Agent runs collection indexes for audit and analytics
        await collections["agent_runs"].create_index("tenantId")
        await collections["agent_runs"].create_index("user_id")
        await collections["agent_runs"].create_index("agent_name")
        await collections["agent_runs"].create_index("conv_id")
        await collections["agent_runs"].create_index("created_at")
        await collections["agent_runs"].create_index([("tenantId", 1), ("user_id", 1)])
        await collections["agent_runs"].create_index([("tenantId", 1), ("agent_name", 1)])

        # Workflow configuration indexes
        await collections["workflowConfig"].create_index([("tenantId", 1), ("name", 1)], unique=True)
        await collections["workflowConfig"].create_index("category")
        await collections["workflowConfig"].create_index("type")
        await collections["workflowConfig"].create_index("created_at")
        await collections["workflowConfig"].create_index("tenantId")

        # Workflow instances indexes
        await collections["workflowInstances"].create_index("instance_id", unique=True)
        await collections["workflowInstances"].create_index("config_id")
        await collections["workflowInstances"].create_index("status")
        await collections["workflowInstances"].create_index("created_at")
        await collections["workflowInstances"].create_index("tenantId")
        await collections["workflowInstances"].create_index([("tenantId", 1), ("status", 1), ("created_at", -1)])

        # Projects collection indexes
        await collections["projects"].create_index([("tenantId", 1), ("name", 1)], unique=True)
        await collections["projects"].create_index("parent_id")
        await collections["projects"].create_index("status")
        await collections["projects"].create_index("priority")
        await collections["projects"].create_index("assignee")
        await collections["projects"].create_index("due_date")
        await collections["projects"].create_index("created_at")
        await collections["projects"].create_index([("tenantId", 1), ("parent_id", 1)])

        # Project activities collection indexes
        await collections["projectActivities"].create_index("project_id")
        await collections["projectActivities"].create_index("type")
        await collections["projectActivities"].create_index("status")
        await collections["projectActivities"].create_index("priority")
        await collections["projectActivities"].create_index("assignee")
        await collections["projectActivities"].create_index("due_date")
        await collections["projectActivities"].create_index("created_at")
        await collections["projectActivities"].create_index([("tenantId", 1), ("project_id", 1)])
        await collections["projectActivities"].create_index([("tenantId", 1), ("type", 1)])

        # Activity notifications collection indexes
        await collections["activityNotifications"].create_index("activity_id")
        await collections["activityNotifications"].create_index("sender_id")
        await collections["activityNotifications"].create_index("created_at")
        await collections["activityNotifications"].create_index([("tenantId", 1), ("activity_id", 1)])
        await collections["activityNotifications"].create_index([("tenantId", 1), ("activity_id", 1), ("created_at", -1)])

        logger.info("Database indexes created successfully")
    except Exception as e:
        logger.error(f"Error creating indexes: {e}")
        raise


async def init_database(uri: str = DEFAULT_URI, db_name: str = DEFAULT_DB):
    """Initialize database connection - alias for connect_db"""
    return await connect_db(uri, db_name)


async def close_database():
    """Close database connection"""
    global client, db, _collections_cache
    if client:
        client.close()
        client = None
        db = None
        _collections_cache = None
        logger.info("Database connection closed")
