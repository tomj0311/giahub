"""
Activity Notification Routes

Handles notification creation and retrieval for project activities.
"""

from fastapi import APIRouter, HTTPException, Depends, status
from typing import List, Dict, Any

from ..utils.auth import verify_token_middleware
from ..utils.log import logger
from ..services.activity_notification_service import ActivityNotificationService

router = APIRouter(tags=["activity-notifications"])


@router.post("/activities/{activity_id}/notifications", status_code=status.HTTP_201_CREATED)
async def create_notification(
    activity_id: str,
    notification: dict,
    user: dict = Depends(verify_token_middleware)
):
    """Create a new notification for an activity and send emails to mentioned users"""
    try:
        result = await ActivityNotificationService.create_notification(
            activity_id=activity_id,
            notification=notification,
            user=user
        )
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to create notification: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create notification"
        )


@router.get("/activities/{activity_id}/notifications")
async def get_notifications(
    activity_id: str,
    user: dict = Depends(verify_token_middleware)
):
    """Get all notifications for an activity"""
    try:
        result = await ActivityNotificationService.get_notifications(
            activity_id=activity_id,
            user=user
        )
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to fetch notifications: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch notifications"
        )
