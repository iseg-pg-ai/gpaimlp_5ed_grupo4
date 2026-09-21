"""Runtime configuration for the Google Forms spreadsheet connection."""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class FormsIngestionSettings(BaseSettings):
    """Settings are loaded on every invocation; no response data is retained."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    blu_google_sheet_id: str = ""
    blu_google_sheet_range: str = "Form Responses 1"
    blu_google_service_account_file: Path = Path("service_account.json")

    @property
    def sheet_id(self) -> str:
        return self.blu_google_sheet_id

    @property
    def sheet_range(self) -> str:
        return self.blu_google_sheet_range

    @property
    def service_account_path(self) -> Path:
        return self.blu_google_service_account_file


def get_settings() -> FormsIngestionSettings:
    """Build a fresh settings object so changing environment configuration is honoured."""
    return FormsIngestionSettings()
