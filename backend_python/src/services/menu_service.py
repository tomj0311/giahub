import logging
from typing import List, Dict, Any, Optional
from bson import ObjectId
from src.db import get_collections

logger = logging.getLogger(__name__)


class MenuService:
    @staticmethod
    async def get_menu_items() -> List[Dict[str, Any]]:
        """Get all active menu items, organized hierarchically"""
        collections = get_collections()
        
        # Get all active menu items ordered by order field
        cursor = collections['menuItems'].find(
            {"isActive": True}
        ).sort("order", 1)
        
        items = await cursor.to_list(length=None)
        
        # Convert ObjectId to string for JSON serialization
        for item in items:
            item['_id'] = str(item['_id'])
            if item.get('parentId'):
                item['parentId'] = str(item['parentId'])
        
        # Organize into hierarchy
        return MenuService._organize_hierarchy(items)
    
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
                root_items.append(item)
        
        return root_items
    
    @staticmethod
    async def seed_default_menu_items():
        """Seed default menu items if none exist"""
        collections = get_collections()
        
        # Check if menu items already exist
        count = await collections['menuItems'].count_documents({})
        if count > 0:
            logger.info("Menu items already exist, skipping seed")
            return
        
        logger.info("Seeding default menu items...")
        
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
                "to": "/runner",
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
        inserted_items = await collections['menuItems'].insert_many(default_menu)
        item_ids = {item['label']: inserted_items.inserted_ids[i] for i, item in enumerate(default_menu)}
        
        # Store submenu items
        store_parent_id = item_ids['Store']
        settings_parent_id = item_ids['Settings']
        
        # Store submenu items
        store_children = [
            {
                "label": "Agent Store",
                "to": "/store/agents",
                "icon": "Bot",
                "parentId": store_parent_id,
                "order": 1,
                "isActive": True,
                "expandable": False
            },
            {
                "label": "Models",
                "to": "/dashboard/model-config",
                "icon": "Settings",
                "parentId": store_parent_id,
                "order": 2,
                "isActive": True,
                "expandable": False
            },
            {
                "label": "Tools",
                "to": "/dashboard/tool-config",
                "icon": "Wrench",
                "parentId": store_parent_id,
                "order": 3,
                "isActive": True,
                "expandable": False
            },
            {
                "label": "Knowledge",
                "to": "/dashboard/knowledge-config",
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
        await collections['menuItems'].insert_many(store_children + settings_children)
        
        logger.info(f"Successfully seeded {len(default_menu) + len(store_children) + len(settings_children)} menu items")
    
    @staticmethod
    async def create_menu_item(menu_item_data: Dict[str, Any]) -> str:
        """Create a new menu item"""
        collections = get_collections()
        
        # Ensure required fields
        menu_item_data.setdefault('isActive', True)
        menu_item_data.setdefault('expandable', False)
        menu_item_data.setdefault('order', 999)
        
        result = await collections['menuItems'].insert_one(menu_item_data)
        return str(result.inserted_id)
    
    @staticmethod
    async def update_menu_item(item_id: str, update_data: Dict[str, Any]) -> bool:
        """Update a menu item"""
        collections = get_collections()
        
        result = await collections['menuItems'].update_one(
            {"_id": ObjectId(item_id)},
            {"$set": update_data}
        )
        return result.modified_count > 0
    
    @staticmethod
    async def delete_menu_item(item_id: str) -> bool:
        """Delete a menu item (soft delete by setting isActive to False)"""
        collections = get_collections()
        
        result = await collections['menuItems'].update_one(
            {"_id": ObjectId(item_id)},
            {"$set": {"isActive": False}}
        )
        return result.modified_count > 0
    
    @staticmethod
    async def reorder_menu_items(item_orders: List[Dict[str, Any]]) -> bool:
        """Reorder menu items by updating their order field"""
        collections = get_collections()
        
        try:
            for item_order in item_orders:
                await collections['menuItems'].update_one(
                    {"_id": ObjectId(item_order['id'])},
                    {"$set": {"order": item_order['order']}}
                )
            return True
        except Exception as e:
            logger.error(f"Error reordering menu items: {e}")
            return False
