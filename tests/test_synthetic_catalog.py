import json
import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path

from scripts.seed_synthetic_catalog import SYNTHETIC, seed


class SyntheticCatalogTest(unittest.TestCase):
    def make_catalog(self, root: Path) -> Path:
        database = root / "catalog.sqlite"
        fields = dict.fromkeys(
            ("name", "location", "address", "description", "duration", "price", "contacts",
             "accessibility", "source", "effort", "kind", "hours", "cuisine", "dietary",
             "provider", "modality"), ""
        )
        fields.update(name="Museu real", location="Porto", description="Descrição real", source="Fonte real")
        record = {
            "id": "cat-0000000000000001", "category": "atracoes", "status": "approved",
            "revision": 1, "fields": fields, "raw": {}, "updatedAt": "2026-01-01T00:00:00Z",
            "reason": "Importado",
        }
        with closing(sqlite3.connect(database)) as connection:
            connection.execute("CREATE TABLE catalog_records (id TEXT PRIMARY KEY, snapshot TEXT NOT NULL)")
            connection.execute("CREATE TABLE catalog_history (id TEXT NOT NULL, revision INTEGER NOT NULL, snapshot TEXT NOT NULL, PRIMARY KEY(id,revision))")
            connection.execute("INSERT INTO catalog_records VALUES (?, ?)", (record["id"], json.dumps(record)))
            connection.execute("INSERT INTO catalog_history VALUES (?, ?, ?)", (record["id"], 1, json.dumps(record)))
            connection.commit()
        return database

    def test_dry_run_does_not_write_and_apply_preserves_real_values(self):
        # Keep the temporary SQLite file inside the workspace on restricted runners.
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as temporary:
            database = self.make_catalog(Path(temporary))
            before = database.read_bytes()
            report = seed(database, apply=False)
            self.assertEqual(report["records_changed"], 1)
            self.assertEqual(database.read_bytes(), before)

            seed(database, apply=True)
            with closing(sqlite3.connect(database)) as connection:
                record = json.loads(connection.execute("SELECT snapshot FROM catalog_records").fetchone()[0])
                history = connection.execute("SELECT COUNT(*) FROM catalog_history").fetchone()[0]
            self.assertEqual(record["revision"], 2)
            self.assertEqual(history, 2)
            self.assertEqual(record["fields"]["location"], "Porto")
            self.assertEqual(record["fields"]["description"], "Descrição real")
            self.assertIn(SYNTHETIC, record["fields"]["duration"])
            self.assertEqual(record["pricing"]["status"], "estimated")
            self.assertNotEqual(record["pricing"]["amount"], "0")
            self.assertTrue(record["matching"]["interests"])

            self.assertEqual(seed(database, apply=True)["records_changed"], 0)


if __name__ == "__main__":
    unittest.main()
