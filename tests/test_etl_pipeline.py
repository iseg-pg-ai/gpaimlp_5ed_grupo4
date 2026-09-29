import json
import sqlite3
import unittest
import tempfile
from contextlib import closing
from pathlib import Path

from etl.pipeline import run


class FullLocalEtlTest(unittest.TestCase):
    """Integration check for the complete workbook and PDF ingestion flow."""

    def test_covers_every_pdf_and_sheet(self):
        # Isolated output: running tests never overwrites the operational warehouse.
        tools = Path(".tools")
        tools.mkdir(exist_ok=True)
        temporary = tempfile.TemporaryDirectory(dir=tools)
        self.addCleanup(temporary.cleanup)
        output = Path(temporary.name) / "warehouse"
        manifest = run(Path("data"), output)

        # Confirm source coverage and the two key workbook structures.
        self.assertEqual(manifest["source"]["type"], "local")
        self.assertEqual(manifest["pdfs_discovered"], 50)
        self.assertEqual(manifest["tables"]["proposal_documents"] + len(manifest["pdf_errors"]), 50)
        self.assertGreater(manifest["tables"]["atracoes"], 0)
        self.assertGreater(manifest["tables"]["restaurantes"], 0)
        self.assertEqual(manifest["tables"]["curation_rules"], 51)
        # Confirm both delivery formats contain the reported results.
        self.assertEqual(json.loads((output / "manifest.json").read_text(encoding="utf-8"))["tables"], manifest["tables"])
        with closing(sqlite3.connect(output / "blu_etl.sqlite")) as connection:
            self.assertGreater(connection.execute("SELECT COUNT(*) FROM proposal_pages").fetchone()[0], 0)
