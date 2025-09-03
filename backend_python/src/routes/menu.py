from fastapi import APIRouter, HTTPException, Depends
from typing import List, Dict, Any
from pydantic import BaseModel, Field

from src.services.menu_service import MenuService
from src.utils.rbac_middleware import require_roles
from ..utils.log import logger

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
    """Get all active menu items organized hierarchically (no auth required)."""
    logger.info("[MENU] Fetching menu items")
    try:
        menu_items = await MenuService.get_menu_items()
        logger.debug(f"[MENU] Retrieved {len(menu_items) if menu_items else 0} items")
        if not menu_items:
            logger.info("[MENU] No menu items found, seeding defaults")
            await MenuService.seed_default_menu_items()
            menu_items = await MenuService.get_menu_items()
        return {"success": True, "data": menu_items}
    except Exception as e:
        logger.error(f"[MENU] Error fetching menu items: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/menu-items")
async def create_menu_item(
    menu_item: MenuItemCreate,
    current_user=Depends(require_roles(["admin"]))
):
    """Create a new menu item (admin only)"""
    logger.info(f"[MENU] Creating menu item: {menu_item.label}")
    logger.debug(f"[MENU] Menu item data: {menu_item.dict(exclude_unset=True)}")
    try:
        item_id = await MenuService.create_menu_item(menu_item.dict(exclude_unset=True))
        logger.info(f"[MENU] Created menu item with ID: {item_id}")
        return {"success": True, "data": {"id": item_id}}
    except Exception as e:
        logger.error(f"[MENU] Error creating menu item: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/menu-items/{item_id}")
async def update_menu_item(
    item_id: str,
    menu_item: MenuItemUpdate,
    current_user=Depends(require_roles(["admin"]))
):
    """Update a menu item (admin only)"""
    logger.info(f"[MENU] Updating menu item: {item_id}")
    logger.debug(f"[MENU] Update data: {menu_item.dict(exclude_unset=True)}")
    try:
        success = await MenuService.update_menu_item(item_id, menu_item.dict(exclude_unset=True))
        if not success:
            logger.warning(f"[MENU] Menu item not found: {item_id}")
            raise HTTPException(status_code=404, detail="Menu item not found")
        logger.info(f"[MENU] Updated menu item: {item_id}")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[MENU] Error updating menu item: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/menu-items/{item_id}")
async def delete_menu_item(
    item_id: str,
    current_user=Depends(require_roles(["admin"]))
):
    """Delete a menu item (admin only)"""
    logger.info(f"[MENU] Deleting menu item: {item_id}")
    try:
        success = await MenuService.delete_menu_item(item_id)
        if not success:
            logger.warning(f"[MENU] Menu item not found for delete: {item_id}")
            raise HTTPException(status_code=404, detail="Menu item not found")
        logger.info(f"[MENU] Deleted menu item: {item_id}")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[MENU] Error deleting menu item: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/menu-items/reorder")
async def reorder_menu_items(
    item_orders: List[MenuItemReorder],
    current_user=Depends(require_roles(["admin"]))
):
    """Reorder menu items (admin only)"""
    logger.info("[MENU] Reordering menu items")
    logger.debug(f"[MENU] New order: {[item.dict() for item in item_orders]}")
    try:
        success = await MenuService.reorder_menu_items([item.dict() for item in item_orders])
        if not success:
            logger.error("[MENU] Failed to reorder menu items")
            raise HTTPException(status_code=500, detail="Failed to reorder menu items")
        logger.info("[MENU] Menu items reordered successfully")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[MENU] Error reordering menu items: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/menu-items/seed")
async def seed_menu_items(
    current_user=Depends(require_roles(["admin"]))
):
    """Seed default menu items (admin only)"""
    logger.info("[MENU] Seeding default menu items")
    try:
        await MenuService.seed_default_menu_items()
        logger.info("[MENU] Default menu items seeded successfully")
        return {"success": True, "message": "Menu items seeded successfully"}
    except Exception as e:
        logger.error(f"[MENU] Error seeding menu items: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
