import os
import aiosmtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional
from urllib.parse import quote_plus

from ..utils.log import logger

# Email configuration
SMTP_HOST = os.getenv("SMTP_HOST")
SMTP_PORT = int(os.getenv("SMTP_PORT", 587))
SMTP_USER = os.getenv("SMTP_USER")
SMTP_PASS = os.getenv("SMTP_PASS")
SMTP_SECURE = os.getenv("SMTP_SECURE", "false").lower() == "true"

# Client URL for verification links
CLIENT_URL = os.getenv("CLIENT_URL", "http://localhost:5173")


async def send_email(
    to: str, subject: str, html_content: str, text_content: Optional[str] = None
):
    """Send an email using SMTP"""
    logger.info(f"[EMAIL] Attempting to send email to: {to}, subject: {subject}")

    if not SMTP_HOST:
        logger.warning("[EMAIL] SMTP not configured, skipping email send")
        return

    try:
        logger.debug(f"[EMAIL] Creating email message for: {to}")
        # Create message
        message = MIMEMultipart("alternative")
        message["Subject"] = subject
        message["From"] = SMTP_USER
        message["To"] = to

        # Add text part if provided
        if text_content:
            logger.debug("[EMAIL] Adding text content to email")
            text_part = MIMEText(text_content, "plain")
            message.attach(text_part)

        # Add HTML part
        logger.debug("[EMAIL] Adding HTML content to email")
        html_part = MIMEText(html_content, "html")
        message.attach(html_part)

        # Configure SMTP
        smtp_kwargs = {
            "hostname": SMTP_HOST,
            "port": SMTP_PORT,
        }

        # Gmail specific configuration
        is_gmail = "gmail.com" in (SMTP_USER or "") or SMTP_HOST == "smtp.gmail.com"
        if is_gmail:
            logger.debug("[EMAIL] Configuring for Gmail SMTP")
            smtp_kwargs.update(
                {
                    "port": int(os.getenv("SMTP_PORT", 465)),
                    "use_tls": True,
                    "start_tls": False,  # For port 465, use SSL not STARTTLS
                }
            )
        else:
            logger.debug("[EMAIL] Configuring for standard SMTP")
            smtp_kwargs["use_tls"] = SMTP_SECURE

        # Add authentication if configured
        if SMTP_USER and SMTP_PASS:
            logger.debug(f"[EMAIL] Using authentication with user: {SMTP_USER}")
            smtp_kwargs.update({"username": SMTP_USER, "password": SMTP_PASS})
        else:
            logger.debug("[EMAIL] No authentication configured")

        # Send email
        logger.debug(f"[EMAIL] Sending email via SMTP: {SMTP_HOST}:{SMTP_PORT}")
        await aiosmtplib.send(message, **smtp_kwargs)
        logger.info(f"[EMAIL] Email sent successfully to {to}")

    except Exception as e:
        logger.error(f"[EMAIL] Failed to send email to {to}: {e}")
        raise


