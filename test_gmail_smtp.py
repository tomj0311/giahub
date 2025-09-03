#!/usr/bin/env python3
"""
Gmail SMTP Test Script

This script helps you test Gmail SMTP configuration.
Make sure you have:
1. Enabled 2-factor authentication on your Gmail account
2. Generated an App Password for this application
3. Updated the .env file with your Gmail credentials
"""

import asyncio
import os
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import aiosmtplib
from dotenv import load_dotenv

async def test_gmail_smtp():
    # Load environment variables
    load_dotenv()
    
    SMTP_HOST = os.getenv('SMTP_HOST')
    SMTP_PORT = int(os.getenv('SMTP_PORT', 465))
    SMTP_USER = os.getenv('SMTP_USER')
    SMTP_PASS = os.getenv('SMTP_PASS')
    
    print("Gmail SMTP Configuration Test")
    print("=" * 40)
    print(f"SMTP Host: {SMTP_HOST}")
    print(f"SMTP Port: {SMTP_PORT}")
    print(f"SMTP User: {SMTP_USER}")
    print(f"SMTP Pass: {'*' * len(SMTP_PASS) if SMTP_PASS else 'Not set'}")
    print()
    
    if not all([SMTP_HOST, SMTP_USER, SMTP_PASS]):
        print("❌ Missing SMTP configuration. Please check your .env file.")
        return False
    
    if SMTP_PASS == "your_16_char_app_password":
        print("❌ Please replace 'your_16_char_app_password' with your actual Gmail App Password")
        print()
        print("To create a Gmail App Password:")
        print("1. Go to https://myaccount.google.com/security")
        print("2. Enable 2-Step Verification if not already enabled")
        print("3. Go to 'App passwords' section")
        print("4. Generate a new app password for 'Mail'")
        print("5. Copy the 16-character password and update your .env file")
        return False
    
    try:
        # Create test message
        message = MIMEMultipart('alternative')
        message['Subject'] = "Gmail SMTP Test - GiaHUB Platform"
        message['From'] = SMTP_USER
        message['To'] = SMTP_USER  # Send to yourself for testing
        
        # Add content
        text_content = "This is a test email from GiaHUB Platform using Gmail SMTP."
        html_content = """
        <html>
          <body>
            <h2>Gmail SMTP Test</h2>
            <p>This is a test email from <strong>GiaHUB Platform</strong> using Gmail SMTP.</p>
            <p>If you receive this email, your Gmail SMTP configuration is working correctly!</p>
          </body>
        </html>
        """
        
        text_part = MIMEText(text_content, 'plain')
        html_part = MIMEText(html_content, 'html')
        message.attach(text_part)
        message.attach(html_part)
        
        # Configure SMTP for Gmail
        smtp_kwargs = {
            'hostname': SMTP_HOST,
            'port': SMTP_PORT,
            'use_tls': True,
            'start_tls': False,  # For port 465, use SSL not STARTTLS
            'username': SMTP_USER,
            'password': SMTP_PASS
        }
        
        print("🔄 Attempting to send test email...")
        await aiosmtplib.send(message, **smtp_kwargs)
        print("✅ Test email sent successfully!")
        print(f"📧 Check your inbox at {SMTP_USER}")
        return True
        
    except Exception as e:
        print(f"❌ Failed to send test email: {e}")
        print()
        print("Common issues:")
        print("1. Wrong App Password - make sure you're using the 16-character app password, not your Gmail password")
        print("2. 2-Factor Authentication not enabled - Gmail requires 2FA for app passwords")
        print("3. Network/firewall issues blocking port 465")
        return False

if __name__ == "__main__":
    asyncio.run(test_gmail_smtp())
