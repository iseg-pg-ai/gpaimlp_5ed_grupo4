"""Integração ETL com fontes sintéticas e publicação com rollback."""
import json
import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path
from unittest.mock import patch

from pypdf import PdfWriter
from etl.pipeline import run
from scripts.create_ci_etl_fixture import create


class EtlIntegrationTest(unittest.TestCase):
    def test_workbook_and_pdf_publish_consistent_read_only_sources(self):
        with tempfile.TemporaryDirectory(prefix="blu-etl-test-") as directory:
            root = Path(directory)
            source, output = root / "data", root / "warehouse"
            workbook = create(source)
            pdf = source / "proposal.pdf"
            writer = PdfWriter()
            writer.add_blank_page(width=595, height=842)
            writer.write(pdf)
            before = {path.name: path.read_bytes() for path in (workbook, pdf)}
            manifest = run(source, output)
            self.assertEqual(manifest["validation"]["status"], "passed")
            self.assertEqual(manifest["source"]["type"], "local")
            self.assertEqual(manifest["pdfs_discovered"], 1)
            self.assertEqual(manifest["pdf_errors"], [])
            self.assertEqual(manifest["tables"]["proposal_documents"], 1)
            self.assertGreater(manifest["tables"]["atracoes"], 0)
            self.assertGreater(manifest["tables"]["restaurantes"], 0)
            self.assertGreater(manifest["tables"]["curation_rules"], 0)
            self.assertEqual(json.loads((output / "manifest.json").read_text())["tables"], manifest["tables"])
            self.assertEqual({path.name: path.read_bytes() for path in (workbook, pdf)}, before)
            with closing(sqlite3.connect(output / "blu_etl.sqlite")) as connection:
                self.assertEqual(connection.execute("SELECT COUNT(*) FROM proposal_pages").fetchone()[0], 1)
                count = sum(manifest["tables"][name] for name in ("atracoes", "restaurantes", "experiencias"))
                for table, expected in (
                    ("model_observatory_catalog", count),
                    ("model_observatory_prices", manifest["tables"]["precos"]),
                    ("model_field_evidence", count * 7 + manifest["tables"]["precos"]),
                ):
                    with self.subTest(table=table):
                        self.assertEqual(connection.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0], expected)


def windows_error(code):
    error = PermissionError("Bloqueio simulado da publicação")
    error.winerror = code
    return error


class EtlPublicationTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.source = self.root / "source"
        self.source.mkdir()
        self.target = self.root / "warehouse"
        self.target.mkdir()
        (self.target / "snapshot.txt").write_text("anterior", encoding="utf-8")
        self.native_rename = Path.rename

    def build(self, source, stage):
        (stage / "snapshot.txt").write_text("novo", encoding="utf-8")
        return {"validation": {"status": "passed"}}

    def execute(self, rename, platform="win32"):
        with patch("etl.pipeline._build", side_effect=self.build) as build, patch.object(
            Path, "rename", rename
        ), patch("sys.platform", platform), patch("time.sleep") as sleep:
            result = run(self.source, self.target)
        return result, build, sleep

    def assert_previous_preserved(self):
        self.assertEqual((self.target / "snapshot.txt").read_text(encoding="utf-8"), "anterior")
        self.assertEqual(list(self.root.glob(".warehouse-*")), [])

    def test_nested_output_rejected(self):
        for target in (self.source, self.source / "warehouse", self.root):
            with self.assertRaisesRegex(ValueError, "separate"):
                run(self.source, target)

    def test_transient_publication_error_retries_without_rebuilding(self):
        attempts = []

        def rename(source, target):
            if "-staging-" in source.name:
                attempts.append(source)
                if len(attempts) == 1:
                    raise windows_error(5)
            return self.native_rename(source, target)

        result, build, sleep = self.execute(rename)
        self.assertEqual(result["validation"]["status"], "passed")
        self.assertEqual((self.target / "snapshot.txt").read_text(encoding="utf-8"), "novo")
        self.assertEqual(len(attempts), 2)
        build.assert_called_once()
        sleep.assert_called_once_with(0.05)
        self.assertEqual(list(self.root.glob(".warehouse-*")), [])

    def test_transient_backup_error_preserves_previous_until_swap(self):
        attempts = []

        def rename(source, target):
            if source == self.target:
                attempts.append(source)
                if len(attempts) == 1:
                    raise windows_error(32)
            return self.native_rename(source, target)

        _, build, sleep = self.execute(rename)
        self.assertEqual(len(attempts), 2)
        self.assertEqual((self.target / "snapshot.txt").read_text(encoding="utf-8"), "novo")
        build.assert_called_once()
        sleep.assert_called_once_with(0.05)

    def test_persistent_publication_error_restores_previous_and_propagates(self):
        attempts = []

        def rename(source, target):
            if "-staging-" in source.name:
                attempts.append(source)
                raise windows_error(5)
            return self.native_rename(source, target)

        with patch("etl.pipeline._build", side_effect=self.build) as build, patch.object(
            Path, "rename", rename
        ), patch("sys.platform", "win32"), patch("time.sleep") as sleep:
            with self.assertRaises(PermissionError):
                run(self.source, self.target)
        self.assertEqual(len(attempts), 6)
        self.assertEqual([call.args[0] for call in sleep.call_args_list], [0.05, 0.1, 0.2, 0.4, 0.8])
        build.assert_called_once()
        self.assert_previous_preserved()

    def test_transient_error_during_rollback_retries_restoration(self):
        restorations = []

        def rename(source, target):
            if "-staging-" in source.name:
                raise windows_error(5)
            if "-backup-" in source.name:
                restorations.append(source)
                if len(restorations) == 1:
                    raise windows_error(33)
            return self.native_rename(source, target)

        with self.assertRaises(PermissionError):
            self.execute(rename)
        self.assertEqual(len(restorations), 2)
        self.assert_previous_preserved()

    def test_other_windows_error_does_not_retry(self):
        self.assert_not_retried("win32", 3)

    def test_other_platform_does_not_retry(self):
        self.assert_not_retried("linux", 5)

    def assert_not_retried(self, platform, code):
        attempts = []

        def rename(source, target):
            if "-staging-" in source.name:
                attempts.append(source)
                raise windows_error(code)
            return self.native_rename(source, target)

        with patch("etl.pipeline._build", side_effect=self.build), patch.object(
            Path, "rename", rename
        ), patch("sys.platform", platform), patch("time.sleep") as sleep:
            with self.assertRaises(PermissionError):
                run(self.source, self.target)
        self.assertEqual(len(attempts), 1)
        sleep.assert_not_called()
        self.assert_previous_preserved()

    def test_build_failure_never_replaces_previous_snapshot(self):
        def failing_build(source, stage):
            (stage / "partial.txt").write_text("incompleto", encoding="utf-8")
            raise ValueError("Validação recusada")

        with patch("etl.pipeline._build", side_effect=failing_build), patch.object(
            Path, "rename"
        ) as rename:
            with self.assertRaisesRegex(ValueError, "Validação recusada"):
                run(self.source, self.target)
        rename.assert_not_called()
        self.assert_previous_preserved()


if __name__ == "__main__":
    unittest.main()
