"""
Project Service

This service handles all project management related business logic.
"""

from datetime import datetime
from typing import List, Optional, Dict, Any
from fastapi import HTTPException, status

from ..utils.log import logger
from ..utils.mongo_storage import MongoStorageService

logger.debug("[PROJECT] Service module loaded")


class ProjectService:
    """Service for managing projects"""
    
    @staticmethod
    async def validate_tenant_access(user: dict) -> str:
        """Validate tenant access and return tenant_id"""
        tenant_id = user.get("tenantId")
        if not tenant_id:
            logger.warning(f"[PROJECT] Missing tenant information for user: {user.get('id')}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User tenant information missing. Please re-login."
            )
        return tenant_id
    
    @classmethod
    async def create_project(cls, project: dict, user: dict) -> dict:
        """Create a new project"""
        logger.info(f"[PROJECT] Creating project: {project.get('name')}")
        
        tenant_id = await cls.validate_tenant_access(user)
        user_id = user.get("id")
        
        name = (project.get("name") or "").strip()
        if not name:
            logger.warning("[PROJECT] Creation failed - name is required")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Project name is required"
            )

        # Check for duplicate names within tenant
        existing = await MongoStorageService.find_one("projects", {
            "name": name
        }, tenant_id=tenant_id)
        
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Project with this name already exists"
            )

        # Validate required fields
        missing_fields = []
        assignee = project.get("assignee", "").strip()
        approver = project.get("approver", "").strip()
        start_date = project.get("start_date")
        due_date = project.get("due_date")
        
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

        # Validate start_date and due_date
        if start_date and due_date:
            try:
                from datetime import datetime as dt
                start = dt.fromisoformat(start_date.replace('Z', '+00:00'))
                end = dt.fromisoformat(due_date.replace('Z', '+00:00'))
                if start >= end:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Start date must be before due date"
                    )
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid date format. Please use ISO format (YYYY-MM-DD)"
                )

        # Get parent project if specified
        parent_id = project.get("parent_id")
        if parent_id and parent_id != "root":
            try:
                from bson import ObjectId
                parent_obj_id = ObjectId(parent_id)
                parent_project = await MongoStorageService.find_one("projects", 
                    {"_id": parent_obj_id}, 
                    tenant_id=tenant_id
                )
                if not parent_project:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail="Parent project not found"
                    )
            except Exception as e:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid parent project ID"
                )

        doc = {
            "name": name,
            "description": project.get("description", ""),
            "parent_id": parent_id or "root",
            "status": project.get("status", "ON_TRACK"),
            "priority": project.get("priority", "Normal"),
            "assignee": project.get("assignee"),
            "approver": project.get("approver"),
            "due_date": project.get("due_date"),
            "start_date": project.get("start_date"),
            "progress": project.get("progress", 0),
            "is_public": project.get("is_public", False),
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "tenantId": tenant_id,
            "userId": user_id
        }

        result_id = await MongoStorageService.insert_one("projects", doc, tenant_id=tenant_id)
        return {"id": str(result_id), "name": name}

    @classmethod
    async def get_projects(
        cls, 
        user: dict, 
        parent_id: Optional[str] = None,
        page: int = 1, 
        page_size: int = 20,
        search: Optional[str] = None,
        status: Optional[str] = None,
        sort_by: str = "name",
        sort_order: str = "asc"
    ) -> Dict[str, Any]:
        """Get projects with pagination and filtering"""
        tenant_id = await cls.validate_tenant_access(user)
        
        try:
            # Build filter query
            filter_query = {}
            
            # Filter by parent
            if parent_id is not None:
                filter_query["parent_id"] = parent_id
            
            # Search filter
            if search:
                filter_query["$or"] = [
                    {"name": {"$regex": search, "$options": "i"}},
                    {"description": {"$regex": search, "$options": "i"}}
                ]
            
            # Status filter
            if status:
                filter_query["status"] = status
            
            # Calculate pagination
            skip = (page - 1) * page_size
            
            # Get total count
            total_count = await MongoStorageService.count_documents("projects", filter_query, tenant_id=tenant_id)
            
            # Calculate pagination info
            total_pages = (total_count + page_size - 1) // page_size
            has_next = page < total_pages
            has_prev = page > 1
            
            # Determine sort order
            sort_direction = 1 if sort_order == "asc" else -1
            
            # Get paginated results
            projects_list = await MongoStorageService.find_many(
                "projects", 
                filter_query, 
                tenant_id=tenant_id,
                skip=skip,
                limit=page_size,
                sort_field=sort_by,
                sort_order=sort_direction
            )
            
            projects = []
            for project in projects_list:
                project_dict = dict(project)
                project_dict["id"] = str(project_dict.pop("_id"))
                
                # Get child count
                child_count = await MongoStorageService.count_documents(
                    "projects",
                    {"parent_id": project_dict["id"]},
                    tenant_id=tenant_id
                )
                project_dict["child_count"] = child_count
                
                projects.append(project_dict)
            
            logger.info(f"[PROJECT] Found {len(projects)}/{total_count} projects")
            
            return {
                "projects": projects,
                "pagination": {
                    "page": page,
                    "page_size": page_size,
                    "total": total_count,
                    "total_pages": total_pages,
                    "has_next": has_next,
                    "has_prev": has_prev
                }
            }
            
        except Exception as e:
            logger.error(f"[PROJECT] Error fetching projects: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to fetch projects"
            )

    @classmethod
    async def get_project_by_id(cls, project_id: str, user: dict) -> dict:
        """Get project by ID"""
        from bson import ObjectId
        tenant_id = await cls.validate_tenant_access(user)
        
        try:
            object_id = ObjectId(project_id)
            project = await MongoStorageService.find_one("projects",
                {"_id": object_id},
                tenant_id=tenant_id
            )
            
            if not project:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Project not found"
                )
            
            project_dict = dict(project)
            project_dict["id"] = str(project_dict.pop("_id"))
            
            # Get child count
            child_count = await MongoStorageService.count_documents(
                "projects",
                {"parent_id": project_dict["id"]},
                tenant_id=tenant_id
            )
            project_dict["child_count"] = child_count
            
            return project_dict
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"[PROJECT] Error fetching project {project_id}: {e}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid project ID"
            )

    @classmethod
    async def update_project(cls, project_id: str, updates: dict, user: dict) -> dict:
        """Update a project"""
        from bson import ObjectId
        tenant_id = await cls.validate_tenant_access(user)
        logger.info(f"[PROJECT] Updating project ID '{project_id}' for tenant: {tenant_id}")
        
        try:
            object_id = ObjectId(project_id)
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid project ID format"
            )
        
        # Get current project to check existing dates if needed
        current_project = await MongoStorageService.find_one("projects",
            {"_id": object_id},
            tenant_id=tenant_id
        )
        
        if not current_project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project not found"
            )
        
        # Validate required fields
        assignee = updates.get("assignee", current_project.get("assignee", "")).strip() if "assignee" in updates else current_project.get("assignee", "").strip()
        approver = updates.get("approver", current_project.get("approver", "")).strip() if "approver" in updates else current_project.get("approver", "").strip()
        start_date = updates.get("start_date", current_project.get("start_date"))
        due_date = updates.get("due_date", current_project.get("due_date"))
        
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
        
        # Validate start_date and due_date
        if start_date and due_date:
            try:
                from datetime import datetime as dt
                start = dt.fromisoformat(start_date.replace('Z', '+00:00'))
                end = dt.fromisoformat(due_date.replace('Z', '+00:00'))
                if start >= end:
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
        if "name" in update_data and isinstance(update_data["name"], str):
            update_data["name"] = update_data["name"].strip()
        update_data["updated_at"] = datetime.utcnow()
        
        result = await MongoStorageService.update_one("projects",
            {"_id": object_id},
            {"$set": update_data},
            tenant_id=tenant_id
        )
        
        if not result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project not found"
            )
        
        logger.info(f"[PROJECT] Successfully updated project '{project_id}'")
        return {"message": "Project updated successfully"}

    @classmethod
    async def delete_project(cls, project_id: str, user: dict) -> dict:
        """Delete a project and all its children recursively"""
        from bson import ObjectId
        tenant_id = await cls.validate_tenant_access(user)
        logger.info(f"[PROJECT] Deleting project ID '{project_id}' for tenant: {tenant_id}")
        
        try:
            object_id = ObjectId(project_id)
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid project ID format"
            )
        
        # Check for children
        child_count = await MongoStorageService.count_documents(
            "projects",
            {"parent_id": project_id},
            tenant_id=tenant_id
        )
        
        if child_count > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot delete project with {child_count} child project(s). Delete children first."
            )
        
        result = await MongoStorageService.delete_one("projects", {
            "_id": object_id
        }, tenant_id=tenant_id)
        
        if not result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project not found"
            )
        
        logger.info(f"[PROJECT] Successfully deleted project '{project_id}'")
        return {"message": "Project deleted successfully"}

    @classmethod
    async def get_project_tree(cls, user: dict, root_id: str = "root") -> List[dict]:
        """Get hierarchical project tree"""
        tenant_id = await cls.validate_tenant_access(user)
        
        async def build_tree(parent_id: str) -> List[dict]:
            projects = await MongoStorageService.find_many(
                "projects",
                {"parent_id": parent_id},
                tenant_id=tenant_id,
                sort_field="name",
                sort_order=1
            )
            
            result = []
            for project in projects:
                project_dict = dict(project)
                project_dict["id"] = str(project_dict.pop("_id"))
                project_dict["children"] = await build_tree(project_dict["id"])
                result.append(project_dict)
            
            return result
        
        return await build_tree(root_id)
