from typing import List, Dict, Any, Optional
from bson import ObjectId
from ..utils.log import logger
from ..utils.mongo_storage import MongoStorageService


class MenuService:
    @staticmethod
    async def get_menu_items() -> List[Dict[str, Any]]:
        """Get all active menu items, organized hierarchically"""
        try:
            # Get all active menu items ordered by order field
            items = await MongoStorageService.find_many(
                "menuItems",
                {"isActive": True},
                sort_field="order",
                sort_order=1
            )
            
            # Convert ObjectId to string for JSON serialization
            for item in items:
                item['_id'] = str(item['_id'])
                if item.get('parentId'):
                    item['parentId'] = str(item['parentId'])
            
            # Organize into hierarchy
            organized_items = MenuService._organize_hierarchy(items)
            return organized_items
        except Exception as e:
            logger.error(f"[MENU] Failed to retrieve menu items: {e}")
            raise
    
    @staticmethod
    def _organize_hierarchy(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Organize flat list into hierarchical structure"""
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
            
            # Default menu structure - reorganized hierarchy
            default_menu = [
                {
                    "label": "Home",
                    "to": "/dashboard/home",
                    "icon": "Star",
                    "order": 1,
                    "isActive": True,
                    "expandable": False
                },
                {
                    "label": "Agents",
                    "icon": "Gamepad2",
                    "order": 2,
                    "isActive": True,
                    "expandable": True
                },
                {
                    "label": "Configuration",
                    "icon": "Palette",
                    "order": 3,
                    "isActive": True,
                    "expandable": True
                },
                {
                    "label": "Workflows",
                    "icon": "TreePine",
                    "order": 4,
                    "isActive": True,
                    "expandable": True
                },
                {
                    "label": "Settings",
                    "icon": "Globe",
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
            
            # Get parent IDs for submenu items
            agents_parent_id = item_ids['Agents']
            configuration_parent_id = item_ids['Configuration']
            workflows_parent_id = item_ids['Workflows']
            settings_parent_id = item_ids['Settings']
            
            # Agents submenu items
            agents_children = [
                {
                    "label": "Playground",
                    "to": "/dashboard/agent-playground",
                    "icon": "Rocket",
                    "parentId": agents_parent_id,
                    "order": 1,
                    "isActive": True,
                    "expandable": False
                },
                {
                    "label": "Analytics",
                    "to": "/analytics",
                    "icon": "Microscope",
                    "parentId": agents_parent_id,
                    "order": 2,
                    "isActive": True,
                    "expandable": False
                }
            ]
            
            # Configuration submenu items
            configuration_children = [
                {
                    "label": "Models",
                    "to": "/agents/models",
                    "icon": "Diamond",
                    "parentId": configuration_parent_id,
                    "order": 1,
                    "isActive": True,
                    "expandable": False
                },
                {
                    "label": "Tools",
                    "to": "/agents/tools",
                    "icon": "Scissors",
                    "parentId": configuration_parent_id,
                    "order": 2,
                    "isActive": True,
                    "expandable": False
                },
                {
                    "label": "Databases",
                    "to": "/configuration/databases",
                    "icon": "Archive",
                    "parentId": configuration_parent_id,
                    "order": 3,
                    "isActive": True,
                    "expandable": False
                },
                {
                    "label": "Custom Connectors",
                    "to": "/configuration/custom-connectors",
                    "icon": "Magnet",
                    "parentId": configuration_parent_id,
                    "order": 4,
                    "isActive": True,
                    "expandable": False
                }
            ]
            
            # Workflows submenu items
            workflows_children = [
                {
                    "label": "Manage",
                    "to": "/workflows/manage",
                    "icon": "Paperclip",
                    "parentId": workflows_parent_id,
                    "order": 1,
                    "isActive": True,
                    "expandable": False
                },
                {
                    "label": "Monitor",
                    "to": "/workflows/monitor",
                    "icon": "Binoculars",
                    "parentId": workflows_parent_id,
                    "order": 2,
                    "isActive": True,
                    "expandable": False
                }
            ]
            
            # Settings submenu items
            settings_children = [
                {
                    "label": "Users",
                    "to": "/dashboard/users",
                    "icon": "Crown",
                    "parentId": settings_parent_id,
                    "order": 1,
                    "isActive": True,
                    "expandable": False
                },
                {
                    "label": "Role Management",
                    "to": "/dashboard/role-management",
                    "icon": "Key",
                    "parentId": settings_parent_id,
                    "order": 2,
                    "isActive": True,
                    "expandable": False
                },
                {
                    "label": "User Invitation",
                    "to": "/dashboard/user-invitation",
                    "icon": "Bell",
                    "parentId": settings_parent_id,
                    "order": 3,
                    "isActive": True,
                    "expandable": False
                }
            ]
            
            # Insert child items
            for item in agents_children + configuration_children + workflows_children + settings_children:
                await MongoStorageService.insert_one("menuItems", item)
            
            total_items = len(default_menu) + len(agents_children) + len(configuration_children) + len(workflows_children) + len(settings_children)
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
