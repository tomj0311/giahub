from fastapi import APIRouter, HTTPException, Depends
from typing import List, Dict, Any
from pydantic import BaseModel, Field
from src.services.menu_service import MenuService
from src.utils.rbac_middleware import require_roles

router = APIRouter(prefix="/api")


class MenuItemCreate(BaseModel):
    label: str
    icon: str
    to: str = None
    parentId: str = None
    order: int = Field(default=999)
    isActive: bool = Field(default=True)
    expandable: bool = Field(default=False)


class MenuItemUpdate(BaseModel):
    label: str = None
    icon: str = None
    to: str = None
    parentId: str = None
    order: int = None
    isActive: bool = None
    expandable: bool = None


class MenuItemReorder(BaseModel):
    id: str
    order: int


@router.get("/menu-items")
async def get_menu_items():
    """Get all active menu items organized hierarchically"""
    try:
        menu_items = await MenuService.get_menu_items()
        return {"success": True, "data": menu_items}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/menu-items")
async def create_menu_item(
    menu_item: MenuItemCreate,
    current_user=Depends(require_roles(["admin"]))
):
    """Create a new menu item (admin only)"""
    try:
        item_id = await MenuService.create_menu_item(menu_item.dict(exclude_unset=True))
        return {"success": True, "data": {"id": item_id}}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/menu-items/{item_id}")
async def update_menu_item(
    item_id: str,
    menu_item: MenuItemUpdate,
    current_user=Depends(require_roles(["admin"]))
):
    """Update a menu item (admin only)"""
    try:
        success = await MenuService.update_menu_item(item_id, menu_item.dict(exclude_unset=True))
        if not success:
            raise HTTPException(status_code=404, detail="Menu item not found")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/menu-items/{item_id}")
async def delete_menu_item(
    item_id: str,
    current_user=Depends(require_roles(["admin"]))
):
    """Delete a menu item (admin only)"""
    try:
        success = await MenuService.delete_menu_item(item_id)
        if not success:
            raise HTTPException(status_code=404, detail="Menu item not found")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/menu-items/reorder")
async def reorder_menu_items(
    item_orders: List[MenuItemReorder],
    current_user=Depends(require_roles(["admin"]))
):
    """Reorder menu items (admin only)"""
    try:
        success = await MenuService.reorder_menu_items([item.dict() for item in item_orders])
        if not success:
            raise HTTPException(status_code=500, detail="Failed to reorder menu items")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/menu-items/seed")
async def seed_menu_items(
    current_user=Depends(require_roles(["admin"]))
):
    """Seed default menu items (admin only)"""
    try:
        await MenuService.seed_default_menu_items()
        return {"success": True, "message": "Menu items seeded successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
