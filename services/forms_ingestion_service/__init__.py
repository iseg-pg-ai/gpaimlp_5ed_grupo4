"""Live, cache-free Google Forms responses ingestion service."""

from .ingestion_controller import fetch_latest_form_data, get_form_responses

__all__ = ["fetch_latest_form_data", "get_form_responses"]
