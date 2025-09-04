from typing import List, Dict, Any, Optional
from bson import ObjectId
from ..utils.log import logger
from ..utils.mongo_storage import MongoStorageService


class MenuService:
    @staticmethod
    async def get_menu_items() -> List[Dict[str, Any]]:
        """Get all active menu items, organized hierarchically"""
        logger.debug("[MENU] Retrieving menu items")
        
        try:
            # Get all active menu items ordered by order field
            items = await MongoStorageService.find_many(
                "menuItems",
                {"isActive": True},
                sort_field="order",
                sort_order=1
            )
            logger.debug(f"[MENU] Retrieved {len(items)} active menu items")
            
            # Convert ObjectId to string for JSON serialization
            for item in items:
                item['_id'] = str(item['_id'])
                if item.get('parentId'):
                    item['parentId'] = str(item['parentId'])
            
            # Organize into hierarchy
            organized_items = MenuService._organize_hierarchy(items)
            logger.debug(f"[MENU] Organized into {len(organized_items)} root menu items")
            return organized_items
        except Exception as e:
            logger.error(f"[MENU] Failed to retrieve menu items: {e}")
            raise
    
    @staticmethod
    def _organize_hierarchy(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Organize flat list into hierarchical structure"""
        logger.debug(f"[MENU] Organizing {len(items)} items into hierarchy")
        item_map = {item['_id']: item for item in items}
        root_items = []
        
        for item in items:
            if item.get('parentId'):
                parent = item_map.get(item['parentId'])
                if parent:
                    if 'children' not in parent:
                        parent['children'] = []
                    parent['children'].append(item)
                else:
                    logger.warning(f"[MENU] Parent item not found for menu item: {item.get('label')}")
            else:
                root_items.append(item)
        
        logger.debug(f"[MENU] Hierarchy organized: {len(root_items)} root items")
        return root_items
    
    @staticmethod
    async def seed_default_menu_items():
        """Seed default menu items if none exist"""
        logger.info("[MENU] Checking if menu items need to be seeded")
        
        try:
            # Check if menu items already exist
            count = await MongoStorageService.count_documents("menuItems", {})
            if count > 0:
                logger.info(f"[MENU] Menu items already exist ({count} items), skipping seed")
                return
            
            logger.info("[MENU] Seeding default menu items...")
            
            # Default menu structure based on the Dashboard.jsx
            default_menu = [
                {
                    "label": "Home",
                    "to": "/dashboard/home",
                    "icon": "HomeIcon",
                    "order": 1,
                    "isActive": True,
                    "expandable": False
                },
                {
                    "label": "Analytics",
                    "to": "/analytics",
                    "icon": "BarChart3",
                    "order": 2,
                    "isActive": True,
                    "expandable": False
                },
                {
                    "label": "Store",
                    "icon": "Store",
                    "order": 3,
                    "isActive": True,
                    "expandable": True
                },
                {
                    "label": "Playground",
                    "to": "/dashboard/agent-playground",
                    "icon": "PlayCircle",
                    "order": 4,
                    "isActive": True,
                    "expandable": False
                },
                {
                    "label": "Settings",
                    "icon": "Settings",
                    "order": 100,
                    "isActive": True,
                    "expandable": True
                }
            ]
        
            # Insert parent items first to get their IDs
            inserted_ids = []
            for item in default_menu:
                item_id = await MongoStorageService.insert_one("menuItems", item)
                inserted_ids.append(item_id)
            
            item_ids = {item['label']: inserted_ids[i] for i, item in enumerate(default_menu)}
            logger.debug(f"[MENU] Inserted {len(default_menu)} parent menu items")
            
            # Store submenu items
            store_parent_id = item_ids['Store']
            settings_parent_id = item_ids['Settings']
            
            # Store submenu items
            store_children = [
                {
                    "label": "Agent Store",
                    "to": "/agents/agent-config",
                    "icon": "Bot",
                    "parentId": store_parent_id,
                    "order": 1,
                    "isActive": True,
                    "expandable": False
                },
                {
                    "label": "Models",
                    "to": "/agents/model-config",
                    "icon": "Settings",
                    "parentId": store_parent_id,
                    "order": 2,
                    "isActive": True,
                    "expandable": False
                },
                {
                    "label": "Tools",
                    "to": "/agents/tool-config",
                    "icon": "Wrench",
                    "parentId": store_parent_id,
                    "order": 3,
                    "isActive": True,
                    "expandable": False
                },
                {
                    "label": "Knowledge",
                    "to": "/agents/knowledge-config",
                    "icon": "BookOpen",
                    "parentId": store_parent_id,
                    "order": 4,
                    "isActive": True,
                    "expandable": False
                }
            ]
            
            # Settings submenu items
            settings_children = [
                {
                    "label": "Users",
                    "to": "/dashboard/users",
                    "icon": "PeopleIcon",
                    "parentId": settings_parent_id,
                    "order": 1,
                    "isActive": True,
                    "expandable": False
                },
                {
                    "label": "Role Management",
                    "to": "/dashboard/role-management",
                    "icon": "SecurityIcon",
                    "parentId": settings_parent_id,
                    "order": 2,
                    "isActive": True,
                    "expandable": False
                },
                {
                    "label": "User Invitation",
                    "to": "/dashboard/user-invitation",
                    "icon": "PersonAddIcon",
                    "parentId": settings_parent_id,
                    "order": 3,
                    "isActive": True,
                    "expandable": False
                }
            ]
            
            # Insert child items
            for item in store_children + settings_children:
                await MongoStorageService.insert_one("menuItems", item)
            logger.debug(f"[MENU] Inserted {len(store_children + settings_children)} child menu items")
            
            total_items = len(default_menu) + len(store_children) + len(settings_children)
            logger.info(f"[MENU] Successfully seeded {total_items} menu items")
        except Exception as e:
            logger.error(f"[MENU] Failed to seed menu items: {e}")
            raise
    
    @staticmethod
    async def create_menu_item(menu_item_data: Dict[str, Any]) -> str:
        """Create a new menu item"""
        logger.info(f"[MENU] Creating new menu item: {menu_item_data.get('label')}")
        
        try:
            # Ensure required fields
            menu_item_data.setdefault('isActive', True)
            menu_item_data.setdefault('expandable', False)
            menu_item_data.setdefault('order', 999)
            
            result = await MongoStorageService.insert_one("menuItems", menu_item_data)
            menu_id = str(result)
            logger.info(f"[MENU] Successfully created menu item: {menu_item_data.get('label')} (ID: {menu_id})")
            return menu_id
        except Exception as e:
            logger.error(f"[MENU] Failed to create menu item: {e}")
            raise
    
    @staticmethod
    async def update_menu_item(item_id: str, update_data: Dict[str, Any]) -> bool:
        """Update a menu item"""
        logger.info(f"[MENU] Updating menu item: {item_id}")
        
        try:
            result = await MongoStorageService.update_one(
                "menuItems",
                {"_id": ObjectId(item_id)},
                update_data
            )
            if result:
                logger.info(f"[MENU] Successfully updated menu item: {item_id}")
            else:
                logger.warning(f"[MENU] No changes made to menu item: {item_id}")
            return result
        except Exception as e:
            logger.error(f"[MENU] Failed to update menu item {item_id}: {e}")
            raise
    
    @staticmethod
    async def delete_menu_item(item_id: str) -> bool:
        """Delete a menu item (soft delete by setting isActive to False)"""
        logger.info(f"[MENU] Deleting menu item: {item_id}")
        
        try:
            result = await MongoStorageService.update_one(
                "menuItems",
                {"_id": ObjectId(item_id)},
                {"isActive": False}
            )
            if result:
                logger.info(f"[MENU] Successfully deleted menu item: {item_id}")
            else:
                logger.warning(f"[MENU] Menu item not found for deletion: {item_id}")
            return result
        except Exception as e:
            logger.error(f"[MENU] Failed to delete menu item {item_id}: {e}")
            raise
    
    @staticmethod
    async def reorder_menu_items(item_orders: List[Dict[str, Any]]) -> bool:
        """Reorder menu items by updating their order field"""
        
        try:
            for item_order in item_orders:
                await MongoStorageService.update_one(
                    "menuItems",
                    {"_id": ObjectId(item_order['id'])},
                    {"order": item_order['order']}
                )
            return True
        except Exception as e:
            logger.error(f"Error reordering menu items: {e}")
            return False
