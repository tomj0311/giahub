"""
Gmail Module for Dynamic Function Execution System.
This module provides functions to read and send emails using Gmail API with OAuth tokens.

The user parameter should contain:
- googleAccessToken: Google OAuth access token
- googleTokenType: Token type (usually 'Bearer')
"""

import base64
import json
from typing import Dict, List, Any, Optional
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders
import httpx


def _get_access_token(user: Dict[str, Any]) -> str:
    """
    Extract Google access token from user object.
    
    Args:
        user: User dictionary containing googleAccessToken
        
    Returns:
        Access token string
        
    Raises:
        ValueError: If access token is not found
    """
    token = user.get('googleAccessToken')
    if not token:
        raise ValueError("Google access token not found in user object. User must authenticate with Google OAuth.")
    return token


def _get_auth_headers(user: Dict[str, Any]) -> Dict[str, str]:
    """
    Get authorization headers for Gmail API requests.
    
    Args:
        user: User dictionary containing token information
        
    Returns:
        Dictionary with authorization headers
    """
    token = _get_access_token(user)
    token_type = user.get('googleTokenType', 'Bearer')
    return {
        'Authorization': f'{token_type} {token}',
        'Content-Type': 'application/json'
    }


async def list_messages(
    user: Dict[str, Any],
    max_results: int = 10,
    query: Optional[str] = None,
    label_ids: Optional[List[str]] = None
) -> Dict[str, Any]:
    """
    List email messages from Gmail inbox.
    
    Args:
        user: User dictionary containing Google access token
        max_results: Maximum number of messages to return (default: 10, max: 500)
        query: Gmail search query (e.g., 'is:unread', 'from:example@gmail.com')
        label_ids: List of label IDs to filter by (e.g., ['INBOX', 'UNREAD'])
        
    Returns:
        Dictionary containing:
        - messages: List of message objects with id and threadId
        - resultSizeEstimate: Estimated total results
        - nextPageToken: Token for pagination (if applicable)
        
    Example:
        messages = await list_messages(user, max_results=5, query='is:unread')
    """
    headers = _get_auth_headers(user)
    
    # Build query parameters
    params = {
        'maxResults': min(max_results, 500)
    }
    
    if query:
        params['q'] = query
    
    if label_ids:
        params['labelIds'] = label_ids
    
    async with httpx.AsyncClient() as client:
        response = await client.get(
            'https://gmail.googleapis.com/gmail/v1/users/me/messages',
            headers=headers,
            params=params
        )
        response.raise_for_status()
        return response.json()


async def get_message(
    user: Dict[str, Any],
    message_id: str,
    format: str = 'full'
) -> Dict[str, Any]:
    """
    Get a specific email message by ID.
    
    Args:
        user: User dictionary containing Google access token
        message_id: The ID of the message to retrieve
        format: Format of the message ('minimal', 'full', 'raw', 'metadata')
        
    Returns:
        Dictionary containing full message details including:
        - id: Message ID
        - threadId: Thread ID
        - labelIds: List of label IDs
        - snippet: Short message preview
        - payload: Message content and headers
        - internalDate: Internal message creation timestamp
        
    Example:
        message = await get_message(user, 'msg_12345')
    """
    headers = _get_auth_headers(user)
    
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f'https://gmail.googleapis.com/gmail/v1/users/me/messages/{message_id}',
            headers=headers,
            params={'format': format}
        )
        response.raise_for_status()
        return response.json()


async def read_message(
    user: Dict[str, Any],
    message_id: str
) -> Dict[str, Any]:
    """
    Read and parse an email message with formatted output.
    
    Args:
        user: User dictionary containing Google access token
        message_id: The ID of the message to read
        
    Returns:
        Dictionary containing parsed message:
        - id: Message ID
        - threadId: Thread ID
        - from: Sender email
        - to: Recipient email(s)
        - subject: Email subject
        - date: Date sent
        - body: Email body (plain text or HTML)
        - snippet: Preview text
        - labels: List of labels
        
    Example:
        message = await read_message(user, 'msg_12345')
        print(f"From: {message['from']}")
        print(f"Subject: {message['subject']}")
        print(f"Body: {message['body']}")
    """
    message = await get_message(user, message_id, format='full')
    
    # Parse headers
    headers = {}
    if 'payload' in message and 'headers' in message['payload']:
        for header in message['payload']['headers']:
            headers[header['name'].lower()] = header['value']
    
    # Extract body
    body = ''
    if 'payload' in message:
        body = _extract_body(message['payload'])
    
    return {
        'id': message.get('id'),
        'threadId': message.get('threadId'),
        'from': headers.get('from', ''),
        'to': headers.get('to', ''),
        'subject': headers.get('subject', ''),
        'date': headers.get('date', ''),
        'body': body,
        'snippet': message.get('snippet', ''),
        'labels': message.get('labelIds', [])
    }


