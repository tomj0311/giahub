"""
Email sending utilities for dynamic function execution.
Supports multiple recipients (to, cc, bcc) and HTML/text content.
"""

import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import List, Union
import ssl

# Email configuration
SMTP_HOST = os.getenv("SMTP_HOST")
SMTP_PORT = int(os.getenv("SMTP_PORT", 587))
SMTP_USER = os.getenv("SMTP_USER")
SMTP_PASS = os.getenv("SMTP_PASS")
SMTP_SECURE = os.getenv("SMTP_SECURE", "false").lower() == "true"
CLIENT_URL = os.getenv("CLIENT_URL", "http://localhost:5173")


def _normalize_recipients(recipients: Union[str, List[str]]) -> List[str]:
    """
    Normalize recipients to a list of email addresses.
    
    Args:
        recipients: Single email or list of emails
        
    Returns:
        List of email addresses
    """
    if isinstance(recipients, str):
        # Split by comma if multiple emails in string
        return [email.strip() for email in recipients.split(',') if email.strip()]
    elif isinstance(recipients, list):
        return [email.strip() for email in recipients if email.strip()]
    return []


def _send_email(
    to: Union[str, List[str]],
    subject: str,
    html_content: str = None,
    text_content: str = None,
    cc: Union[str, List[str]] = None,
    bcc: Union[str, List[str]] = None,
    from_email: str = None
) -> dict:
    """
    Send an email to multiple recipients with support for CC and BCC.
    
    Args:
        to: Recipient email address(es) - string or list
        subject: Email subject
        html_content: HTML content of the email (optional if text_content provided)
        text_content: Plain text content of the email (optional if html_content provided)
        cc: CC email address(es) - string or list (optional)
        bcc: BCC email address(es) - string or list (optional)
        from_email: Sender email address (optional, defaults to SMTP_USER)
        
    Returns:
        Dictionary with status and message
    """
    if not SMTP_HOST:
        return {
            "success": False,
            "error": "SMTP not configured. Please set SMTP environment variables."
        }
    
    if not html_content and not text_content:
        return {
            "success": False,
            "error": "Either html_content or text_content must be provided"
        }
    
    try:
        # Normalize recipients
        to_list = _normalize_recipients(to)
        cc_list = _normalize_recipients(cc) if cc else []
        bcc_list = _normalize_recipients(bcc) if bcc else []
        
        if not to_list:
            return {
                "success": False,
                "error": "At least one 'to' recipient is required"
            }
        
        # Create message
        message = MIMEMultipart("alternative")
        message["Subject"] = subject
        message["From"] = from_email or SMTP_USER
        message["To"] = ", ".join(to_list)
        
        if cc_list:
            message["Cc"] = ", ".join(cc_list)
        
        # BCC is not included in headers (by definition)
        
        # Add text part if provided
        if text_content:
            text_part = MIMEText(text_content, "plain")
            message.attach(text_part)
        
        # Add HTML part if provided
        if html_content:
            html_part = MIMEText(html_content, "html")
            message.attach(html_part)
        
        # Combine all recipients for SMTP send
        all_recipients = to_list + cc_list + bcc_list
        
        # Gmail specific configuration
        is_gmail = "gmail.com" in (SMTP_USER or "") or SMTP_HOST == "smtp.gmail.com"
        
        # Create SSL context
        context = ssl.create_default_context()
        
        # Send email
        if is_gmail or SMTP_PORT == 465:
            # Use SMTP_SSL for port 465
            with smtplib.SMTP_SSL(SMTP_HOST, int(os.getenv("SMTP_PORT", 465)), context=context) as server:
                if SMTP_USER and SMTP_PASS:
                    server.login(SMTP_USER, SMTP_PASS)
                server.sendmail(from_email or SMTP_USER, all_recipients, message.as_string())
        else:
            # Use STARTTLS for other ports
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
                if SMTP_SECURE:
                    server.starttls(context=context)
                if SMTP_USER and SMTP_PASS:
                    server.login(SMTP_USER, SMTP_PASS)
                server.sendmail(from_email or SMTP_USER, all_recipients, message.as_string())
        
        return {
            "success": True,
            "message": f"Email sent successfully to {len(all_recipients)} recipient(s)",
            "recipients": {
                "to": to_list,
                "cc": cc_list,
                "bcc": bcc_list
            }
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": f"Failed to send email: {str(e)}"
        }


def send_simple_email(
    to: Union[str, List[str]],
    subject: str,
    message: str
) -> dict:
    """
    Send a simple plain text email to one or more recipients.
    
    Args:
        to: Recipient email address(es) - string or list
        subject: Email subject
        message: Plain text message content
        
    Returns:
        Dictionary with status and message
    """
    return _send_email(
        to=to,
        subject=subject,
        text_content=message
    )


def send_html_email(
    to: Union[str, List[str]],
    subject: str,
    html_body: str,
    cc: Union[str, List[str]] = None,
    bcc: Union[str, List[str]] = None
) -> dict:
    """
    Send an HTML email with optional CC and BCC.
    
    Args:
        to: Recipient email address(es) - string or list
        subject: Email subject
        html_body: HTML content of the email
        cc: CC email address(es) - string or list (optional)
        bcc: BCC email address(es) - string or list (optional)
        
    Returns:
        Dictionary with status and message
    """
    # Generate plain text version from HTML
    import re
    text_body = re.sub('<[^<]+?>', '', html_body)
    
    return _send_email(
        to=to,
        subject=subject,
        html_content=html_body,
        text_content=text_body,
        cc=cc,
        bcc=bcc
    )


def send_notification_email(
    to: Union[str, List[str]],
    title: str,
    message: str,
    action_url: str = None,
    action_text: str = "View Details"
) -> dict:
    """
    Send a formatted notification email with optional action button.
    
    Args:
        to: Recipient email address(es) - string or list
        title: Notification title
        message: Notification message
        action_url: Optional URL for action button
        action_text: Text for the action button
        
    Returns:
        Dictionary with status and message
    """
    html_content = f"""
    <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;font-size:15px;color:#333;max-width:600px;margin:0 auto;">
        <div style="background:#1976d2;color:#fff;padding:20px;border-radius:8px 8px 0 0;">
            <h2 style="margin:0;">{title}</h2>
        </div>
        <div style="background:#f9f9f9;padding:30px;border-radius:0 0 8px 8px;">
            <p style="margin:0 0 20px;">{message}</p>
    """
    
    if action_url:
        html_content += f"""
            <p style="text-align:center;margin:30px 0;">
                <a href="{action_url}" 
                   style="background:#1976d2;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;font-weight:bold;">
                   {action_text}
                </a>
            </p>
        """
    
    html_content += """
            <hr style="border:none;border-top:1px solid #ddd;margin:20px 0;">
            <p style="font-size:12px;color:#666;margin:0;">
                This is an automated notification. Please do not reply to this email.
            </p>
        </div>
    </div>
    """
    
    text_content = f"""
{title}

{message}
"""
    
    if action_url:
        text_content += f"""

{action_text}: {action_url}
"""
    
    text_content += """

---
This is an automated notification. Please do not reply to this email.
    """
    
    return _send_email(
        to=to,
        subject=title,
        html_content=html_content,
        text_content=text_content
    )
