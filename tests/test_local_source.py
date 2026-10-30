import tempfile
import unittest
from pathlib import Path
from openpyxl import Workbook
from etl.sources import LocalSource

class LocalSourceTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source = self.root / "data"
        self.source.mkdir()

    def workbook(self, path, names):
        path.parent.mkdir(parents=True, exist_ok=True)
        workbook = Workbook()
        workbook.remove(workbook.active)
        for name in names:
            workbook.create_sheet(name)
        workbook.save(path)
        workbook.close()

    def test_recursive_discovery_and_inventory(self):
        self.workbook(self.source / "catalog/main.xlsx", ["REGRAS_CURADORIA", "ATRACOES"])
        self.workbook(self.source / "other/enriched.xlsx", ["Roteiros", "Atracoes_base", "Precos_propostas"])
        (self.source / "proposal.PDF").write_bytes(b"test")
        main, extra, pdfs, manifest = LocalSource(self.source).discover()
        self.assertEqual(main.name, "main.xlsx")
        self.assertEqual(extra.name, "enriched.xlsx")
        self.assertEqual(len(pdfs), 1)
        self.assertEqual(len(manifest["objects"]), 3)
        self.assertTrue(all(len(item["sha256"]) == 64 for item in manifest["objects"]))

    def test_unknown_workbook_is_not_silently_ignored(self):
        self.workbook(self.source / "unknown.xlsx", ["Unknown"])
        self.workbook(self.source / "main.xlsx", ["REGRAS_CURADORIA", "ATRACOES"])
        *_, manifest = LocalSource(self.source).discover()
        reference = next(item for item in manifest["objects"] if item["key"] == "unknown.xlsx")
        self.assertEqual(reference["role"], "reference_workbook")
