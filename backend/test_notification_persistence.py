#!/usr/bin/env python3
"""
Test script to verify notification persistence in MongoDB
"""
import asyncio
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

from src.db import connect_db, get_collections
from src.utils.log import logger

async def test_notifications():
    """Test notification persistence"""
    try:
        # Connect to database
        logger.info("🔌 Connecting to database...")
        await connect_db()
        
        collections = get_collections()
        notif_collection = collections.get("activityNotifications")
        
        if not notif_collection:
            logger.error("❌ activityNotifications collection not found!")
            return
        
        # Count all notifications
        total_count = await notif_collection.count_documents({})
        logger.info(f"📊 Total notifications in database: {total_count}")
        
        # Get recent notifications
        recent = await notif_collection.find({}).sort("created_at", -1).limit(10).to_list(length=10)
        
        logger.info(f"\n📋 Recent {len(recent)} notifications:")
        for idx, notif in enumerate(recent, 1):
            logger.info(f"  {idx}. ID: {notif.get('_id')}")
            logger.info(f"     Activity ID: {notif.get('activity_id')}")
            logger.info(f"     Sender: {notif.get('sender_name')} ({notif.get('sender_email')})")
            logger.info(f"     Message: {notif.get('message', '')[:50]}...")
            logger.info(f"     Created: {notif.get('created_at')}")
            logger.info(f"     Tenant ID: {notif.get('tenantId')}")
            logger.info("")
        
        # Group by activity_id
        logger.info("\n📊 Notifications grouped by activity_id:")
        pipeline = [
            {"$group": {"_id": "$activity_id", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 10}
        ]
        activity_counts = await notif_collection.aggregate(pipeline).to_list(length=10)
        
        for item in activity_counts:
            logger.info(f"  Activity {item['_id']}: {item['count']} notifications")
        
        logger.info("\n✅ Test completed successfully")
        
    except Exception as e:
        logger.error(f"❌ Test failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_notifications())
