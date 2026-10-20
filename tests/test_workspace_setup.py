"""Contratos de preparação de um ambiente independente."""
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from scripts import setup_workspace as setup


class WorkspaceSetupTest(unittest.TestCase):
    def test_selects_node_and_npm_from_same_supported_installation(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            binary = home / ".nvm/versions/node/v24.0.0/bin/node"
            binary.parent.mkdir(parents=True)
            binary.write_text("#!/bin/sh\necho v24.0.0\n")
            binary.chmod(0o755)
            with patch.object(Path, "home", return_value=home), patch.dict(os.environ, {"PATH": "/usr/bin"}):
                setup.activate_node()
                self.assertEqual(os.environ["PATH"].split(os.pathsep)[0], str(binary.parent))

    def test_access_is_created_once_without_overwriting_existing_accounts(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            credentials = root / "monitoring/runtime/credentials.json"
            with patch.object(setup, "ROOT", root), patch.object(setup.subprocess, "run") as run:
                self.assertTrue(setup.ensure_monitoring_access())
                self.assertEqual(run.call_args.kwargs["cwd"], root)
                credentials.parent.mkdir(parents=True)
                credentials.write_text("contas existentes")
                run.reset_mock()
                self.assertFalse(setup.ensure_monitoring_access())
                run.assert_not_called()
                self.assertEqual(credentials.read_text(), "contas existentes")
