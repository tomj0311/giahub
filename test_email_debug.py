#!/usr/bin/env python3
"""
Email debugging script to test SMTP configuration and email sending
"""

import asyncio
import os
import sys
from pathlib import Path

# Add the backend directory to the Python path
backend_path = Path(__file__).parent / "backend"
sys.path.insert(0, str(backend_path))

from backend.src.services.email_service import send_email, send_invitation_email
from backend.src.utils.log import logger

async def test_email_configuration():
    """Test email configuration and sending"""
    print("=== Email Configuration Test ===\n")
    
    # Check environment variables
    print("1. Checking environment variables...")
    smtp_host = os.getenv("SMTP_HOST")
    smtp_port = os.getenv("SMTP_PORT", 587)
    smtp_user = os.getenv("SMTP_USER")
    smtp_pass = os.getenv("SMTP_PASS")
    smtp_secure = os.getenv("SMTP_SECURE", "false").lower() == "true"
    client_url = os.getenv("CLIENT_URL", "http://localhost:5173")
    
    print(f"   SMTP_HOST: {smtp_host}")
    print(f"   SMTP_PORT: {smtp_port}")
    print(f"   SMTP_USER: {smtp_user}")
    print(f"   SMTP_PASS: {'*' * len(smtp_pass) if smtp_pass else 'Not set'}")
    print(f"   SMTP_SECURE: {smtp_secure}")
    print(f"   CLIENT_URL: {client_url}")
    
    if not smtp_host:
        print("   ❌ SMTP_HOST not configured!")
        return
    
    if not smtp_user or not smtp_pass:
        print("   ❌ SMTP credentials not configured!")
        return
    
    print("   ✅ Basic configuration looks good")
    
    # Test simple email sending
    print("\n2. Testing simple email sending...")
    test_email = "tom@example.com"  # Replace with your test email
    
    try:
        await send_email(
            to=test_email,
            subject="GiaHUB Email Test",
            html_content="""
            <div style="font-family:Arial,Helvetica,sans-serif;">
                <h2>Email Test</h2>
                <p>This is a test email from GiaHUB platform.</p>
                <p>If you receive this, email configuration is working correctly.</p>
            </div>
            """,
            text_content="Email Test\n\nThis is a test email from GiaHUB platform.\nIf you receive this, email configuration is working correctly."
        )
        print(f"   ✅ Test email sent successfully to {test_email}")
    except Exception as e:
        print(f"   ❌ Failed to send test email: {e}")
        logger.error(f"Email test failed: {e}")
        return
    
    # Test invitation email
    print("\n3. Testing invitation email...")
    verification_token = "test_token_123456789"
    inviter_info = {"name": "Test Admin", "firstName": "Test"}
    
    try:
        await send_invitation_email(
            to=test_email,
            verify_token=verification_token,
            invited_by_user=inviter_info
        )
        print(f"   ✅ Invitation email sent successfully to {test_email}")
    except Exception as e:
        print(f"   ❌ Failed to send invitation email: {e}")
        logger.error(f"Invitation email test failed: {e}")
        return
    
    print("\n=== Email Test Complete ===")
    print("Check your email inbox for the test messages.")

if __name__ == "__main__":
    # Load environment variables from .env file
    try:
        from dotenv import load_dotenv
        load_dotenv("backend/.env")
        print("Loaded environment from backend/.env")
    except ImportError:
        print("python-dotenv not available, using system env vars")
    
    asyncio.run(test_email_configuration())