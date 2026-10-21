"""Publicação ETL: bloqueios transitórios Windows e preservação do rollback."""

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from etl.pipeline import run


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
