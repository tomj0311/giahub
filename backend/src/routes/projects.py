"""
Project Routes

Handles project CRUD operations with tenant isolation.
"""

from fastapi import APIRouter, HTTPException, Depends, status, Query
from typing import Optional

from ..utils.auth import verify_token_middleware
from ..utils.log import logger
from ..services.project_service import ProjectService

router = APIRouter(tags=["projects"])


@router.post("/projects", status_code=status.HTTP_201_CREATED)
async def create_project(
    project: dict,
    user: dict = Depends(verify_token_middleware)
):
    """Create a new project"""
    try:
        result = await ProjectService.create_project(project, user)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[PROJECT] Failed to create project: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create project"
        )


@router.get("/projects")
async def get_projects(
    user: dict = Depends(verify_token_middleware),
    parent_id: Optional[str] = Query(None, description="Filter by parent project ID"),
    page: int = Query(1, ge=1, description="Page number (1-based)"),
    page_size: int = Query(20, ge=1, le=1100, description="Items per page"),
    search: Optional[str] = Query(None, description="Search in name and description"),
    status: Optional[str] = Query(None, description="Filter by status"),
    sort_by: str = Query("name", description="Sort field"),
    sort_order: str = Query("asc", description="Sort order")
):
    """List projects with pagination and filtering"""
    try:
        result = await ProjectService.get_projects(
            user=user,
            parent_id=parent_id,
            page=page,
            page_size=page_size,
            search=search,
            status=status,
            sort_by=sort_by,
            sort_order=sort_order
        )
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[PROJECT] Error fetching projects: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch projects")


@router.get("/projects/tree")
async def get_project_tree(
    user: dict = Depends(verify_token_middleware),
    root_id: str = Query("root", description="Root project ID")
):
    """Get hierarchical project tree"""
    try:
        result = await ProjectService.get_project_tree(user, root_id)
        return {"tree": result}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[PROJECT] Error fetching project tree: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch project tree")


@router.get("/projects/{project_id}")
async def get_project(
    project_id: str,
    user: dict = Depends(verify_token_middleware)
):
    """Get a specific project by ID"""
    try:
        project = await ProjectService.get_project_by_id(project_id, user)
        return project
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[PROJECT] Failed to fetch project {project_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch project"
        )


@router.put("/projects/{project_id}")
async def update_project(
    project_id: str,
    project_update: dict,
    user: dict = Depends(verify_token_middleware)
):
    """Update a project"""
    try:
        result = await ProjectService.update_project(project_id, project_update, user)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[PROJECT] Error updating project {project_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to update project")


@router.delete("/projects/{project_id}")
async def delete_project(
    project_id: str,
    user: dict = Depends(verify_token_middleware)
):
    """Delete a project"""
    try:
        result = await ProjectService.delete_project(project_id, user)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[PROJECT] Error deleting project {project_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete project")
