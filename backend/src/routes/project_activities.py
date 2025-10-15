"""
Project Activity Routes

Handles project activity (milestones, phases, tasks) CRUD operations.
"""

from fastapi import APIRouter, HTTPException, Depends, status, Query
from typing import Optional

from ..utils.auth import verify_token_middleware
from ..utils.log import logger
from ..services.project_activity_service import ProjectActivityService

router = APIRouter(tags=["project-activities"])


@router.get("/activities/fields-metadata")
async def get_activity_fields_metadata(
    user: dict = Depends(verify_token_middleware)
):
    """Get dynamically discovered field metadata from actual activity documents"""
    try:
        result = await ProjectActivityService.get_field_metadata(user)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[ACTIVITY] Error fetching field metadata: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch field metadata")


@router.post("/activities", status_code=status.HTTP_201_CREATED)
async def create_activity(
    activity: dict,
    user: dict = Depends(verify_token_middleware)
):
    """Create a new project activity"""
    try:
        result = await ProjectActivityService.create_activity(activity, user)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[ACTIVITY] Failed to create activity: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create activity"
        )


@router.get("/activities")
async def get_activities(
    user: dict = Depends(verify_token_middleware),
    project_id: Optional[str] = Query(None, description="Filter by project ID"),
    activity_type: Optional[str] = Query(None, description="Filter by type (MILESTONE, PHASE, TASK)"),
    page: int = Query(1, ge=1, description="Page number (1-based)"),
    page_size: int = Query(50, ge=1, le=200, description="Items per page"),
    search: Optional[str] = Query(None, description="Search in subject and description"),
    status: Optional[str] = Query(None, description="Filter by status"),
    filters: Optional[str] = Query(None, description="JSON-encoded filters array"),
    sort_by: str = Query("created_at", description="Sort field"),
    sort_order: str = Query("desc", regex="^(asc|desc)$", description="Sort order")
):
    """List project activities with pagination and filtering"""
    try:
        result = await ProjectActivityService.get_activities(
            user=user,
            project_id=project_id,
            activity_type=activity_type,
            page=page,
            page_size=page_size,
            search=search,
            status=status,
            filters=filters,
            sort_by=sort_by,
            sort_order=sort_order
        )
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[ACTIVITY] Error fetching activities: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch activities")


@router.get("/activities/{activity_id}")
async def get_activity(
    activity_id: str,
    user: dict = Depends(verify_token_middleware)
):
    """Get a specific activity by ID"""
    try:
        activity = await ProjectActivityService.get_activity_by_id(activity_id, user)
        return activity
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[ACTIVITY] Failed to fetch activity {activity_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch activity"
        )


@router.put("/activities/{activity_id}")
async def update_activity(
    activity_id: str,
    activity_update: dict,
    user: dict = Depends(verify_token_middleware)
):
    """Update an activity"""
    try:
        result = await ProjectActivityService.update_activity(activity_id, activity_update, user)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[ACTIVITY] Error updating activity {activity_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to update activity")


@router.delete("/activities/{activity_id}")
async def delete_activity(
    activity_id: str,
    user: dict = Depends(verify_token_middleware)
):
    """Delete an activity"""
    try:
        result = await ProjectActivityService.delete_activity(activity_id, user)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[ACTIVITY] Error deleting activity {activity_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete activity")
