import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from scripts import studio_urls


class StudioUrlsTest(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()
