"""Numeric protection tests with a fake model; no network or inference needed."""
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from translations import worker


class NumericProtectionTests(unittest.TestCase):
    def run_translation(self, replacements):
        tokenizer = SimpleNamespace(encode=lambda text: [text], decode=lambda tokens: tokens[0])
        package = SimpleNamespace(tokenizer=tokenizer, target_prefix="")
        model = SimpleNamespace(translate_batch=lambda batches, **kwargs: [
            SimpleNamespace(hypotheses=[[replacements.get(tokens[0], tokens[0])]])
            for tokens in batches
        ])
        with patch.dict(worker.PACKAGES, {("pt", "en"): package}), patch.dict(worker.MODELS, {("pt", "en"): model}):
            return worker.direct(["Visita às 10:30 por 25 EUR."], "pt", "en")[0]

    def test_changed_time_and_price_are_preserved(self):
        result = self.run_translation({
            "Visita às 10:30 por 25 EUR.": "Visit at 11:30 for 30 EUR.",
            "Visita às ": "Visit at", " por ": "for",
        })
        self.assertEqual(result, "Visit at 10:30 for 25 EUR.")

    def test_unrecoverable_number_change_fails(self):
        with self.assertRaisesRegex(ValueError, "numeric content"):
            self.run_translation({
                "Visita às 10:30 por 25 EUR.": "Visit at 11:30 for 30 EUR.",
                "Visita às ": "Visit at 9",
            })

    def test_same_language_does_not_change_text(self):
        text = "João — 2026-09-23 — 2000 EUR"
        self.assertEqual(worker.translate([{"text": text, "source": "pt"}], "pt"), [text])


if __name__ == "__main__":
    unittest.main()
