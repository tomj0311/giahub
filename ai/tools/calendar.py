import json
from typing import Optional, Dict, Any

from ai.tools import Toolkit
from ai.utils.log import logger

from .google_auth import build_service

CAL_SCOPES = [
    "https://www.googleapis.com/auth/calendar",
]


class CalendarTools(Toolkit):
    """Toolkit for Google Calendar operations."""

    def __init__(
        self,
        credentials_file: Optional[str] = None,
        subject: Optional[str] = None,
        calendar_id: str = "primary",
    ):
        super().__init__(name="calendar")
        self.credentials_file = credentials_file
        self.subject = subject
        self.calendar_id = calendar_id

        self.register(self.list_events)
        self.register(self.create_event)
        self.register(self.get_event)

    def _service(self):
        return build_service(
            "calendar",
            "v3",
            CAL_SCOPES,
            credentials_file=self.credentials_file,
            subject=self.subject,
        )

    def list_events(self, time_min: Optional[str] = None, time_max: Optional[str] = None, max_results: int = 10, single_events: bool = True, order_by: str = "startTime") -> str:
        try:
            service = self._service()
            events = (
                service.events()
                .list(
                    calendarId=self.calendar_id,
                    timeMin=time_min,
                    timeMax=time_max,
                    maxResults=max_results,
                    singleEvents=single_events,
                    orderBy=order_by,
                )
                .execute()
            )
            return json.dumps(events)
        except Exception as e:
            logger.error(f"Calendar list_events error: {e}")
            return json.dumps({"error": str(e)})

    def create_event(self, summary: str, start_iso: str, end_iso: str, timezone: str = "UTC", description: Optional[str] = None, location: Optional[str] = None) -> str:
        try:
            service = self._service()
            body: Dict[str, Any] = {
                "summary": summary,
                "start": {"dateTime": start_iso, "timeZone": timezone},
                "end": {"dateTime": end_iso, "timeZone": timezone},
            }
            if description:
                body["description"] = description
            if location:
                body["location"] = location
            event = service.events().insert(calendarId=self.calendar_id, body=body).execute()
            return json.dumps(event)
        except Exception as e:
            logger.error(f"Calendar create_event error: {e}")
            return json.dumps({"error": str(e)})

    def get_event(self, event_id: str) -> str:
        try:
            service = self._service()
            event = service.events().get(calendarId=self.calendar_id, eventId=event_id).execute()
            return json.dumps(event)
        except Exception as e:
            logger.error(f"Calendar get_event error: {e}")
            return json.dumps({"error": str(e)})
