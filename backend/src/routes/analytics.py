"""
Analytics API routes for agent run metrics and dashboard data.
"""
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, Query

from ..services.analytics_service import AnalyticsService
from ..utils.log import logger

router = APIRouter()


@router.get("/overview")
async def get_analytics_overview(tenant_id: Optional[str] = Query(None)):
    """Get overview analytics metrics."""
    try:
        metrics = await AnalyticsService.get_overview_metrics(tenant_id)
        return {"success": True, "data": metrics}
    except Exception as e:
        logger.error(f"Error getting analytics overview: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/daily-stats")
async def get_daily_statistics(
    tenant_id: Optional[str] = Query(None),
    days: int = Query(7, ge=1, le=30)
):
    """Get daily conversation statistics for the last N days."""
    try:
        stats = await AnalyticsService.get_daily_stats(tenant_id, days)
        return {"success": True, "data": stats}
    except Exception as e:
        logger.error(f"Error getting daily statistics: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/agent-performance")
async def get_agent_performance(
    tenant_id: Optional[str] = Query(None),
    limit: int = Query(10, ge=1, le=50)
):
    """Get performance metrics by agent."""
    try:
        performance = await AnalyticsService.get_agent_performance(tenant_id, limit)
        return {"success": True, "data": performance}
    except Exception as e:
        logger.error(f"Error getting agent performance: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/recent-conversations")
async def get_recent_conversations(
    tenant_id: Optional[str] = Query(None),
    limit: int = Query(10, ge=1, le=50)
):
    """Get recent conversations."""
    try:
        conversations = await AnalyticsService.get_recent_conversations(tenant_id, limit)
        return {"success": True, "data": conversations}
    except Exception as e:
        logger.error(f"Error getting recent conversations: {e}")
        raise HTTPException(status_code=500, detail=str(e))