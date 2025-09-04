#!/usr/bin/env python3
"""
Migration script to update knowledgeConfig collection from prefix to collection field
"""

import asyncio
import sys
import os

# Add the project root to Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from src.db import init_db, close_db, get_collections
from src.utils.log import logger


async def migrate_knowledge_config():
    """Migrate knowledgeConfig collection from prefix to collection field"""
    try:
        # Initialize database connection
        await init_db()
        collections = get_collections()
        knowledge_config = collections.get('knowledgeConfig')
        
        if not knowledge_config:
            logger.error("knowledgeConfig collection not found")
            return False
        
        logger.info("Starting knowledgeConfig migration...")
        
        # Step 1: Check if old index exists and drop it
        try:
            indexes = await knowledge_config.list_indexes().to_list(length=None)
            old_index_exists = any(
                idx.get('name') == 'tenantId_1_prefix_1' 
                for idx in indexes
            )
            
            if old_index_exists:
                logger.info("Dropping old index: tenantId_1_prefix_1")
                await knowledge_config.drop_index("tenantId_1_prefix_1")
                logger.info("Old index dropped successfully")
            else:
                logger.info("Old index tenantId_1_prefix_1 does not exist")
                
        except Exception as e:
            logger.warning(f"Could not drop old index: {e}")
        
        # Step 2: Rename prefix field to collection in existing documents
        try:
            # Find documents that have 'prefix' field but not 'collection' field
            cursor = knowledge_config.find({
                "prefix": {"$exists": True},
                "collection": {"$exists": False}
            })
            
            docs_updated = 0
            async for doc in cursor:
                # Rename prefix to collection
                await knowledge_config.update_one(
                    {"_id": doc["_id"]},
                    {
                        "$set": {"collection": doc["prefix"]},
                        "$unset": {"prefix": ""}
                    }
                )
                docs_updated += 1
                logger.info(f"Updated document: {doc.get('name', doc['_id'])}")
            
            logger.info(f"Updated {docs_updated} documents")
            
        except Exception as e:
            logger.error(f"Failed to rename fields: {e}")
            return False
        
        # Step 3: Create new index with collection field
        try:
            logger.info("Creating new index: tenantId_1_collection_1")
            await knowledge_config.create_index(
                [("tenantId", 1), ("collection", 1)], 
                unique=True,
                name="tenantId_1_collection_1"
            )
            logger.info("New index created successfully")
            
        except Exception as e:
            logger.error(f"Failed to create new index: {e}")
            return False
        
        logger.info("Migration completed successfully!")
        return True
        
    except Exception as e:
        logger.error(f"Migration failed: {e}")
        return False
    
    finally:
        await close_db()


if __name__ == "__main__":
    async def main():
        success = await migrate_knowledge_config()
        if success:
            print("✅ Migration completed successfully!")
            sys.exit(0)
        else:
            print("❌ Migration failed!")
            sys.exit(1)
    
    asyncio.run(main())
