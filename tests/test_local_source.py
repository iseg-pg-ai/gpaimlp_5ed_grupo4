import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from openpyxl import Workbook
from etl.sources import LocalSource
from etl.pipeline import run

class LocalSourceTest(unittest.TestCase):
    def setUp(self):
        Path(".tools").mkdir(exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=".tools")
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

    def test_build_failure_preserves_warehouse(self):
        output = self.root / "warehouse"
        output.mkdir()
        (output / "previous.txt").write_text("previous")
        with patch("etl.pipeline._build", side_effect=ValueError("failed")):
            with self.assertRaisesRegex(ValueError, "failed"):
                run(self.source, output)
        self.assertEqual((output / "previous.txt").read_text(), "previous")
        self.assertFalse(list(self.root.glob(".warehouse-staging-*")))

    def test_success_replaces_delivery(self):
        output = self.root / "warehouse"
        output.mkdir()
        (output / "stale.txt").write_text("old")
        def build(source, stage):
            (stage / "new.txt").write_text("new")
            return {"status": "passed"}
        with patch("etl.pipeline._build", side_effect=build):
            run(self.source, output)
        self.assertFalse((output / "stale.txt").exists())
        self.assertEqual((output / "new.txt").read_text(), "new")

    def test_nested_output_rejected(self):
        for target in (self.source, self.source / "warehouse", self.root):
            with self.assertRaisesRegex(ValueError, "separate"):
                run(self.source, target)

    def test_publication_failure_restores_previous_delivery(self):
        output = self.root / "warehouse"
        output.mkdir()
        (output / "previous.txt").write_text("previous")
        original_rename = Path.rename
        def fail_stage(path, target):
            if "-staging-" in path.name:
                raise OSError("publication failed")
            return original_rename(path, target)
        with patch("etl.pipeline._build", return_value={}), patch.object(Path, "rename", fail_stage):
            with self.assertRaisesRegex(OSError, "publication failed"):
                run(self.source, output)
        self.assertEqual((output / "previous.txt").read_text(), "previous")
