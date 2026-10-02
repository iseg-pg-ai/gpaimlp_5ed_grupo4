import unittest
from translations.ui_catalogue_sources import literal_sources


class UiCatalogueSourcesTest(unittest.TestCase):
    def test_multiline_and_inline_jsx_have_identical_sources(self):
        inline = '<T text="Guardar" source="pt"/><T text="Day"/>'
        formatted = '<T\n  text="Guardar"\n  source="pt"\n/><T text="Day" />'
        self.assertEqual(literal_sources(inline), literal_sources(formatted))
        self.assertEqual(literal_sources(formatted), {"Guardar": "pt", "Day": "en"})

    def test_dynamic_values_are_not_mistaken_for_literal_translations(self):
        self.assertEqual(literal_sources('<T text={record.name} source="pt"/>'), {})
