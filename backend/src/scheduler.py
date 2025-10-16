"""
APScheduler configuration and job definitions for the GIA Platform.
Uses existing MONGO_URL and MONGO_DB environment variables from db.py
"""
import os
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.jobstores.mongodb import MongoDBJobStore
from apscheduler.executors.pool import ThreadPoolExecutor
from datetime import datetime
from src.utils.log import logger

# Use EXACT same environment variables as db.py
MONGO_URL = os.getenv("MONGO_URL", "mongodb://127.0.0.1:8801")
MONGO_DB = os.getenv("MONGO_DB", "giap")

logger.info(f"[SCHEDULER] Using MongoDB: {MONGO_URL}/{MONGO_DB}")

# Configure jobstores and executors
jobstores = {
    'default': MongoDBJobStore(
        database=MONGO_DB,
        collection='apscheduler_jobs',
        host=MONGO_URL
    )
}

executors = {
    'default': ThreadPoolExecutor(10)
}

job_defaults = {
    'coalesce': False,
    'max_instances': 3
}

# Create scheduler instance
scheduler = AsyncIOScheduler(
    jobstores=jobstores,
    executors=executors,
    job_defaults=job_defaults,
    timezone='UTC'
)


# ========== Example Scheduled Jobs ==========

async def example_job():
    """Example scheduled job that runs periodically."""
    logger.info(f"[SCHEDULER] Example job executed at {datetime.utcnow()}")


async def cleanup_job():
    """Example cleanup job."""
    logger.info("[SCHEDULER] Running cleanup job")


# ========== Job Registration ==========

def register_jobs():
    """Register all scheduled jobs."""
    
    # Example: Run every 5 minutes
    scheduler.add_job(
        example_job,
        'interval',
        minutes=5,
        id='example_job',
        name='Example periodic job',
        replace_existing=True
    )
    
    # Example: Run cleanup every day at 2 AM
    scheduler.add_job(
        cleanup_job,
        'cron',
        hour=2,
        minute=0,
        id='cleanup_job',
        name='Daily cleanup job',
        replace_existing=True
    )
    
    logger.info("[SCHEDULER] All jobs registered successfully")


def start_scheduler():
    """Start the APScheduler."""
    register_jobs()
    scheduler.start()
    logger.info("[SCHEDULER] Scheduler started successfully")


def shutdown_scheduler():
    """Shutdown the APScheduler."""
    if scheduler.running:
        scheduler.shutdown(wait=True)
        logger.info("[SCHEDULER] Scheduler shutdown successfully")
