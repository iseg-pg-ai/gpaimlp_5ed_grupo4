import copy
import unittest
from pathlib import Path
from unittest.mock import patch

from etl.pipeline import extract_workbook, records_from_section
from etl.structured import integrate_structured

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data/reference/structured_dataset.xlsx"


class StructuredDatasetTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.original = extract_workbook(next((ROOT / "data").glob("*.xlsx")))
        cls.tables = copy.deepcopy(cls.original)
        cls.report = integrate_structured(SOURCE, cls.tables)

    def test_no_duplicates_or_overwritten_original_values(self):
        for table, key in (("atracoes", "id"), ("restaurantes", "id_blu"), ("experiencias", "nome_da_experiencia"), ("precos", "id")):
            index = {r[key]: r for r in self.tables[table]}
            self.assertEqual(len(index), len(self.tables[table]))
            for old in self.original[table]:
                for field, value in old.items():
                    self.assertEqual(index[old[key]][field], value)

    def test_complement_fills_coordinates_and_preserves_lineage(self):
        row = next(r for r in self.tables["restaurantes"] if r["id_blu"] == "REST-001")
        self.assertEqual(row["latitude"], 38.7157745)
        self.assertEqual(row["_supplement_source"]["sheet"], "Restaurantes_base")
        self.assertTrue(self.tables["structured_merge_changes"])

    def test_history_is_separate_and_prices_keep_status(self):
        self.assertEqual(len(self.tables["structured_roteiros"]), 58)
        self.assertEqual(len(self.tables["structured_precos_propostas"]), 127)
        self.assertTrue(all("estado_temporal_confirmacao" in r for r in self.tables["structured_precos_propostas"]))
        self.assertFalse(any(str(r["id"]).startswith("PRE-") for r in self.tables["precos"]))
        self.assertEqual(len(self.tables["structured_fontes_enriquecimento"]), 1020)

    def test_conflicts_are_audited(self):
        self.assertEqual(self.report["conflicts"], 3)
        for conflict in self.tables["structured_merge_conflicts"]:
            self.assertNotEqual(conflict["retained_value"], conflict["supplement_value"])
            self.assertIn("_source_row", conflict)

    def test_duplicate_supplement_ids_rejected(self):
        def duplicate(sheet, *args):
            rows = records_from_section(sheet, *args)
            return rows + [dict(rows[0])] if sheet.title == "Roteiros" else rows
        with patch("etl.pipeline.records_from_section", side_effect=duplicate):
            with self.assertRaisesRegex(ValueError, "duplicate"):
                integrate_structured(SOURCE, copy.deepcopy(self.original))

    def test_broken_reference_rejected(self):
        def broken(sheet, *args):
            rows = records_from_section(sheet, *args)
            if sheet.title == "Atividades":
                rows[0]["id_roteiro"] = "MISSING"
            return rows
        with patch("etl.pipeline.records_from_section", side_effect=broken):
            with self.assertRaisesRegex(ValueError, "Broken structured references"):
                integrate_structured(SOURCE, copy.deepcopy(self.original))
