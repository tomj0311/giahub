import json
from typing import Optional, List, Any, Dict

from ai.tools import Toolkit
from ai.utils.log import logger

from .google_auth import build_service

SHEETS_SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
]


class SheetsTools(Toolkit):
    """Toolkit for Google Sheets operations."""

    def __init__(
        self,
        credentials_file: Optional[str] = None,
        subject: Optional[str] = None,
    ):
        super().__init__(name="sheets")
        self.credentials_file = credentials_file
        self.subject = subject

        self.register(self.read_values)
        self.register(self.update_values)
        self.register(self.append_values)

    def _service(self):
        return build_service(
            "sheets",
            "v4",
            SHEETS_SCOPES,
            credentials_file=self.credentials_file,
            subject=self.subject,
        )

    def read_values(self, spreadsheet_id: str, range_a1: str) -> str:
        try:
            service = self._service()
            result = service.spreadsheets().values().get(spreadsheetId=spreadsheet_id, range=range_a1).execute()
            return json.dumps(result)
        except Exception as e:
            logger.error(f"Sheets read_values error: {e}")
            return json.dumps({"error": str(e)})

    def update_values(self, spreadsheet_id: str, range_a1: str, values: List[List[Any]], value_input_option: str = "RAW") -> str:
        try:
            service = self._service()
            body: Dict[str, Any] = {"range": range_a1, "majorDimension": "ROWS", "values": values}
            result = (
                service.spreadsheets()
                .values()
                .update(spreadsheetId=spreadsheet_id, range=range_a1, valueInputOption=value_input_option, body=body)
                .execute()
            )
            return json.dumps(result)
        except Exception as e:
            logger.error(f"Sheets update_values error: {e}")
            return json.dumps({"error": str(e)})

    def append_values(self, spreadsheet_id: str, range_a1: str, values: List[List[Any]], value_input_option: str = "RAW") -> str:
        try:
            service = self._service()
            body = {"values": values}
            result = (
                service.spreadsheets()
                .values()
                .append(spreadsheetId=spreadsheet_id, range=range_a1, valueInputOption=value_input_option, body=body)
                .execute()
            )
            return json.dumps(result)
        except Exception as e:
            logger.error(f"Sheets append_values error: {e}")
            return json.dumps({"error": str(e)})
