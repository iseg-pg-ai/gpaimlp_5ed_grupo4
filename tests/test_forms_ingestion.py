from unittest.mock import patch

from services.forms_ingestion_service.google_sheets_client import GoogleSheetsClient
from services.forms_ingestion_service.ingestion_controller import get_form_responses


def test_to_dict_handles_missing_columns_and_blank_rows():
    assert GoogleSheetsClient.to_dict(["Email", "Pace"], [["a@blu.test"], ["", ""]]) == [
        {"Email": "a@blu.test", "Pace": None}
    ]


@patch("services.forms_ingestion_service.ingestion_controller.process_form_responses")
@patch("services.forms_ingestion_service.ingestion_controller.GoogleSheetsClient")
def test_get_form_responses_reads_and_processes_on_every_call(client_class, process):
    client = client_class.return_value
    client.read_sheet.return_value = [["Email", "Interest"], ["a@blu.test", "Food"]]
    client.to_dict.return_value = [{"Email": "a@blu.test", "Interest": "Food"}]

    assert get_form_responses() == [{"Email": "a@blu.test", "Interest": "Food"}]
    assert get_form_responses() == [{"Email": "a@blu.test", "Interest": "Food"}]
    assert client.read_sheet.call_count == 2
    assert process.call_count == 2
