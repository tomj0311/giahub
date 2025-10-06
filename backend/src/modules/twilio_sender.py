"""
Twilio communication utilities for SMS, WhatsApp, and Email.
Simple implementation for dynamic function execution.
"""

import os
from typing import Optional, Dict, Any
from twilio.rest import Client
from twilio.base.exceptions import TwilioRestException

# Twilio configuration
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "UXRN9MKT7ZT91JGX448AANAP")
TWILIO_PHONE_NUMBER = os.getenv("TWILIO_PHONE_NUMBER")
TWILIO_WHATSAPP_NUMBER = os.getenv("TWILIO_WHATSAPP_NUMBER", "whatsapp:+14155238886")  # Twilio Sandbox
TWILIO_EMAIL_FROM = os.getenv("TWILIO_EMAIL_FROM")

# Initialize Twilio client
client = None
if TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN:
    client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)


def send_sms(to: str, message: str, from_number: str = None) -> Dict[str, Any]:
    """
    Send SMS message via Twilio.
    
    Args:
        to: Recipient phone number (E.164 format, e.g., +1234567890)
        message: SMS message content
        from_number: Sender phone number (optional, uses TWILIO_PHONE_NUMBER if not provided)
        
    Returns:
        Dictionary with status and message
    """
    if not client:
        return {
            "success": False,
            "error": "Twilio not configured. Please set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN."
        }
    
    if not from_number:
        from_number = TWILIO_PHONE_NUMBER
        
    if not from_number:
        return {
            "success": False,
            "error": "No sender phone number provided. Set TWILIO_PHONE_NUMBER or provide from_number."
        }
    
    try:
        message_obj = client.messages.create(
            body=message,
            from_=from_number,
            to=to
        )
        
        return {
            "success": True,
            "message": f"SMS sent successfully to {to}",
            "sid": message_obj.sid,
            "status": message_obj.status
        }
        
    except TwilioRestException as e:
        return {
            "success": False,
            "error": f"Failed to send SMS: {str(e)}"
        }
    except Exception as e:
        return {
            "success": False,
            "error": f"Unexpected error: {str(e)}"
        }


def send_whatsapp(to: str, message: str, from_number: str = None) -> Dict[str, Any]:
    """
    Send WhatsApp message via Twilio.
    
    Args:
        to: Recipient WhatsApp number (E.164 format with whatsapp: prefix, e.g., whatsapp:+1234567890)
        message: WhatsApp message content
        from_number: Sender WhatsApp number (optional, uses TWILIO_WHATSAPP_NUMBER if not provided)
        
    Returns:
        Dictionary with status and message
    """
    if not client:
        return {
            "success": False,
            "error": "Twilio not configured. Please set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN."
        }
    
    if not from_number:
        from_number = TWILIO_WHATSAPP_NUMBER
        
    if not from_number:
        return {
            "success": False,
            "error": "No sender WhatsApp number provided. Set TWILIO_WHATSAPP_NUMBER or provide from_number."
        }
    
    # Ensure proper WhatsApp format
    if not to.startswith("whatsapp:"):
        to = f"whatsapp:{to}"
    
    try:
        message_obj = client.messages.create(
            body=message,
            from_=from_number,
            to=to
        )
        
        return {
            "success": True,
            "message": f"WhatsApp message sent successfully to {to}",
            "sid": message_obj.sid,
            "status": message_obj.status
        }
        
    except TwilioRestException as e:
        return {
            "success": False,
            "error": f"Failed to send WhatsApp message: {str(e)}"
        }
    except Exception as e:
        return {
            "success": False,
            "error": f"Unexpected error: {str(e)}"
        }


def send_email(to: str, subject: str, body: str, from_email: str = None) -> Dict[str, Any]:
    """
    Send email via Twilio SendGrid.
    
    Args:
        to: Recipient email address
        subject: Email subject
        body: Email body content
        from_email: Sender email address (optional, uses TWILIO_EMAIL_FROM if not provided)
        
    Returns:
        Dictionary with status and message
    """
    try:
        from sendgrid import SendGridAPIClient
        from sendgrid.helpers.mail import Mail
    except ImportError:
        return {
            "success": False,
            "error": "SendGrid not installed. Please install using: pip install sendgrid"
        }
    
    if not from_email:
        from_email = TWILIO_EMAIL_FROM
        
    if not from_email:
        return {
            "success": False,
            "error": "No sender email provided. Set TWILIO_EMAIL_FROM or provide from_email."
        }
    
    sendgrid_api_key = os.getenv("SENDGRID_API_KEY")
    if not sendgrid_api_key:
        return {
            "success": False,
            "error": "SendGrid API key not configured. Please set SENDGRID_API_KEY."
        }
    
    try:
        message = Mail(
            from_email=from_email,
            to_emails=to,
            subject=subject,
            html_content=body
        )
        
        sg = SendGridAPIClient(api_key=sendgrid_api_key)
        response = sg.send(message)
        
        return {
            "success": True,
            "message": f"Email sent successfully to {to}",
            "status_code": response.status_code
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": f"Failed to send email: {str(e)}"
        }


def get_message_status(message_sid: str) -> Dict[str, Any]:
    """
    Get status of a sent message.
    
    Args:
        message_sid: Twilio message SID
        
    Returns:
        Dictionary with message details
    """
    if not client:
        return {
            "success": False,
            "error": "Twilio not configured. Please set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN."
        }
    
    try:
        message = client.messages(message_sid).fetch()
        
        return {
            "success": True,
            "sid": message.sid,
            "status": message.status,
            "to": message.to,
            "from": message.from_,
            "body": message.body,
            "date_sent": str(message.date_sent),
            "error_code": message.error_code,
            "error_message": message.error_message
        }
        
    except TwilioRestException as e:
        return {
            "success": False,
            "error": f"Failed to get message status: {str(e)}"
        }
    except Exception as e:
        return {
            "success": False,
            "error": f"Unexpected error: {str(e)}"
        }


# Convenience functions for simple usage
def send_simple_sms(to: str, message: str) -> Dict[str, Any]:
    """Simple SMS sending function."""
    return send_sms(to, message)


def send_simple_whatsapp(to: str, message: str) -> Dict[str, Any]:
    """Simple WhatsApp sending function."""
    return send_whatsapp(to, message)


def send_simple_email(to: str, subject: str, body: str) -> Dict[str, Any]:
    """Simple email sending function."""
    return send_email(to, subject, body)