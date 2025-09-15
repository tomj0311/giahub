"""
Analytics service for agent run metrics and dashboard data.
"""
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from bson import ObjectId

from ..db import get_db
from ..utils.log import logger


class AnalyticsService:
    """Service for analytics operations on agent_runs collection."""

    @staticmethod
    async def get_overview_metrics(tenant_id: str = None) -> Dict:
        """Get overview metrics for the dashboard."""
        try:
            db = get_db()
            collection = db.agent_runs
            
            # Base filter
            filter_query = {}
            if tenant_id:
                filter_query["tenantId"] = tenant_id

            # Total conversations
            total_conversations = await collection.count_documents(filter_query)
            
            # Completed conversations
            completed_filter = {**filter_query, "completed": True}
            completed_conversations = await collection.count_documents(completed_filter)
            
            # Average metrics for completed conversations and total tokens consumed
            pipeline = [
                {"$match": completed_filter},
                {
                    "$group": {
                        "_id": None,
                        "avg_response_time": {"$avg": "$metrics.total_response_time"},
                        "avg_total_tokens": {"$avg": "$metrics.total_tokens"},
                        "avg_input_tokens": {"$avg": "$metrics.total_input_tokens"},
                        "avg_output_tokens": {"$avg": "$metrics.total_output_tokens"},
                        "avg_time_to_first_token": {"$avg": "$metrics.avg_time_to_first_token"},
                        "total_tokens_consumed": {"$sum": "$metrics.total_tokens"},
                        "total_input_tokens_consumed": {"$sum": "$metrics.total_input_tokens"},
                        "total_output_tokens_consumed": {"$sum": "$metrics.total_output_tokens"}
                    }
                }
            ]
            
            avg_metrics = await collection.aggregate(pipeline).to_list(1)
            avg_data = avg_metrics[0] if avg_metrics else {}
            
            return {
                "total_conversations": total_conversations,
                "completed_conversations": completed_conversations,
                "completion_rate": round((completed_conversations / total_conversations * 100), 2) if total_conversations > 0 else 0,
                "avg_response_time": round(avg_data.get("avg_response_time", 0), 3),
                "avg_total_tokens": round(avg_data.get("avg_total_tokens", 0)),
                "avg_input_tokens": round(avg_data.get("avg_input_tokens", 0)),
                "avg_output_tokens": round(avg_data.get("avg_output_tokens", 0)),
                "avg_time_to_first_token": round(avg_data.get("avg_time_to_first_token", 0), 3),
                "total_tokens_consumed": avg_data.get("total_tokens_consumed", 0),
                "total_input_tokens_consumed": avg_data.get("total_input_tokens_consumed", 0),
                "total_output_tokens_consumed": avg_data.get("total_output_tokens_consumed", 0)
            }
            
        except Exception as e:
            logger.error(f"Error getting overview metrics: {e}")
            raise

    @staticmethod
    async def get_daily_stats(tenant_id: str = None, days: int = 7) -> List[Dict]:
        """Get daily conversation statistics for the last N days."""
        try:
            db = get_db()
            collection = db.agent_runs
            
            # Calculate date range
            end_date = datetime.utcnow()
            start_date = end_date - timedelta(days=days)
            
            # Base filter
            filter_query = {
                "created_at": {"$gte": start_date, "$lte": end_date}
            }
            if tenant_id:
                filter_query["tenantId"] = tenant_id

            pipeline = [
                {"$match": filter_query},
                {
                    "$group": {
                        "_id": {
                            "$dateToString": {
                                "format": "%Y-%m-%d",
                                "date": "$created_at"
                            }
                        },
                        "total_conversations": {"$sum": 1},
                        "completed_conversations": {
                            "$sum": {"$cond": [{"$eq": ["$completed", True]}, 1, 0]}
                        },
                        "total_tokens": {"$sum": "$metrics.total_tokens"},
                        "avg_response_time": {"$avg": "$metrics.total_response_time"}
                    }
                },
                {"$sort": {"_id": 1}}
            ]
            
            daily_stats = await collection.aggregate(pipeline).to_list(days)
            
            # Format the response
            return [
                {
                    "date": stat["_id"],
                    "total_conversations": stat["total_conversations"],
                    "completed_conversations": stat["completed_conversations"],
                    "total_tokens": stat["total_tokens"],
                    "avg_response_time": round(stat["avg_response_time"], 3)
                }
                for stat in daily_stats
            ]
            
        except Exception as e:
            logger.error(f"Error getting daily stats: {e}")
            raise

    @staticmethod
    async def get_agent_performance(tenant_id: str = None, limit: int = 10) -> List[Dict]:
        """Get performance metrics by agent."""
        try:
            db = get_db()
            collection = db.agent_runs
            
            # Base filter
            filter_query = {"completed": True}
            if tenant_id:
                filter_query["tenantId"] = tenant_id

            pipeline = [
                {"$match": filter_query},
                {
                    "$group": {
                        "_id": "$agent_name",
                        "total_conversations": {"$sum": 1},
                        "avg_response_time": {"$avg": "$metrics.total_response_time"},
                        "avg_tokens": {"$avg": "$metrics.total_tokens"},
                        "avg_time_to_first_token": {"$avg": "$metrics.avg_time_to_first_token"}
                    }
                },
                {"$sort": {"total_conversations": -1}},
                {"$limit": limit}
            ]
            
            agent_stats = await collection.aggregate(pipeline).to_list(limit)
            
            return [
                {
                    "agent_name": stat["_id"],
                    "total_conversations": stat["total_conversations"],
                    "avg_response_time": round(stat["avg_response_time"], 3),
                    "avg_tokens": round(stat["avg_tokens"]),
                    "avg_time_to_first_token": round(stat["avg_time_to_first_token"], 3)
                }
                for stat in agent_stats
            ]
            
        except Exception as e:
            logger.error(f"Error getting agent performance: {e}")
            raise

    @staticmethod
    async def get_recent_conversations(tenant_id: str = None, limit: int = 10) -> List[Dict]:
        """Get recent conversations."""
        try:
            db = get_db()
            collection = db.agent_runs
            
            # Base filter
            filter_query = {}
            if tenant_id:
                filter_query["tenantId"] = tenant_id

            conversations = await collection.find(
                filter_query,
                {
                    "agent_name": 1,
                    "conv_id": 1,
                    "completed": 1,
                    "metrics.total_tokens": 1,
                    "metrics.total_response_time": 1,
                    "created_at": 1
                }
            ).sort("created_at", -1).limit(limit).to_list(limit)
            
            return [
                {
                    "id": str(conv["_id"]),
                    "agent_name": conv.get("agent_name", "Unknown"),
                    "conv_id": conv.get("conv_id", ""),
                    "completed": conv.get("completed", False),
                    "total_tokens": conv.get("metrics", {}).get("total_tokens", 0),
                    "response_time": round(conv.get("metrics", {}).get("total_response_time", 0), 3),
                    "created_at": conv.get("created_at").isoformat() if conv.get("created_at") else None
                }
                for conv in conversations
            ]
            
        except Exception as e:
            logger.error(f"Error getting recent conversations: {e}")
            raise