def _extract_body(payload: Dict[str, Any]) -> str:
    """
    Extract email body from message payload.
    
    Args:
        payload: Message payload from Gmail API
        
    Returns:
        Decoded email body
    """
    if 'body' in payload and 'data' in payload['body']:
        return base64.urlsafe_b64decode(payload['body']['data']).decode('utf-8')
    
    if 'parts' in payload:
        for part in payload['parts']:
            if part.get('mimeType') == 'text/plain':
                if 'data' in part['body']:
                    return base64.urlsafe_b64decode(part['body']['data']).decode('utf-8')
            elif part.get('mimeType') == 'text/html':
                if 'data' in part['body']:
                    return base64.urlsafe_b64decode(part['body']['data']).decode('utf-8')
            elif 'parts' in part:
                # Recursively search nested parts
                result = _extract_body(part)
                if result:
                    return result
    
    return ''


async def send_email(
    user: Dict[str, Any],
    to: str,
    subject: str,
    body: str,
    cc: Optional[str] = None,
    bcc: Optional[str] = None,
    body_type: str = 'plain'
) -> Dict[str, Any]:
    """
    Send an email via Gmail.
    
    Args:
        user: User dictionary containing Google access token
        to: Recipient email address
        subject: Email subject
        body: Email body content
        cc: Carbon copy recipients (optional)
        bcc: Blind carbon copy recipients (optional)
        body_type: 'plain' for plain text or 'html' for HTML content
        
    Returns:
        Dictionary containing:
        - id: Sent message ID
        - threadId: Thread ID
        - labelIds: Labels applied to sent message
        
    Example:
        result = await send_email(
            user,
            to='recipient@example.com',
            subject='Hello',
            body='This is a test email'
        )
        print(f"Email sent! Message ID: {result['id']}")
    """
    headers = _get_auth_headers(user)
    
    # Create message
    if body_type == 'html':
        message = MIMEText(body, 'html')
    else:
        message = MIMEText(body, 'plain')
    
    message['To'] = to
    message['Subject'] = subject
    
    if cc:
        message['Cc'] = cc
    if bcc:
        message['Bcc'] = bcc
    
    # Encode message
    raw_message = base64.urlsafe_b64encode(message.as_bytes()).decode('utf-8')
    
    async with httpx.AsyncClient() as client:
        response = await client.post(
            'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
            headers=headers,
            json={'raw': raw_message}
        )
        response.raise_for_status()
        return response.json()


async def send_email_with_attachment(
    user: Dict[str, Any],
    to: str,
    subject: str,
    body: str,
    attachment_data: bytes,
    attachment_filename: str,
    attachment_mime_type: str = 'application/octet-stream',
    cc: Optional[str] = None,
    bcc: Optional[str] = None
) -> Dict[str, Any]:
    """
    Send an email with an attachment via Gmail.
    
    Args:
        user: User dictionary containing Google access token
        to: Recipient email address
        subject: Email subject
        body: Email body content
        attachment_data: File data as bytes
        attachment_filename: Name of the attachment file
        attachment_mime_type: MIME type of attachment (default: application/octet-stream)
        cc: Carbon copy recipients (optional)
        bcc: Blind carbon copy recipients (optional)
        
    Returns:
        Dictionary containing sent message details
        
    Example:
        with open('document.pdf', 'rb') as f:
            file_data = f.read()
        
        result = await send_email_with_attachment(
            user,
            to='recipient@example.com',
            subject='Document',
            body='Please find attached document.',
            attachment_data=file_data,
            attachment_filename='document.pdf',
            attachment_mime_type='application/pdf'
        )
    """
    headers = _get_auth_headers(user)
    
    # Create multipart message
    message = MIMEMultipart()
    message['To'] = to
    message['Subject'] = subject
    
    if cc:
        message['Cc'] = cc
    if bcc:
        message['Bcc'] = bcc
    
    # Attach body
    message.attach(MIMEText(body, 'plain'))
    
    # Attach file
    part = MIMEBase(*attachment_mime_type.split('/'))
    part.set_payload(attachment_data)
    encoders.encode_base64(part)
    part.add_header('Content-Disposition', f'attachment; filename={attachment_filename}')
    message.attach(part)
    
    # Encode message
    raw_message = base64.urlsafe_b64encode(message.as_bytes()).decode('utf-8')
    
    async with httpx.AsyncClient() as client:
        response = await client.post(
            'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
            headers=headers,
            json={'raw': raw_message}
        )
        response.raise_for_status()
        return response.json()


