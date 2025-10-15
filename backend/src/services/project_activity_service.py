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
        due_date = activity.get("due_date")
        
        if not assignee:
            missing_fields.append("assignee")
        if not approver:
            missing_fields.append("approver")
        if not start_date:
            missing_fields.append("start_date")
        if not due_date:
            missing_fields.append("due_date")
        
        if missing_fields:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"The following fields are mandatory: {', '.join(missing_fields)}"
            )
        
        # Validate that start_date is before due_date
        if start_date and due_date:
            try:
                from datetime import datetime
                start = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
                due = datetime.fromisoformat(due_date.replace('Z', '+00:00'))
                if start >= due:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Start date must be before due date"
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
        filters: Optional[str] = None,
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
            
            # Apply custom filters if provided
            if filters:
                import json
                try:
                    filters_list = json.loads(filters)
                    for f in filters_list:
                        field = f.get("field")
                        operator = f.get("operator")
                        value = f.get("value")
                        
                        if operator == "equals":
                            filter_query[field] = value
                        elif operator == "not_equals":
                            filter_query[field] = {"$ne": value}
                        elif operator == "contains":
                            filter_query[field] = {"$regex": value, "$options": "i"}
                        elif operator == "starts_with":
                            filter_query[field] = {"$regex": f"^{value}", "$options": "i"}
                        elif operator == "ends_with":
                            filter_query[field] = {"$regex": f"{value}$", "$options": "i"}
                        elif operator == "greater_than":
                            filter_query[field] = {"$gt": float(value) if isinstance(value, str) else value}
                        elif operator == "less_than":
                            filter_query[field] = {"$lt": float(value) if isinstance(value, str) else value}
                        elif operator == "between":
                            if isinstance(value, str):
                                parts = value.split(',')
                                filter_query[field] = {"$gte": parts[0], "$lte": parts[1]}
                            elif isinstance(value, list) and len(value) == 2:
                                filter_query[field] = {"$gte": value[0], "$lte": value[1]}
                        elif operator == "before":
                            filter_query[field] = {"$lt": value}
                        elif operator == "after":
                            filter_query[field] = {"$gt": value}
                        elif operator == "in":
                            if isinstance(value, str):
                                filter_query[field] = {"$in": value.split(',')}
                            elif isinstance(value, list):
                                filter_query[field] = {"$in": value}
                except json.JSONDecodeError:
                    logger.warning(f"[ACTIVITY] Invalid filters JSON: {filters}")
            
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
        due_date = updates.get("due_date", current_activity.get("due_date"))
        
        missing_fields = []
        if not assignee:
            missing_fields.append("assignee")
        if not approver:
            missing_fields.append("approver")
        if not start_date:
            missing_fields.append("start_date")
        if not due_date:
            missing_fields.append("due_date")
        
        if missing_fields:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"The following fields are mandatory: {', '.join(missing_fields)}"
            )
        
        # Validate that start_date is before due_date
        if start_date and due_date:
            try:
                from datetime import datetime
                start = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
                due = datetime.fromisoformat(due_date.replace('Z', '+00:00'))
                if start >= due:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Start date must be before due date"
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

    @classmethod
    async def get_field_metadata(cls, user: dict) -> dict:
        """Dynamically discover fields from actual activity documents"""
        tenant_id = await cls.validate_tenant_access(user)
        
        # Get a sample of activities to analyze fields
        activities = await MongoStorageService.find_many(
            "projectActivities",
            {},
            tenant_id=tenant_id,
            limit=100
        )
        
        if not activities:
            return {"fields": []}
        
        # Discover all unique fields across activities
        all_fields = set()
        field_samples = {}
        
        for activity in activities:
            for key, value in activity.items():
                if key not in ['_id', 'tenantId', 'userId']:
                    all_fields.add(key)
                    if key not in field_samples:
                        field_samples[key] = []
                    if value is not None:
                        field_samples[key].append(value)
        
        # Infer field types and build metadata
        fields = []
        for field_name in sorted(all_fields):
            samples = field_samples.get(field_name, [])
            field_meta = {
                "name": field_name,
                "label": field_name.replace('_', ' ').title(),
                "sortable": True,
                "filterable": True
            }
            
            # Infer type from samples
            if not samples:
                field_meta["type"] = "text"
                field_meta["operators"] = ["equals", "contains"]
            else:
                sample = samples[0]
                
                # Check if it's a date
                if 'date' in field_name.lower() or 'at' in field_name.lower():
                    field_meta["type"] = "date"
                    field_meta["operators"] = ["equals", "before", "after", "between"]
                # Check if it's a number
                elif isinstance(sample, (int, float)):
                    field_meta["type"] = "number"
                    field_meta["operators"] = ["equals", "greater_than", "less_than", "between"]
                # Check if it's a boolean
                elif isinstance(sample, bool):
                    field_meta["type"] = "boolean"
                    field_meta["operators"] = ["equals"]
                    field_meta["options"] = [True, False]
                # Check if it's from a limited set (enum)
                else:
                    unique_values = list(set([str(s) for s in samples if s is not None]))
                    if len(unique_values) <= 10:  # If <= 10 unique values, treat as select
                        field_meta["type"] = "select"
                        field_meta["operators"] = ["equals", "not_equals", "in"]
                        field_meta["options"] = unique_values
                    else:
                        field_meta["type"] = "text"
                        field_meta["operators"] = ["equals", "contains", "starts_with", "ends_with"]
            
            fields.append(field_meta)
        
        return {"fields": fields}
