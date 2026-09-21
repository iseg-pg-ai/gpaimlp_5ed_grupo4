"""Orchestration layer: read fresh Google Form data and hand it to BLU ETL."""

from typing import Any

from services.etl_service import process_form_responses
from shared.logging import get_logger

from .config import get_settings
from .google_sheets_client import GoogleSheetsClient, GoogleSheetsError

logger = get_logger(__name__)


def fetch_latest_form_data() -> list[dict[str, Any]]:
    """Fetch all current form responses directly from Google Sheets, without any cache."""
    settings = get_settings()
    client = GoogleSheetsClient(settings.service_account_path)
    values = client.read_sheet(settings.sheet_id, settings.sheet_range)
    if not values:
        logger.info("google_form_refresh_complete rows=0")
        return []
    data = client.to_dict(values[0], values[1:])
    logger.info("google_form_refresh_complete rows=%d", len(data))
    return data


def get_form_responses() -> list[dict[str, Any]]:
    """Refresh the sheet and pass its latest responses to ETL on every call."""
    form_data = fetch_latest_form_data()
    try:
        process_form_responses(form_data)
    except Exception:
        logger.exception("form_responses_etl_failed rows=%d", len(form_data))
        raise
    return form_data


__all__ = ["GoogleSheetsError", "fetch_latest_form_data", "get_form_responses"]
