"""A instalação e a confirmação web não podem ser confundidas com a sessão SSH."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from scripts import install_code_editor_links as installer
from scripts import open_dashboards


class CodeEditorLinksTest(unittest.TestCase):
    def test_discovers_both_editors_and_the_web_extension_directory(self):
        with patch.object(installer.shutil, "which", side_effect=lambda name: f"/bin/{name}"), patch.object(Path, "home", return_value=Path("/workspace")):
            targets = dict(installer.editor_targets())
        self.assertEqual(set(targets), {"SageMaker web", "VS Code SSH"})
        self.assertIn("/workspace/sagemaker-code-editor-server-data/extensions", targets["SageMaker web"])
        self.assertEqual(targets["VS Code SSH"], ["/bin/code"])

    def test_an_active_ssh_session_is_not_a_web_session(self):
        with tempfile.TemporaryDirectory() as directory:
            bridge = Path(directory)
            (bridge / "session.json").write_text(json.dumps({"uiKind": 1}))
            with patch.object(open_dashboards, "BRIDGE", bridge), patch.dict(open_dashboards.os.environ, {"SAGEMAKER_APP_TYPE": "CodeEditor"}):
                self.assertFalse(open_dashboards.request_editor(timeout=0))
            self.assertFalse((bridge / "request.json").exists())

    def test_request_explicitly_targets_the_web_editor(self):
        with tempfile.TemporaryDirectory() as directory:
            bridge = Path(directory)
            (bridge / "session-2.json").write_text(json.dumps({"uiKind": 2}))
            with patch.object(open_dashboards, "BRIDGE", bridge), patch.dict(open_dashboards.os.environ, {"SAGEMAKER_APP_TYPE": "CodeEditor"}):
                self.assertFalse(open_dashboards.request_editor(timeout=0))
            self.assertEqual(json.loads((bridge / "request.json").read_text())["uiKind"], 2)

    def test_no_web_confirmation_has_a_distinct_deferred_exit_status(self):
        with patch.object(open_dashboards, "request_editor", return_value=False), \
                patch.object(open_dashboards, "urls", return_value=[]), \
                patch.dict(open_dashboards.os.environ, {"SAGEMAKER_APP_TYPE": "CodeEditor"}), \
                patch.object(open_dashboards, "print", create=True), \
                patch.object(open_dashboards.argparse.ArgumentParser, "parse_args", return_value=type("Args", (), {"print_only": False, "quiet": True})()):
            self.assertEqual(open_dashboards.main(), 3)


if __name__ == "__main__":
    unittest.main()
