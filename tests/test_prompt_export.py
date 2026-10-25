"""Contratos da exportação Prompt TXT independente de fornecedor."""
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


class PromptExportTest(unittest.TestCase):
    def test_portal_prompt_has_no_external_plugin(self):
        plugin = ROOT / "plugins/blu-curadoria"
        self.assertFalse(any(path.is_file() for path in plugin.rglob("*")))

    def test_prompt_contract_is_neutral(self):
        source = (ROOT / "portal/prompt.py").read_text(encoding="utf-8")
        self.assertIn('"formato": "blu-roteiro-prompt/1.0.0"', source)
        self.assertNotIn("modeloVisual", source)


if __name__ == "__main__":
    unittest.main()
