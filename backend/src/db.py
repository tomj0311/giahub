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
        logger.info(f"[DB] Using existing connection to {db_name}")
        return db

    logger.info(f"[DB] Connecting to database: {uri}/{db_name}")
    try:
        client = AsyncIOMotorClient(uri)
        db = client[db_name]
        logger.info(f"[DB] Connected successfully to {uri}/{db_name}")
        await ensure_indexes()
        return db
    except Exception as e:
        logger.error(f"[DB] Failed to connect to database: {e}")
        raise


def get_db():
    if db is None:
        logger.error("[DB] Database not connected - call connect_db() first")
        raise RuntimeError("DB not connected. Call connect_db() first.")
    # Removed debug log to reduce noise during frequent calls
    return db


def get_collections():
    global _collections_cache
    if _collections_cache is not None:
        return _collections_cache
        
    logger.debug("[DB] Getting database collections")
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
    logger.debug(f"[DB] Retrieved {len(_collections_cache)} collections")
    return _collections_cache


def clear_collections_cache():
    """Clear the collections cache to force refresh on next call"""
    global _collections_cache
    _collections_cache = None


def get_bucket(bucket_name: str = "uploads"):
    logger.debug(f"[DB] Getting GridFS bucket: {bucket_name}")
    bucket = AsyncIOMotorGridFSBucket(get_db(), bucket_name=bucket_name)
    return bucket


