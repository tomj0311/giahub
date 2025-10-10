"""
Project Activity Service

This service handles project activities (Milestones, Phases, Tasks).
"""

from datetime import datetime
from typing import List, Optional, Dict, Any
from fastapi import HTTPException, status

from ..utils.log import logger
from ..utils.mongo_storage import MongoStorageService

logger.debug("[ACTIVITY] Service module loaded")


class ProjectActivityService:
    """Service for managing project activities (milestones, phases, tasks)"""
    
    ACTIVITY_TYPES = ["MILESTONE", "PHASE", "TASK"]
    
    @staticmethod
    async def validate_tenant_access(user: dict) -> str:
        """Validate tenant access and return tenant_id"""
        tenant_id = user.get("tenantId")
        if not tenant_id:
            logger.warning(f"[ACTIVITY] Missing tenant information for user: {user.get('id')}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User tenant information missing. Please re-login."
            )
        return tenant_id
    
    @classmethod
    async def create_activity(cls, activity: dict, user: dict) -> dict:
        """Create a new project activity"""
        logger.info(f"[ACTIVITY] Creating activity: {activity.get('subject')}")
        
        tenant_id = await cls.validate_tenant_access(user)
        user_id = user.get("id")
        
        subject = (activity.get("subject") or "").strip()
        if not subject:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Activity subject is required"
            )
        
        activity_type = activity.get("type", "TASK")
        if activity_type not in cls.ACTIVITY_TYPES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid activity type. Must be one of: {', '.join(cls.ACTIVITY_TYPES)}"
            )
        
        project_id = activity.get("project_id")
        if not project_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Project ID is required"
            )
        
        # Validate required fields for all activity types
        missing_fields = []
        assignee = activity.get("assignee", "").strip()
        approver = activity.get("approver", "").strip()
        start_date = activity.get("start_date")
        end_date = activity.get("end_date")
        
        if not assignee:
            missing_fields.append("assignee")
        if not approver:
            missing_fields.append("approver")
        if not start_date:
            missing_fields.append("start_date")
        if not end_date:
            missing_fields.append("end_date")
        
        if missing_fields:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"The following fields are mandatory: {', '.join(missing_fields)}"
            )
        
        # Validate that start_date is before end_date
        if start_date and end_date:
            try:
                from datetime import datetime
                start = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
                end = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
                if start >= end:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Start date must be before end date"
                    )
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid date format. Please use ISO format (YYYY-MM-DD)"
                )
        
        # Verify project exists
        try:
            from bson import ObjectId
            project_obj_id = ObjectId(project_id)
            project = await MongoStorageService.find_one("projects", 
                {"_id": project_obj_id}, 
                tenant_id=tenant_id
            )
            if not project:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Project not found"
                )
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid project ID"
            )

        doc = {
            "project_id": project_id,
            "subject": subject,
            "type": activity_type,
            "description": activity.get("description", ""),
            "status": activity.get("status", "New"),
            "priority": activity.get("priority", "Normal"),
            "assignee": activity.get("assignee"),
            "approver": activity.get("approver"),
            "due_date": activity.get("due_date"),
            "start_date": activity.get("start_date"),
            "end_date": activity.get("end_date"),
            "progress": activity.get("progress", 0),
            "estimated_time": activity.get("estimated_time"),
            "spent_time": activity.get("spent_time", 0),
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "tenantId": tenant_id,
            "userId": user_id
        }

        result_id = await MongoStorageService.insert_one("projectActivities", doc, tenant_id=tenant_id)
        return {"id": str(result_id), "subject": subject}

    @classmethod
    async def get_activities(
        cls, 
        user: dict,
        project_id: Optional[str] = None,
        activity_type: Optional[str] = None,
        page: int = 1, 
        page_size: int = 50,
        search: Optional[str] = None,
        status: Optional[str] = None,
        sort_by: str = "created_at",
        sort_order: str = "desc"
    ) -> Dict[str, Any]:
        """Get project activities with pagination and filtering"""
        tenant_id = await cls.validate_tenant_access(user)
        
        try:
            filter_query = {}
            
            if project_id:
                filter_query["project_id"] = project_id
            
            if activity_type:
                if activity_type not in cls.ACTIVITY_TYPES:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Invalid activity type. Must be one of: {', '.join(cls.ACTIVITY_TYPES)}"
                    )
                filter_query["type"] = activity_type
            
            if search:
                filter_query["$or"] = [
                    {"subject": {"$regex": search, "$options": "i"}},
                    {"description": {"$regex": search, "$options": "i"}}
                ]
            
            if status:
                filter_query["status"] = status
            
            skip = (page - 1) * page_size
            total_count = await MongoStorageService.count_documents("projectActivities", filter_query, tenant_id=tenant_id)
            total_pages = (total_count + page_size - 1) // page_size
            
            sort_direction = 1 if sort_order == "asc" else -1
            
            activities_list = await MongoStorageService.find_many(
                "projectActivities", 
                filter_query, 
                tenant_id=tenant_id,
                skip=skip,
                limit=page_size,
                sort_field=sort_by,
                sort_order=sort_direction
            )
            
            activities = []
            for activity in activities_list:
                activity_dict = dict(activity)
                activity_dict["id"] = str(activity_dict.pop("_id"))
                activities.append(activity_dict)
            
            return {
                "activities": activities,
                "pagination": {
                    "page": page,
                    "page_size": page_size,
                    "total": total_count,
                    "total_pages": total_pages,
                    "has_next": page < total_pages,
                    "has_prev": page > 1
                }
            }
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"[ACTIVITY] Error fetching activities: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to fetch activities"
            )

    @classmethod
    async def get_activity_by_id(cls, activity_id: str, user: dict) -> dict:
        """Get activity by ID"""
        from bson import ObjectId
        tenant_id = await cls.validate_tenant_access(user)
        
        try:
            object_id = ObjectId(activity_id)
            activity = await MongoStorageService.find_one("projectActivities",
                {"_id": object_id},
                tenant_id=tenant_id
            )
            
            if not activity:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Activity not found"
                )
            
            activity_dict = dict(activity)
            activity_dict["id"] = str(activity_dict.pop("_id"))
            return activity_dict
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"[ACTIVITY] Error fetching activity {activity_id}: {e}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid activity ID"
            )

    @classmethod
    async def update_activity(cls, activity_id: str, updates: dict, user: dict) -> dict:
        """Update an activity"""
        from bson import ObjectId
        tenant_id = await cls.validate_tenant_access(user)
        
        try:
            object_id = ObjectId(activity_id)
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid activity ID format"
            )
        
        # Fetch current activity to check its type
        current_activity = await MongoStorageService.find_one("projectActivities",
            {"_id": object_id},
            tenant_id=tenant_id
        )
        
        if not current_activity:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Activity not found"
            )
        
        # Validate required fields for all activity types
        activity_type = updates.get("type", current_activity.get("type"))
        
        # Check if required fields are present (either in updates or existing data)
        assignee = updates.get("assignee", current_activity.get("assignee", "")).strip() if "assignee" in updates else current_activity.get("assignee", "").strip()
        approver = updates.get("approver", current_activity.get("approver", "")).strip() if "approver" in updates else current_activity.get("approver", "").strip()
        start_date = updates.get("start_date", current_activity.get("start_date"))
        end_date = updates.get("end_date", current_activity.get("end_date"))
        
        missing_fields = []
        if not assignee:
            missing_fields.append("assignee")
        if not approver:
            missing_fields.append("approver")
        if not start_date:
            missing_fields.append("start_date")
        if not end_date:
            missing_fields.append("end_date")
        
        if missing_fields:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"The following fields are mandatory: {', '.join(missing_fields)}"
            )
        
        # Validate that start_date is before end_date
        if start_date and end_date:
            try:
                from datetime import datetime
                start = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
                end = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
                if start >= end:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Start date must be before end date"
                    )
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid date format. Please use ISO format (YYYY-MM-DD)"
                )
        
        update_data = dict(updates)
        if "subject" in update_data and isinstance(update_data["subject"], str):
            update_data["subject"] = update_data["subject"].strip()
        update_data["updated_at"] = datetime.utcnow()
        
        result = await MongoStorageService.update_one("projectActivities",
            {"_id": object_id},
            {"$set": update_data},
            tenant_id=tenant_id
        )
        
        if not result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Activity not found"
            )
        
        return {"message": "Activity updated successfully"}

    @classmethod
    async def delete_activity(cls, activity_id: str, user: dict) -> dict:
        """Delete an activity"""
        from bson import ObjectId
        tenant_id = await cls.validate_tenant_access(user)
        
        try:
            object_id = ObjectId(activity_id)
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid activity ID format"
            )
        
        result = await MongoStorageService.delete_one("projectActivities", {
            "_id": object_id
        }, tenant_id=tenant_id)
        
        if not result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Activity not found"
            )
        
        return {"message": "Activity deleted successfully"}