async def send_registration_email(
    to: str, role: str, verify_token: Optional[str] = None
):
    """Send a registration/verification email"""
    logger.info(f"[EMAIL] Sending registration email to: {to}, role: {role}")

    if not SMTP_HOST:
        logger.warning("[EMAIL] SMTP not configured, skipping registration email")
        return  # Skip if not configured

    try:
        verification_link = None
        if verify_token:
            verification_link = f"{CLIENT_URL}/verify?token={quote_plus(verify_token)}"
            logger.debug(f"[EMAIL] Generated verification link: {verification_link}")

        # Create HTML content
        logger.debug("[EMAIL] Creating registration email HTML content")
        html_content = f"""
        <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.5;font-size:15px;color:#222;">
            <h2 style="margin:0 0 16px;">Welcome{' ' + role.capitalize() if role else ''}!</h2>
            <p>Thank you for registering as a <strong>{role}</strong> on the H8 GIA Platform.</p>
        """

        if verify_token:
            html_content += f"""
            <p>Please verify your email to activate your account.</p>
            <p style="background:#f5f5f5;padding:12px 16px;border-radius:6px;font-size:14px;letter-spacing:1px;text-align:center;">
                <strong>Verification Code:</strong><br>
                <span style="font-size:18px;">{verify_token}</span>
            </p>
            <p>You can either paste the code above in the app's verification screen, or click the link below:</p>
            <p>
                <a href="{verification_link}" 
                   style="background:#1976d2;color:#fff;padding:10px 18px;border-radius:4px;text-decoration:none;display:inline-block;">
                   Verify Email
                </a>
            </p>
            <p style="font-size:12px;color:#666;">
                If the button does not work, open this URL manually:<br>
                {verification_link}
            </p>
            """

        html_content += """
            <p>Welcome to our Intelligent Automation Platform!</p>
            <hr style="border:none;border-top:1px solid #ddd;margin:20px 0;">
            <p style="font-size:12px;color:#666;">
                This is an automated message. Please do not reply to this email.
            </p>
        </div>
        """

        # Create text content
        text_content = f"""
Welcome{' ' + role.capitalize() if role else ''}!

Thank you for registering as a {role} on the GIA Platform.
        """

        if verify_token:
            text_content += f"""

Please verify your email to activate your account.

Verification Code: {verify_token}

Verification Link: {verification_link}
            """

        text_content += """

Welcome to our healthcare consultation platform!

This is an automated message. Please do not reply to this email.
        """

        subject = f"Welcome to GIA - {role.capitalize()} Registration"
        if verify_token:
            subject += " (Email Verification Required)"

        await send_email(to, subject, html_content, text_content)

    except Exception as e:
        logger.error(f"Failed to send registration email to {to}: {e}")
        # Don't raise - registration should succeed even if email fails


async def send_invitation_email(
    to: str, verify_token: str, invited_by_user: dict = None
):
    """Send an invitation email with verification token"""
    logger.info(f"[EMAIL] Sending invitation email to: {to}")

    if not SMTP_HOST:
        logger.warning("[EMAIL] SMTP not configured, skipping invitation email")
        return  # Skip if not configured

    try:
        verification_link = f"{CLIENT_URL}/verify?token={quote_plus(verify_token)}"
        logger.debug(f"[EMAIL] Generated verification link: {verification_link}")

        inviter_name = "the team"
        if invited_by_user:
            inviter_name = invited_by_user.get("name") or invited_by_user.get("firstName", "a team member")

        # Create HTML content
        logger.debug("[EMAIL] Creating invitation email HTML content")
        html_content = f"""
        <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.5;font-size:15px;color:#222;">
            <h2 style="margin:0 0 16px;">You're Invited to Join GIA!</h2>
            <p>Hello!</p>
            <p>You have been invited by <strong>{inviter_name}</strong> to join the GIA Platform.</p>
            <p>To complete your account setup and start using the platform, please verify your email address by clicking the button below:</p>
            <p>
                <a href="{verification_link}" 
                   style="background:#1976d2;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;font-weight:bold;">
                   Verify Email & Activate Account
                </a>
            </p>
            <p style="background:#f5f5f5;padding:12px 16px;border-radius:6px;font-size:14px;letter-spacing:1px;text-align:center;">
                <strong>Or use this verification code:</strong><br>
                <span style="font-size:18px;font-family:monospace;">{verify_token}</span>
            </p>
            <p style="font-size:12px;color:#666;">
                If the button doesn't work, you can copy and paste this URL into your browser:<br>
                <span style="word-break:break-all;">{verification_link}</span>
            </p>
            <p><strong>Note:</strong> Your account will remain inactive until you verify your email address.</p>
            <hr style="border:none;border-top:1px solid #ddd;margin:20px 0;">
            <p style="font-size:12px;color:#666;">
                This invitation was sent by {inviter_name}. If you believe you received this email in error, please ignore it.<br>
                This is an automated message. Please do not reply to this email.
            </p>
        </div>
        """

        # Create text content
        text_content = f"""
You're Invited to Join GIA!

Hello!

You have been invited by {inviter_name} to join the GIA Platform.

To complete your account setup and start using the platform, please verify your email address.

Verification Code: {verify_token}

Verification Link: {verification_link}

Note: Your account will remain inactive until you verify your email address.

This invitation was sent by {inviter_name}. If you believe you received this email in error, please ignore it.
This is an automated message. Please do not reply to this email.
        """

        subject = "You're Invited to Join GIA - Email Verification Required"

        await send_email(to, subject, html_content, text_content)

    except Exception as e:
        logger.error(f"Failed to send invitation email to {to}: {e}")
        # Don't raise - invitation should succeed even if email fails
