"""
APScheduler CRUD routes for managing scheduled jobs.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional

from ..utils.auth import verify_token_middleware
from ..services.scheduler_service import SchedulerService
from ..utils.log import logger

router = APIRouter(tags=["scheduler"])


@router.get("/jobs")
async def list_jobs(
    user: dict = Depends(verify_token_middleware),
    pending_only: bool = Query(False, description="Show only pending jobs")
):
    """List all scheduled jobs."""
    try:
        result = await SchedulerService.list_jobs(pending_only=pending_only)
        return result
    except Exception as e:
        logger.error(f"[SCHEDULER] Error listing jobs: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/jobs/{job_id}")
async def get_job(
    job_id: str,
    user: dict = Depends(verify_token_middleware)
):
    """Get specific job details by ID."""
    try:
        result = await SchedulerService.get_job(job_id)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[SCHEDULER] Error getting job {job_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/jobs")
async def add_job(
    job_data: dict,
    user: dict = Depends(verify_token_middleware)
):
    """Add a new scheduled job."""
    try:
        result = await SchedulerService.add_job(job_data)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[SCHEDULER] Error adding job: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/jobs/{job_id}")
async def update_job(
    job_id: str,
    job_data: dict,
    user: dict = Depends(verify_token_middleware)
):
    """Update an existing scheduled job."""
    try:
        result = await SchedulerService.update_job(job_id, job_data)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[SCHEDULER] Error updating job {job_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/jobs/{job_id}")
async def delete_job(
    job_id: str,
    user: dict = Depends(verify_token_middleware)
):
    """Delete a scheduled job."""
    try:
        result = await SchedulerService.delete_job(job_id)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[SCHEDULER] Error deleting job {job_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/jobs/{job_id}/pause")
async def pause_job(
    job_id: str,
    user: dict = Depends(verify_token_middleware)
):
    """Pause a scheduled job."""
    try:
        result = await SchedulerService.pause_job(job_id)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[SCHEDULER] Error pausing job {job_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/jobs/{job_id}/resume")
async def resume_job(
    job_id: str,
    user: dict = Depends(verify_token_middleware)
):
    """Resume a paused job."""
    try:
        result = await SchedulerService.resume_job(job_id)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[SCHEDULER] Error resuming job {job_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/jobs/{job_id}/run")
async def run_job_now(
    job_id: str,
    user: dict = Depends(verify_token_middleware)
):
    """Trigger a job to run immediately."""
    try:
        result = await SchedulerService.run_job_now(job_id)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[SCHEDULER] Error running job {job_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status")
async def get_scheduler_status(
    user: dict = Depends(verify_token_middleware)
):
    """Get scheduler status and statistics."""
    try:
        result = await SchedulerService.get_status()
        return result
    except Exception as e:
        logger.error(f"[SCHEDULER] Error getting status: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