async def ensure_indexes():
    logger.info("[DB] Starting index creation process")
    collections = get_collections()
    # One-time migration: rename legacy collection 'knowledge_Collection' -> 'knowledgeConfig'
    # Safe: only if old exists and new doesn't.
    try:
        database = get_db()
        names = await database.list_collection_names()
        if "knowledge_Collection" in names and "knowledgeConfig" not in names:
            await database["knowledge_Collection"].rename("knowledgeConfig")
            logger.info(
                "[DB] Renamed collection 'knowledge_Collection' -> 'knowledgeConfig'"
            )
            # refresh handles after rename
            collections = get_collections()
    except Exception as e:
        logger.warning(f"[DB] Collection rename check failed: {e}")

    # Create indexes
    try:
        logger.debug("[DB] Creating user indexes")
        await collections["users"].create_index("id", unique=True)
        await collections["users"].create_index("email", unique=True)
        
        logger.debug("[DB] Creating verification token indexes")
        await collections["verificationTokens"].create_index("token", unique=True)
        await collections["verificationTokens"].create_index(
            "createdAt", expireAfterSeconds=60 * 60 * 24 * 3  # 3 days
        )

        logger.debug("[DB] Creating RBAC indexes")
        # RBAC indexes
        await collections["roles"].create_index("roleId", unique=True)
        await collections["roles"].create_index("roleName", unique=True)
        await collections["userRoles"].create_index(
            [("userId", 1), ("roleId", 1)], unique=True
        )
        await collections["userRoles"].create_index("userId")
        await collections["userRoles"].create_index("roleId")

        logger.debug("[DB] Creating menu item indexes")
        # Menu items indexes
        await collections["menuItems"].create_index("order")
        await collections["menuItems"].create_index("parentId")
        await collections["menuItems"].create_index("isActive")

        logger.debug("[DB] Creating model configuration indexes")
        # Model configurations indexes - tenant-scoped unique name
        await collections["modelConfig"].create_index([("tenantId", 1), ("name", 1)], unique=True)
        await collections["modelConfig"].create_index("category")
        await collections["modelConfig"].create_index("type")
        await collections["modelConfig"].create_index("created_at")

        logger.debug("[DB] Creating tool configuration indexes")
        # Tool configurations indexes - tenant-scoped unique name
        await collections["toolConfig"].create_index([("tenantId", 1), ("name", 1)], unique=True)
        await collections["toolConfig"].create_index("category")
        await collections["toolConfig"].create_index("type")
        await collections["toolConfig"].create_index("created_at")

        logger.debug("[DB] Creating embedder configuration indexes")
        # Embedder configurations indexes - tenant-scoped unique name
        await collections["embedderConfig"].create_index([("tenantId", 1), ("name", 1)], unique=True)
        await collections["embedderConfig"].create_index("category")
        await collections["embedderConfig"].create_index("type")
        await collections["embedderConfig"].create_index("created_at")

        logger.debug("[DB] Creating tenant indexes")
        # Tenant indexes
        await collections["tenants"].create_index("tenantId", unique=True)
        await collections["tenants"].create_index("name")
        await collections["tenants"].create_index("createdAt")

        logger.debug("[DB] Creating multi-tenancy indexes")
        # Add tenant_id indexes to existing collections for multi-tenancy
        # NOTE: menuItems collection is intentionally global (no tenantId isolation)
        await collections["users"].create_index("tenantId")
        await collections["roles"].create_index("tenantId")
        await collections["userRoles"].create_index("tenantId")
        await collections["modelConfig"].create_index("tenantId")
        await collections["toolConfig"].create_index("tenantId")
        await collections["embedderConfig"].create_index("tenantId")

        logger.debug("[DB] Creating knowledge collection indexes")
        # Knowledge collection indexes - handle transition from prefix to collection
        try:
            # Try to drop old index if it exists
            try:
                await collections["knowledgeConfig"].drop_index("tenantId_1_prefix_1")
                logger.info("[DB] Dropped old tenantId_1_prefix_1 index")
            except Exception:
                pass  # Index might not exist
            
            # Create new index with collection field
            await collections["knowledgeConfig"].create_index(
                [("tenantId", 1), ("collection", 1)], unique=True
            )
        except Exception as e:
            logger.warning(f"[DB] Index creation warning: {e}")
            
        await collections["knowledgeConfig"].create_index("category")
        await collections["knowledgeConfig"].create_index("created_at")

        logger.debug("[DB] Creating agent indexes")
        # Agents collection indexes
        await collections["agents"].create_index([("tenantId", 1), ("name", 1)], unique=True)
        await collections["agents"].create_index("category")
        await collections["agents"].create_index("created_at")

        logger.debug("[DB] Creating conversation indexes")
        # Conversations collection indexes
        await collections["conversations"].create_index([("tenantId", 1), ("conversation_id", 1)], unique=True)
        await collections["conversations"].create_index("updated_at")

        logger.debug("[DB] Creating agent runs indexes")
        # Agent runs collection indexes for audit and analytics
        await collections["agent_runs"].create_index("tenantId")
        await collections["agent_runs"].create_index("user_id")
        await collections["agent_runs"].create_index("agent_name")
        await collections["agent_runs"].create_index("conv_id")
        await collections["agent_runs"].create_index("created_at")
        await collections["agent_runs"].create_index([("tenantId", 1), ("user_id", 1)])
        await collections["agent_runs"].create_index([("tenantId", 1), ("agent_name", 1)])

        logger.debug("[DB] Creating workflow configuration indexes")
        # Workflow configuration indexes
        await collections["workflowConfig"].create_index([("tenantId", 1), ("name", 1)], unique=True)
        await collections["workflowConfig"].create_index("category")
        await collections["workflowConfig"].create_index("type")
        await collections["workflowConfig"].create_index("created_at")
        await collections["workflowConfig"].create_index("tenantId")

        logger.debug("[DB] Creating workflowInstances indexes")
        await collections["workflowInstances"].create_index("instance_id", unique=True)
        await collections["workflowInstances"].create_index("config_id")
        await collections["workflowInstances"].create_index("status")
        await collections["workflowInstances"].create_index("created_at")
        await collections["workflowInstances"].create_index("tenantId")
        await collections["workflowInstances"].create_index([("tenantId", 1), ("status", 1), ("created_at", -1)])

        logger.debug("[DB] Creating project indexes")
        # Projects collection indexes
        await collections["projects"].create_index([("tenantId", 1), ("name", 1)], unique=True)
        await collections["projects"].create_index("parent_id")
        await collections["projects"].create_index("status")
        await collections["projects"].create_index("priority")
        await collections["projects"].create_index("assignee")
        await collections["projects"].create_index("due_date")
        await collections["projects"].create_index("created_at")
        await collections["projects"].create_index([("tenantId", 1), ("parent_id", 1)])

        logger.debug("[DB] Creating project activities indexes")
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

        logger.debug("[DB] Creating activity notifications indexes")
        # Activity notifications collection indexes
        await collections["activityNotifications"].create_index("activity_id")
        await collections["activityNotifications"].create_index("sender_id")
        await collections["activityNotifications"].create_index("created_at")
        await collections["activityNotifications"].create_index([("tenantId", 1), ("activity_id", 1)])
        await collections["activityNotifications"].create_index([("tenantId", 1), ("activity_id", 1), ("created_at", -1)])

        logger.info("[DB] Indexes created successfully")
    except Exception as e:
        logger.error(f"[DB] Error creating indexes: {e}")
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
        _collections_cache = None  # Clear cache on close
        logger.info("[DB] Database connection closed")
