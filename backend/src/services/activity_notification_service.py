"""
Activity Notification Service

Handles notification creation, storage, and email sending for activity notifications.
"""

import os
from datetime import datetime
from typing import List, Dict, Any
from fastapi import HTTPException, status

from ..utils.log import logger
from ..utils.mongo_storage import MongoStorageService
from ..modules.email_sender import send_notification_email
from ..services.project_activity_service import ProjectActivityService


class ActivityNotificationService:
    """Service for managing activity notifications"""
    
    @staticmethod
    async def validate_tenant_access(user: dict) -> str:
        """Validate tenant access and return tenant_id"""
        user_id = user.get("id")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid user"
            )
        
        tenant_id = user.get("tenantId")
        if not tenant_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User does not belong to any tenant"
            )
        
        return tenant_id
    
    @classmethod
    async def create_notification(
        cls, 
        activity_id: str, 
        notification: dict, 
        user: dict
    ) -> Dict[str, Any]:
        """Create a new notification and send emails to mentioned users"""
        from bson import ObjectId
        
        logger.info(f"[NOTIFICATION] Creating notification for activity {activity_id}")
        
        tenant_id = await cls.validate_tenant_access(user)
        user_id = user.get("id")
        user_email = user.get("email", "")
        user_name = user.get("name") or user.get("firstName", "") or user_email
        
        # Validate activity exists
        try:
            activity = await ProjectActivityService.get_activity_by_id(activity_id, user)
        except Exception as e:
            logger.error(f"[NOTIFICATION] Activity not found: {e}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Activity not found"
            )
        
        message = notification.get("message", "").strip()
        mentioned_users = notification.get("mentioned_users", [])
        files = notification.get("files", [])
        
        if not message and len(files) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Message or files required"
            )
        
        # Create notification document
        doc = {
            "activity_id": activity_id,
            "sender_id": user_id,
            "sender_email": user_email,
            "sender_name": user_name,
            "message": message,
            "mentioned_users": mentioned_users,
            "files": files,
            "created_at": datetime.utcnow(),
            "tenantId": tenant_id,
        }
        
        logger.info(f"[NOTIFICATION_CREATE] Storing notification with activity_id='{activity_id}' (type: {type(activity_id).__name__})")
        logger.info(f"[NOTIFICATION_CREATE] Document to be inserted: {doc}")
        
        # Save to MongoDB
        notification_id = await MongoStorageService.insert_one(
            "activityNotifications",
            doc,
            tenant_id=tenant_id
        )
        
        if not notification_id:
            logger.error(f"[NOTIFICATION_CREATE] ❌ Failed to save notification - insert_one returned None")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to save notification to database"
            )
        
        logger.info(f"[NOTIFICATION_CREATE] ✅ Successfully saved notification with ID: {notification_id}")
        
        # VERIFY: Read back the saved notification to confirm it's in the database
        from bson import ObjectId
        saved_notification = await MongoStorageService.find_one(
            "activityNotifications",
            {"_id": ObjectId(notification_id)},
            tenant_id=tenant_id
        )
        
        if saved_notification:
            logger.info(f"[NOTIFICATION_CREATE] ✅ VERIFIED: Notification exists in database with activity_id={saved_notification.get('activity_id')}")
        else:
            logger.error(f"[NOTIFICATION_CREATE] ❌ VERIFICATION FAILED: Notification not found in database after insert!")
        
        # Send emails to mentioned users
        if mentioned_users:
            await cls._send_notification_emails(
                activity=activity,
                sender_name=user_name,
                message=message,
                mentioned_users=mentioned_users,
                files=files
            )
        
        # Return created notification with proper serialization
        response_doc = {
            "id": str(notification_id),
            "activity_id": activity_id,
            "sender_id": user_id,
            "sender_email": user_email,
            "sender_name": user_name,
            "message": message,
            "mentioned_users": mentioned_users,
            "files": files,
            "created_at": doc["created_at"].isoformat(),
            "tenantId": tenant_id,
        }
        
        logger.info(f"[NOTIFICATION_CREATE] ✅ Returning response: {response_doc}")
        
        return {
            "message": "Notification created successfully",
            "notification": response_doc
        }
    
    @classmethod
    async def _send_notification_emails(
        cls,
        activity: dict,
        sender_name: str,
        message: str,
        mentioned_users: List[str],
        files: List[dict]
    ):
        """Send email notifications to mentioned users"""
        try:
            activity_subject = activity.get("subject", "Activity")
            project_id = activity.get("project_id", "")
            
            # Prepare file list for email
            file_list = ""
            if files:
                file_list = "<br><br><strong>Attached files:</strong><br>"
                for file in files:
                    file_list += f"- {file.get('filename', 'Unknown file')}<br>"
            
            # Send email to each mentioned user
            for user_email in mentioned_users:
                if not user_email or "@" not in user_email:
                    continue
                
                email_message = f"""
You were mentioned in a notification for activity: <strong>{activity_subject}</strong>

<strong>From:</strong> {sender_name}

<strong>Message:</strong><br>
{message}

{file_list}
                """.strip()
                
                # Send notification email
                redirect_url = os.getenv('REDIRECT_URL', 'http://localhost:5173')
                result = send_notification_email(
                    to=user_email,
                    title=f"Activity Notification: {activity_subject}",
                    message=email_message,
                    action_url=f"{redirect_url}/dashboard/projects/activity/{activity.get('id')}",
                    action_text="View Activity"
                )
                
                if result.get("success"):
                    logger.info(f"[NOTIFICATION] Email sent to {user_email}")
                else:
                    logger.error(f"[NOTIFICATION] Failed to send email to {user_email}: {result.get('error')}")
        
        except Exception as e:
            logger.error(f"[NOTIFICATION] Error sending emails: {e}")
            # Don't raise - notification was saved, email is secondary
    
    @classmethod
    async def get_notifications(
        cls,
        activity_id: str,
        user: dict
    ) -> Dict[str, Any]:
        """Get all notifications for an activity"""
        from bson import ObjectId
        
        tenant_id = await cls.validate_tenant_access(user)
        
        logger.info(f"[NOTIFICATION_GET] Requested activity_id='{activity_id}' (type: {type(activity_id).__name__}), tenant_id='{tenant_id}'")
        
        try:
            # Validate activity exists
            try:
                await ProjectActivityService.get_activity_by_id(activity_id, user)
            except Exception:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Activity not found"
                )
            
            # Fetch notifications with EXACT match on activity_id
            query_filter = {"activity_id": activity_id}
            logger.info(f"[NOTIFICATION_QUERY] Query filter: {query_filter}")
            logger.info(f"[NOTIFICATION_QUERY] Tenant ID: {tenant_id}")
            
            # ALSO query ALL notifications for this tenant to see what's in the database
            all_notifications = await MongoStorageService.find_many(
                "activityNotifications",
                {},
                tenant_id=tenant_id,
                sort_field="created_at",
                sort_order=-1
            )
            logger.info(f"[NOTIFICATION_QUERY] 🔍 Total notifications in database for tenant: {len(all_notifications)}")
            if all_notifications:
                for idx, notif in enumerate(all_notifications[:5]):  # Show first 5
                    logger.info(f"[NOTIFICATION_QUERY] 🔍 Sample {idx+1}: activity_id={notif.get('activity_id')}, created_at={notif.get('created_at')}")
            
            notifications = await MongoStorageService.find_many(
                "activityNotifications",
                query_filter,
                tenant_id=tenant_id,
                sort_field="created_at",
                sort_order=-1
            )
            
            logger.info(f"[NOTIFICATION_QUERY] ✅ Raw query returned {len(notifications)} notifications for activity_id={activity_id}")
            
            if notifications:
                logger.info(f"[NOTIFICATION_QUERY] First notification sample: {notifications[0]}")
            else:
                logger.warning(f"[NOTIFICATION_QUERY] ⚠️ NO notifications found for activity_id={activity_id}")
            
            # Format notifications and FILTER again to be absolutely sure
            notification_list = []
            for notif in notifications:
                notif_dict = dict(notif)
                notif_activity_id = notif_dict.get('activity_id')
                
                # Log each notification's activity_id for debugging
                logger.info(f"[NOTIFICATION_FILTER] Notification activity_id='{notif_activity_id}' (match: {notif_activity_id == activity_id})")
                
                # STRICT FILTER: Only include if activity_id matches EXACTLY
                if notif_activity_id != activity_id:
                    logger.warning(f"[NOTIFICATION_FILTER] SKIPPING notification - activity_id mismatch: '{notif_activity_id}' != '{activity_id}'")
                    continue
                
                notif_dict["id"] = str(notif_dict.pop("_id"))
                # Serialize datetime to ISO format
                if "created_at" in notif_dict and notif_dict["created_at"]:
                    notif_dict["created_at"] = notif_dict["created_at"].isoformat()
                if "updated_at" in notif_dict and notif_dict["updated_at"]:
                    notif_dict["updated_at"] = notif_dict["updated_at"].isoformat()
                notification_list.append(notif_dict)
            
            logger.info(f"[NOTIFICATION] Fetched {len(notification_list)} notifications for activity {activity_id}")
            
            return {
                "notifications": notification_list,
                "count": len(notification_list)
            }
        
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"[NOTIFICATION] Error fetching notifications: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to fetch notifications"
            )
