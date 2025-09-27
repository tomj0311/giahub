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

            # Look for potential owners or email addresses in extensions
            email_addresses = []
            
            # Check for potentialOwners in extensions
            if 'potentialOwners' in extensions:
                potential_owners = extensions['potentialOwners']
                if isinstance(potential_owners, list):
                    for owner in potential_owners:
                        if isinstance(owner, str):
                            # Split by comma and clean up email addresses
                            emails = [email.strip() for email in owner.split(',')]
                            email_addresses.extend(emails)
                        elif isinstance(owner, dict) and 'email' in owner:
                            email_addresses.append(owner['email'])
                elif isinstance(potential_owners, str):
                    # Single string with comma-separated emails
                    emails = [email.strip() for email in potential_owners.split(',')]
                    email_addresses.extend(emails)

            # Also check for direct email fields in extensions
            for key, value in extensions.items():
                if 'email' in key.lower() and isinstance(value, str):
                    if '@' in value:  # Basic email validation
                        email_addresses.append(value)

            # Remove duplicates and filter valid emails
            email_addresses = list(set([email for email in email_addresses if email and '@' in email]))

            if not email_addresses:
                logger.debug(f"[TASK_NOTIFY] No email addresses found in task {task.task_spec.bpmn_id} extensions")
                return

            logger.info(f"[TASK_NOTIFY] Sending task assignment emails to: {email_addresses}")

            # Create email content
            task_name = getattr(task.task_spec, 'name', task.task_spec.bpmn_id)
            subject = f"Task Assignment: {task_name}"
            
            # Get form data for context
            form_data = getattr(task, 'data', {})
            form_fields_info = ""
            if 'formData' in form_data and 'formFields' in form_data['formData']:
                form_fields = form_data['formData']['formFields']
                if form_fields:
                    form_fields_info = f"\n\nTask contains {len(form_fields)} form fields to complete."

            html_content = f"""
            <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.5;font-size:15px;color:#222;">
                <h2 style="margin:0 0 16px;">Task Assignment Notification</h2>
                <p>You have been assigned a new task to complete on the GIA Platform.</p>
                
                <div style="background:#f5f5f5;padding:16px;border-radius:6px;margin:16px 0;">
                    <strong>Task Details:</strong><br>
                    <strong>Task Name:</strong> {task_name}<br>
                    <strong>Task ID:</strong> {task.task_spec.bpmn_id}<br>
                    <strong>Workflow ID:</strong> {workflow_id}<br>
                    <strong>Instance ID:</strong> {instance_id}{form_fields_info}
                </div>
                
                <p>Please log into the platform to view and complete this task.</p>
                
                <p>
                    <a href="{os.getenv('CLIENT_URL', 'http://localhost:5173')}/workflows/{workflow_id}/instances/{instance_id}" 
                       style="background:#1976d2;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;font-weight:bold;">
                       View Task
                    </a>
                </p>
                
                <hr style="border:none;border-top:1px solid #ddd;margin:20px 0;">
                <p style="font-size:12px;color:#666;">
                    This is an automated notification from the GIA Platform workflow system.<br>
                    Please do not reply to this email.
                </p>
            </div>
            """

            text_content = f"""
Task Assignment Notification

You have been assigned a new task to complete on the GIA Platform.

Task Details:
- Task Name: {task_name}
- Task ID: {task.task_spec.bpmn_id}
- Workflow ID: {workflow_id}
- Instance ID: {instance_id}{form_fields_info}

Please log into the platform to view and complete this task.

Link: {os.getenv('CLIENT_URL', 'http://localhost:5173')}/workflows/{workflow_id}/instances/{instance_id}

This is an automated notification from the GIA Platform workflow system.
Please do not reply to this email.
            """

            # Send emails to all potential owners
            for email_address in email_addresses:
                try:
                    await send_email(email_address, subject, html_content, text_content)
                    logger.info(f"[TASK_NOTIFY] Task assignment email sent to {email_address}")
                except Exception as email_error:
                    logger.error(f"[TASK_NOTIFY] Failed to send task assignment email to {email_address}: {email_error}")
                    # Continue with other emails even if one fails

        except Exception as e:
            logger.error(f"[TASK_NOTIFY] Error sending task assignment emails: {e}")
            # Don't raise - workflow should continue even if email fails