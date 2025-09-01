import json
from typing import Optional, Dict, Any, List

from ai.tools import Toolkit
from ai.utils.log import logger

from .google_auth import build_service

# Gmail scopes
GMAIL_SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
]


class GmailTools(Toolkit):
    """Toolkit for basic Gmail operations.

    Auth: Uses ADC or service account creds via google_auth helpers.
    """

    def __init__(
        self,
        credentials_file: Optional[str] = None,
        subject: Optional[str] = None,
        user_id: str = "me",
        max_results: int = 10,
        include_spam_trash: bool = False,
    ):
        super().__init__(name="gmail")
        self.credentials_file = credentials_file
        self.subject = subject
        self.user_id = user_id
        self.max_results = max_results
        self.include_spam_trash = include_spam_trash

        self.register(self.list_messages)
        self.register(self.get_message)
        self.register(self.send_message_raw)

    def _service(self):
        return build_service(
            "gmail",
            "v1",
            GMAIL_SCOPES,
            credentials_file=self.credentials_file,
            subject=self.subject,
        )

    def list_messages(self, query: str = "", max_results: Optional[int] = None) -> str:
        """List message IDs matching query.

        Args:
            query: Gmail search query (e.g., from:me subject:Report).
            max_results: override the default limit.
        """
        try:
            service = self._service()
            logger.info("Listing Gmail messages")
            resp = (
                service.users()
                .messages()
                .list(
                    userId=self.user_id,
                    q=query or None,
                    maxResults=max_results or self.max_results,
                    includeSpamTrash=self.include_spam_trash,
                )
                .execute()
            )
            return json.dumps(resp)
        except Exception as e:
            logger.error(f"Gmail list_messages error: {e}")
            return json.dumps({"error": str(e)})

    def get_message(self, msg_id: str, format: str = "metadata") -> str:
        """Get a Gmail message by ID.

        format: "full" | "metadata" | "minimal" | "raw"
        """
        try:
            service = self._service()
            resp = (
                service.users()
                .messages()
                .get(userId=self.user_id, id=msg_id, format=format)
                .execute()
            )
            return json.dumps(resp)
        except Exception as e:
            logger.error(f"Gmail get_message error: {e}")
            return json.dumps({"error": str(e)})

    def send_message_raw(self, raw_base64_urlsafe: str) -> str:
        """Send a message using a base64url-encoded RFC 2822 email string.

        Build the raw string yourself and encode with base64.urlsafe_b64encode.
        """
        try:
            service = self._service()
            body = {"raw": raw_base64_urlsafe}
            resp = (
                service.users().messages().send(userId=self.user_id, body=body).execute()
            )
            return json.dumps(resp)
        except Exception as e:
            logger.error(f"Gmail send_message_raw error: {e}")
            return json.dumps({"error": str(e)})
