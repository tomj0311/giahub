"""
Task Notification Service

Handles sending email notifications for workflow task assignments.
"""

import os
from typing import Any, Dict
from ..utils.log import logger
from .email_service import send_email


class TaskNotificationService:
    """Service for sending task assignment notifications"""

    @staticmethod
    async def send_task_assignment_emails(task, workflow_id: str, instance_id: str):
        """Send email notifications to potential owners when a task is assigned"""
        try:
            # Check if task has extensions with email addresses
            if not hasattr(task.task_spec, 'extensions') or not task.task_spec.extensions:
                logger.debug(f"[TASK_NOTIFY] No extensions found for task {task.task_spec.bpmn_id}")
                return

            extensions = task.task_spec.extensions
            logger.info(f"[TASK_NOTIFY] Task {task.task_spec.bpmn_id} has extensions: {extensions}")

            # Look for potential owners with email addresses and due dates
            email_data = []  # List of {email, due_date} dicts
            
            # Check for potentialOwners in extensions
            if 'potentialOwners' in extensions:
                potential_owners = extensions['potentialOwners']
                if isinstance(potential_owners, list):
                    for owner in potential_owners:
                        if isinstance(owner, dict) and 'extensions' in owner:
                            owner_extensions = owner['extensions']
                            if 'userEmail' in owner_extensions:
                                email_data.append({
                                    'email': owner_extensions['userEmail'],
                                    'due_date': owner_extensions.get('dueDate')
                                })

            # Filter out invalid emails
            email_data = [item for item in email_data if item['email'] and '@' in item['email']]

            if not email_data:
                logger.debug(f"[TASK_NOTIFY] No email addresses found in task {task.task_spec.bpmn_id} extensions")
                return

            logger.info(f"[TASK_NOTIFY] Sending task assignment emails to: {[item['email'] for item in email_data]}")

            # Create email content
            task_name = getattr(task.task_spec, 'name', task.task_spec.bpmn_id)
            subject = f"Task Assignment: {task_name}"
            
            # Get form data for context
            form_fields_info = ""
            if 'formData' in extensions and 'formFields' in extensions['formData']:
                form_fields = extensions['formData']['formFields']
                if form_fields:
                    form_fields_info = f"<br><strong>Form Fields:</strong> {len(form_fields)} fields to complete"

            # Send emails to all potential owners
            for email_item in email_data:
                email_address = email_item['email']
                due_date = email_item['due_date']
                
                # Add due date info if available
                due_date_info = ""
                if due_date:
                    due_date_info = f"<br><strong>Due Date:</strong> {due_date}"
                
                html_content = f"""
                <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.5;font-size:15px;color:#222;">
                    <h2 style="margin:0 0 16px;">Task Assignment Notification</h2>
                    <p>You have been assigned a new task to complete on the GIA Platform.</p>
                    
                    <div style="background:#f5f5f5;padding:16px;border-radius:6px;margin:16px 0;">
                        <strong>Task Details:</strong><br>
                        <strong>Task Name:</strong> {task_name}<br>
                        <strong>Task ID:</strong> {task.task_spec.bpmn_id}<br>
                        <strong>Workflow ID:</strong> {workflow_id}<br>
                        <strong>Instance ID:</strong> {instance_id}{form_fields_info}{due_date_info}
                    </div>
                    
                    <p>Please log into the platform to view and complete this task.</p>
                    
                    <p>
                        <a href="{os.getenv('CLIENT_URL', 'http://localhost:5173')}/dashboard/task/{workflow_id}/{instance_id}" 
                           style="background:#1976d2;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;font-weight:bold;">
                           Complete Task
                        </a>
                    </p>
                    
                    <hr style="border:none;border-top:1px solid #ddd;margin:20px 0;">
                    <p style="font-size:12px;color:#666;">
                        This is an automated notification from the GIA system.<br>
                        Please do not reply to this email.
                    </p>
                </div>
                """

                try:
                    await send_email(email_address, subject, html_content, "")
                    logger.info(f"[TASK_NOTIFY] Task assignment email sent to {email_address}")
                except Exception as email_error:
                    logger.error(f"[TASK_NOTIFY] Failed to send task assignment email to {email_address}: {email_error}")
                    # Continue with other emails even if one fails

        except Exception as e:
            logger.error(f"[TASK_NOTIFY] Error sending task assignment emails: {e}")
            # Don't raise - workflow should continue even if email fails