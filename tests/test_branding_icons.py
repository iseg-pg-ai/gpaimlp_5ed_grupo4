from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


class BrandingIconsTest(unittest.TestCase):
    def test_all_web_interfaces_use_the_presentation_icon(self):
        presentation = (ROOT / "presentation/dist/favicon.svg").read_bytes()
        self.assertEqual(
            (ROOT / "dmc-workspace/public/favicon.svg").read_bytes(), presentation
        )
        self.assertEqual(
            (ROOT / "monitoring/static/favicon.svg").read_bytes(), presentation
        )
        self.assertIn(
            'page_icon=str(ROOT / "presentation/dist/favicon.svg")',
            (ROOT / "dashboard/app.py").read_text(),
        )


if __name__ == "__main__":
    unittest.main()
