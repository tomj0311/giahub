"""
Scheduler Service

This service handles all APScheduler-related business logic including CRUD operations on jobs.
"""

from datetime import datetime
from typing import Optional, Dict, Any, List
from fastapi import HTTPException, status

from ..scheduler import scheduler
from ..utils.log import logger


class SchedulerService:
    """Service for managing scheduled jobs"""
    
    @staticmethod
    def job_to_dict(job) -> Dict[str, Any]:
        """Convert APScheduler job to dictionary."""
        next_run = job.next_run_time.isoformat() if job.next_run_time else None
        
        return {
            "id": job.id,
            "name": job.name,
            "func": f"{job.func.__module__}.{job.func.__name__}" if hasattr(job.func, '__name__') else str(job.func),
            "trigger": str(job.trigger),
            "next_run_time": next_run,
            "args": list(job.args) if job.args else [],
            "kwargs": dict(job.kwargs) if job.kwargs else {},
            "misfire_grace_time": job.misfire_grace_time,
            "coalesce": job.coalesce,
            "max_instances": job.max_instances,
            "pending": job.pending
        }
    
    @staticmethod
    def import_function(func_path: str):
        """Import a function from a string path like 'module.submodule.function'."""
        try:
            module_path, func_name = func_path.rsplit('.', 1)
            module = __import__(module_path, fromlist=[func_name])
            return getattr(module, func_name)
        except (ValueError, ImportError, AttributeError) as e:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid function path '{func_path}': {str(e)}"
            )
    
    @classmethod
    async def list_jobs(cls, pending_only: bool = False) -> Dict[str, Any]:
        """List all scheduled jobs."""
        jobs = scheduler.get_jobs()
        
        if pending_only:
            jobs = [job for job in jobs if job.pending]
        
        job_list = [cls.job_to_dict(job) for job in jobs]
        
        return {
            "jobs": job_list,
            "total": len(job_list)
        }
    
    @classmethod
    async def get_job(cls, job_id: str) -> Dict[str, Any]:
        """Get specific job details by ID."""
        job = scheduler.get_job(job_id)
        
        if not job:
            logger.warning(f"[SCHEDULER] Job not found: {job_id}")
            raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found")
        
        return cls.job_to_dict(job)
    
    @classmethod
    async def add_job(cls, job_data: dict) -> Dict[str, Any]:
        """Add a new scheduled job."""
        job_id = job_data.get("id")
        if not job_id:
            raise HTTPException(status_code=400, detail="Job ID is required")
        
        func_path = job_data.get("func")
        if not func_path:
            raise HTTPException(status_code=400, detail="Function path is required")
        
        func = cls.import_function(func_path)
        
        trigger_type = job_data.get("trigger_type", "interval")
        trigger_args = job_data.get("trigger", {})
        
        job = scheduler.add_job(
            func=func,
            trigger=trigger_type,
            args=job_data.get("args", []),
            kwargs=job_data.get("kwargs", {}),
            id=job_id,
            name=job_data.get("name", job_id),
            replace_existing=job_data.get("replace_existing", False),
            misfire_grace_time=job_data.get("misfire_grace_time"),
            coalesce=job_data.get("coalesce"),
            max_instances=job_data.get("max_instances"),
            **trigger_args
        )
        
        return {
            "message": f"Job '{job_id}' added successfully",
            "job": cls.job_to_dict(job)
        }
    
    @classmethod
    async def update_job(cls, job_id: str, job_data: dict) -> Dict[str, Any]:
        """Update an existing scheduled job."""
        existing_job = scheduler.get_job(job_id)
        if not existing_job:
            raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found")
        
        update_args = {}
        
        if "name" in job_data:
            update_args['name'] = job_data["name"]
        
        if "trigger_type" in job_data and "trigger" in job_data:
            update_args['trigger'] = job_data["trigger_type"]
            update_args.update(job_data["trigger"])
        
        job = scheduler.modify_job(job_id, **update_args)
        
        return {
            "message": f"Job '{job_id}' updated successfully",
            "job": cls.job_to_dict(job)
        }
    
    @classmethod
    async def delete_job(cls, job_id: str) -> Dict[str, Any]:
        """Delete a scheduled job."""
        job = scheduler.get_job(job_id)
        if not job:
            raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found")
        
        scheduler.remove_job(job_id)
        
        return {
            "message": f"Job '{job_id}' deleted successfully"
        }
    
    @classmethod
    async def pause_job(cls, job_id: str) -> Dict[str, Any]:
        """Pause a scheduled job."""
        job = scheduler.get_job(job_id)
        if not job:
            raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found")
        
        scheduler.pause_job(job_id)
        
        return {
            "message": f"Job '{job_id}' paused successfully"
        }
    
    @classmethod
    async def resume_job(cls, job_id: str) -> Dict[str, Any]:
        """Resume a paused job."""
        job = scheduler.get_job(job_id)
        if not job:
            raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found")
        
        scheduler.resume_job(job_id)
        
        return {
            "message": f"Job '{job_id}' resumed successfully"
        }
    
    @classmethod
    async def run_job_now(cls, job_id: str) -> Dict[str, Any]:
        """Trigger a job to run immediately (outside its normal schedule)."""
        job = scheduler.get_job(job_id)
        if not job:
            raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found")
        
        job.modify(next_run_time=datetime.utcnow())
        
        return {
            "message": f"Job '{job_id}' scheduled to run immediately"
        }
    
    @classmethod
    async def get_status(cls) -> Dict[str, Any]:
        """Get scheduler status and statistics."""
        jobs = scheduler.get_jobs()
        running = scheduler.running
        
        stats = {
            "running": running,
            "total_jobs": len(jobs),
            "pending_jobs": len([j for j in jobs if j.pending]),
            "state": scheduler.state
        }
        
        return stats
