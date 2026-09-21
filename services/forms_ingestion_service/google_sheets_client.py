"""Thin, stateless Google Sheets API client for form-response spreadsheets."""

from __future__ import annotations

from collections.abc import Sequence
from pathlib import Path
from typing import Any

from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from shared.logging import get_logger

logger = get_logger(__name__)
SHEETS_READONLY_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly"


class GoogleSheetsError(RuntimeError):
    """Raised when credentials or the Google Sheets API cannot provide responses."""


class GoogleSheetsClient:
    """A stateless client. A new Sheets API session is made for every read request."""

    def __init__(self, service_account_path: str | Path):
        self.service_account_path = Path(service_account_path)

    def load_credentials(self):
        """Load the service-account key with read-only Sheets permission."""
        if not self.service_account_path.is_file():
            raise GoogleSheetsError(
                f"Google service account file was not found: {self.service_account_path}"
            )
        try:
            return service_account.Credentials.from_service_account_file(
                str(self.service_account_path), scopes=[SHEETS_READONLY_SCOPE]
            )
        except (OSError, ValueError) as exc:
            logger.exception("google_sheets_credentials_failed path=%s", self.service_account_path)
            raise GoogleSheetsError("Could not load Google service-account credentials") from exc

    def read_sheet(self, sheet_id: str, range_name: str) -> list[list[str]]:
        """Read live values from a range. This deliberately never caches results."""
        if not sheet_id:
            raise GoogleSheetsError("BLU_GOOGLE_SHEET_ID must be configured")
        if not range_name:
            raise GoogleSheetsError("BLU_GOOGLE_SHEET_RANGE must be configured")
        try:
            credentials = self.load_credentials()
            # cache_discovery=False avoids a local discovery-document cache too.
            service = build("sheets", "v4", credentials=credentials, cache_discovery=False)
            result = (
                service.spreadsheets()
                .values()
                .get(spreadsheetId=sheet_id, range=range_name)
                .execute()
            )
            values = result.get("values", [])
            logger.info("google_sheet_read sheet_id=%s rows=%d", sheet_id, len(values))
            return values
        except HttpError as exc:
            logger.exception("google_sheet_api_failed sheet_id=%s", sheet_id)
            raise GoogleSheetsError(f"Google Sheets API request failed: {exc.reason}") from exc
        except GoogleSheetsError:
            raise
        except Exception as exc:
            logger.exception("google_sheet_unexpected_failure sheet_id=%s", sheet_id)
            raise GoogleSheetsError("Unexpected failure reading Google Sheet") from exc

    @staticmethod
    def to_dict(headers: Sequence[str], rows: Sequence[Sequence[Any]]) -> list[dict[str, Any]]:
        """Convert variable-width Sheets rows to JSON-ready records using header names."""
        normalized_headers = [str(header).strip() for header in headers]
        if not normalized_headers or not any(normalized_headers):
            raise GoogleSheetsError("The first row of the Google Sheet must contain headers")
        records: list[dict[str, Any]] = []
        for row in rows:
            record = {
                header: row[index] if index < len(row) else None
                for index, header in enumerate(normalized_headers)
                if header
            }
            if any(value not in (None, "") for value in record.values()):
                records.append(record)
        return records
