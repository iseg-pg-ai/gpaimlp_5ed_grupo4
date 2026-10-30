import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from scripts import studio_urls


class StudioUrlsTest(unittest.TestCase):
    def setUp(self):
        missing = patch.object(studio_urls, "METADATA", Path("/nonexistent-blu-metadata"))
        missing.start()
        self.addCleanup(missing.stop)

    def test_uses_configured_aws_origin_and_never_localhost(self):
        with tempfile.TemporaryDirectory() as directory:
            config = Path(directory) / "studio.json"
            config.write_text(json.dumps({
                "base_url": (
                    "https://workspace.studio.eu-west-1.sagemaker.aws/"
                    "codeeditor/default"
                )
            }))
            with patch.object(studio_urls, "CONFIG", config):
                url = studio_urls.dashboard_url(3001, "/catalog")
        self.assertEqual(
            url,
            "https://workspace.studio.eu-west-1.sagemaker.aws/"
            "codeeditor/default/ports/3001/catalog",
        )
        self.assertNotIn("localhost", url)

    def test_rejects_localhost_as_studio_base(self):
        with tempfile.TemporaryDirectory() as directory:
            config = Path(directory) / "studio.json"
            config.write_text(json.dumps({
                "base_url": "https://localhost/codeeditor/default"
            }))
            with patch.object(studio_urls, "CONFIG", config):
                with self.assertRaisesRegex(ValueError, "URL AWS do Studio"):
                    studio_urls.studio_base()

class CurrentWorkspaceUrlsTest(unittest.TestCase):
    def test_current_space_overrides_a_copied_configuration(self):
        from unittest.mock import Mock
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            metadata = root / "metadata.json"
            metadata.write_text(json.dumps({"AppType": "CodeEditor", "DomainId": "d-current",
                "SpaceName": "current-space", "ResourceArn": "arn:aws:sagemaker:eu-central-1:000000000000:app/current"}))
            config = root / "studio.json"
            config.write_text(json.dumps({"base_url": "https://old.studio.eu-west-1.sagemaker.aws/codeeditor/default"}))
            api = Mock()
            api.describe_space.return_value = {"Url": "https://current.studio.eu-central-1.sagemaker.aws/codeeditor/current"}
            with patch.object(studio_urls, "METADATA", metadata), patch.object(studio_urls, "CONFIG", config), patch("boto3.client", return_value=api):
                self.assertEqual(studio_urls.dashboard_url(3001), "https://current.studio.eu-central-1.sagemaker.aws/codeeditor/current/ports/3001/")
            api.describe_space.assert_called_once_with(DomainId="d-current", SpaceName="current-space")

    def test_failed_discovery_never_opens_an_old_workspace(self):
        with tempfile.TemporaryDirectory() as directory:
            metadata = Path(directory) / "metadata.json"
            metadata.write_text(json.dumps({"AppType": "CodeEditor", "DomainId": "d-current",
                "SpaceName": "current", "ResourceArn": "arn:aws:sagemaker:eu-west-1:000000000000:app/current"}))
            with patch.object(studio_urls, "METADATA", metadata), patch("boto3.client", side_effect=RuntimeError("denied")):
                with self.assertRaisesRegex(ValueError, "não será usado um URL antigo"):
                    studio_urls.studio_base()

    def test_rejects_credentials_ports_and_paths_outside_the_editor(self):
        for raw in ["https://user@a.studio.eu-west-1.sagemaker.aws/codeeditor/default", "https://a.studio.eu-west-1.sagemaker.aws:443/codeeditor/default", "https://a.studio.eu-west-1.sagemaker.aws/codeeditor/default/ports/3001", "https://a.studio.eu-west-1.sagemaker.aws.evil.test/codeeditor/default"]:
            with self.subTest(raw=raw), self.assertRaises(ValueError):
                studio_urls.normalize_studio_url(raw)


if __name__ == "__main__":
    unittest.main()