async def search_emails(
    user: Dict[str, Any],
    query: str,
    max_results: int = 10
) -> List[Dict[str, Any]]:
    """
    Search for emails matching a query and return parsed results.
    
    Args:
        user: User dictionary containing Google access token
        query: Gmail search query (e.g., 'from:example@gmail.com subject:invoice')
        max_results: Maximum number of results to return
        
    Returns:
        List of parsed message dictionaries
        
    Example:
        # Search for unread emails
        unread = await search_emails(user, 'is:unread', max_results=5)
        
        # Search for emails from specific sender
        emails = await search_emails(user, 'from:boss@company.com')
        
        # Search with multiple criteria
        results = await search_emails(user, 'from:client@example.com subject:urgent')
    """
    # Get message list
    messages_response = await list_messages(user, max_results=max_results, query=query)
    
    if 'messages' not in messages_response:
        return []
    
    # Fetch and parse each message
    parsed_messages = []
    for msg in messages_response['messages']:
        try:
            parsed_msg = await read_message(user, msg['id'])
            parsed_messages.append(parsed_msg)
        except Exception as e:
            # Skip messages that fail to parse
            print(f"Error parsing message {msg['id']}: {e}")
            continue
    
    return parsed_messages


async def mark_as_read(
    user: Dict[str, Any],
    message_id: str
) -> Dict[str, Any]:
    """
    Mark a message as read by removing the UNREAD label.
    
    Args:
        user: User dictionary containing Google access token
        message_id: The ID of the message to mark as read
        
    Returns:
        Updated message object
        
    Example:
        result = await mark_as_read(user, 'msg_12345')
    """
    headers = _get_auth_headers(user)
    
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f'https://gmail.googleapis.com/gmail/v1/users/me/messages/{message_id}/modify',
            headers=headers,
            json={'removeLabelIds': ['UNREAD']}
        )
        response.raise_for_status()
        return response.json()


async def mark_as_unread(
    user: Dict[str, Any],
    message_id: str
) -> Dict[str, Any]:
    """
    Mark a message as unread by adding the UNREAD label.
    
    Args:
        user: User dictionary containing Google access token
        message_id: The ID of the message to mark as unread
        
    Returns:
        Updated message object
        
    Example:
        result = await mark_as_unread(user, 'msg_12345')
    """
    headers = _get_auth_headers(user)
    
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f'https://gmail.googleapis.com/gmail/v1/users/me/messages/{message_id}/modify',
            headers=headers,
            json={'addLabelIds': ['UNREAD']}
        )
        response.raise_for_status()
        return response.json()


async def delete_message(
    user: Dict[str, Any],
    message_id: str
) -> bool:
    """
    Delete a message (move to trash).
    
    Args:
        user: User dictionary containing Google access token
        message_id: The ID of the message to delete
        
    Returns:
        True if successful
        
    Example:
        success = await delete_message(user, 'msg_12345')
    """
    headers = _get_auth_headers(user)
    
    async with httpx.AsyncClient() as client:
        response = await client.delete(
            f'https://gmail.googleapis.com/gmail/v1/users/me/messages/{message_id}',
            headers=headers
        )
        response.raise_for_status()
        return True


async def get_labels(user: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Get all labels in the user's mailbox.
    
    Args:
        user: User dictionary containing Google access token
        
    Returns:
        List of label objects containing:
        - id: Label ID
        - name: Label name
        - type: Label type (system or user)
        - messageListVisibility: Visibility in message list
        - labelListVisibility: Visibility in label list
        
    Example:
        labels = await get_labels(user)
        for label in labels:
            print(f"{label['name']}: {label['id']}")
    """
    headers = _get_auth_headers(user)
    
    async with httpx.AsyncClient() as client:
        response = await client.get(
            'https://gmail.googleapis.com/gmail/v1/users/me/labels',
            headers=headers
        )
        response.raise_for_status()
        return response.json().get('labels', [])


async def get_profile(user: Dict[str, Any]) -> Dict[str, Any]:
    """
    Get the Gmail profile information for the authenticated user.
    
    Args:
        user: User dictionary containing Google access token
        
    Returns:
        Dictionary containing:
        - emailAddress: User's email address
        - messagesTotal: Total number of messages
        - threadsTotal: Total number of threads
        - historyId: Current history ID
        
    Example:
        profile = await get_profile(user)
        print(f"Email: {profile['emailAddress']}")
        print(f"Total messages: {profile['messagesTotal']}")
    """
    headers = _get_auth_headers(user)
    
    async with httpx.AsyncClient() as client:
        response = await client.get(
            'https://gmail.googleapis.com/gmail/v1/users/me/profile',
            headers=headers
        )
        response.raise_for_status()
        return response.json()
