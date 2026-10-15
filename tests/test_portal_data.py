"""Contratos das consultas Python usadas pelo portal."""
import json
from pathlib import Path
import tempfile
import unittest
from portal.data import UnknownTable, dataset_tables, enrich_records, query_dataset, render_dataset


class PortalDataTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)

    def write(self, table, rows):
        (self.root / f"{table}.jsonl").write_text(
            "\n".join(json.dumps(row, ensure_ascii=False) for row in rows), encoding="utf-8")

    def test_search_pagination_and_allowlist(self):
        self.write("structured_atracoes_base", [{"id": i, "nome": "São Jorge"} for i in range(60)])
        (self.root / "secrets.jsonl").write_text("secret")
        self.assertEqual(dataset_tables(self.root), ["structured_atracoes_base"])
        result = query_dataset(self.root, {"q": "SÃO", "page": "2"})
        self.assertEqual((result["total"], result["page"], len(result["rows"])), (60, 2, 25))
        self.assertEqual(result["rows"][0]["id"], 25)
        self.assertEqual(query_dataset(self.root, {"page": "999"})["page"], 3)
        for invalid in ("-1", "1.5", "nan", "Infinity", "bad", "9007199254740992"):
            self.assertEqual(query_dataset(self.root, {"page": invalid})["page"], 1)
        self.assertEqual(query_dataset(self.root, {"q": "ausente"})["rows"], [])
        for table in ("../secrets", "/etc/passwd", "secrets", "structured_other"):
            with self.assertRaises(UnknownTable):
                query_dataset(self.root, {"table": table})

    def test_enrichment_preserves_edits_and_exact_identifiers(self):
        self.write("structured_atracoes_base", [{"id": "LIS-1", "latitude": 38.7}, {"id": 1, "latitude": 2}])
        self.write("structured_precos_base", [{"id": "LIS-1", "price": 17}])
        record = {"category": "atracoes", "raw": {"id": "LIS-1"}, "fields": {"hours": "Editado"}}
        result = enrich_records(self.root, [record])[0]
        self.assertEqual(result["fields"], record["fields"])
        self.assertEqual(result["sourceData"]["latitude"], 38.7)
        self.assertEqual(result["sourceData"]["tarifas_de_referencia"][0]["price"], 17)
        self.assertNotIn("sourceData", record)
        for identifier in ("1", True):
            other = {**record, "raw": {"id": identifier}}
            self.assertNotIn("latitude", enrich_records(self.root, [other])[0]["sourceData"])
        self.assertEqual(enrich_records(self.root, [{**record, "raw": {}}])[0]["sourceData"], {})

    def test_html_escapes_sources_and_preserves_nested_values(self):
        data = {"table": "structured_test", "rows": [{
            "nome_da_atracao": '<script>alert("x")</script>',
            '<img src=x onerror="alert(1)">': "<&value>",
            "nested": {"unsafe": "</dd><script>bad</script>"},
            "missing": None, "unknown": "", "false": False, "zero": 0,
        }]}
        html = render_dataset(data)
        self.assertNotIn("<script>", html)
        self.assertNotIn("<img", html)
        self.assertIn("&lt;script&gt;", html)
        self.assertIn("&lt;&amp;value&gt;", html)
        self.assertIn("&quot;unsafe&quot;", html)
        self.assertIn(">false</dd>", html)
        self.assertIn(">0</dd>", html)
        self.assertEqual(html.count(">—</dd>"), 2)

    def test_empty_and_invalid_data(self):
        self.assertEqual(query_dataset(self.root, {}), {"tables": [], "rows": [], "total": 0, "page": 1})
        self.write("structured_broken", [])
        (self.root / "structured_broken.jsonl").write_text("invalid")
        with self.assertRaises(ValueError):
            query_dataset(self.root, {})
