#!/usr/bin/env python3
"""
Script to rename collections from snake_case to camelCase:
- modelconfigs -> modelConfig
- tool_config -> toolConfig
"""

import asyncio
import logging
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def rename_collections():
    """Rename collections to follow camelCase convention"""
    
    # MongoDB connection
    mongodb_url = os.getenv("MONGODB_URL", "mongodb://localhost:27017/your_database")
    client = AsyncIOMotorClient(mongodb_url)
    
    try:
        # Get database from URL
        db_name = mongodb_url.split("/")[-1] if "/" in mongodb_url else "your_database"
        database = client[db_name]
        
        # Get list of existing collections
        existing_collections = await database.list_collection_names()
        logger.info(f"📋 Existing collections: {existing_collections}")
        
        # Rename modelconfigs to modelConfig
        if "modelconfigs" in existing_collections:
            if "modelConfig" not in existing_collections:
                logger.info("🔄 Renaming 'modelconfigs' to 'modelConfig'...")
                await database["modelconfigs"].rename("modelConfig")
                logger.info("✅ Successfully renamed 'modelconfigs' to 'modelConfig'")
            else:
                logger.warning("⚠️ 'modelConfig' collection already exists, skipping rename of 'modelconfigs'")
        else:
            logger.info("ℹ️ 'modelconfigs' collection not found, nothing to rename")
        
        # Rename tool_config to toolConfig
        if "tool_config" in existing_collections:
            if "toolConfig" not in existing_collections:
                logger.info("🔄 Renaming 'tool_config' to 'toolConfig'...")
                await database["tool_config"].rename("toolConfig")
                logger.info("✅ Successfully renamed 'tool_config' to 'toolConfig'")
            else:
                logger.warning("⚠️ 'toolConfig' collection already exists, skipping rename of 'tool_config'")
        else:
            logger.info("ℹ️ 'tool_config' collection not found, nothing to rename")
        
        # Update type field in documents
        logger.info("🔄 Updating document types...")
        
        # Update toolConfig documents
        if "toolConfig" in await database.list_collection_names():
            result = await database["toolConfig"].update_many(
                {"type": "tool_config"},
                {"$set": {"type": "toolConfig"}}
            )
            logger.info(f"✅ Updated {result.modified_count} toolConfig documents")
        
        # Verify the changes
        final_collections = await database.list_collection_names()
        logger.info(f"📋 Final collections: {final_collections}")
        
        # Check document counts
        if "modelConfig" in final_collections:
            count = await database["modelConfig"].count_documents({})
            logger.info(f"📊 modelConfig collection has {count} documents")
        
        if "toolConfig" in final_collections:
            count = await database["toolConfig"].count_documents({})
            logger.info(f"📊 toolConfig collection has {count} documents")
            
            # Check type field values
            tool_config_count = await database["toolConfig"].count_documents({"type": "toolConfig"})
            old_type_count = await database["toolConfig"].count_documents({"type": "tool_config"})
            logger.info(f"📊 toolConfig documents with new type: {tool_config_count}")
            logger.info(f"📊 toolConfig documents with old type: {old_type_count}")
        
        logger.info("🎉 Collection renaming completed successfully!")
        
    except Exception as e:
        logger.error(f"❌ Error during collection renaming: {e}")
        raise
    finally:
        client.close()

if __name__ == "__main__":
    asyncio.run(rename_collections())
