import datetime as dt
import json
import tempfile
import unittest
from pathlib import Path

from scripts.check_warehouse_release import check


class WarehouseGateTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.warehouse = self.root / "warehouse"
        self.warehouse.mkdir()
        (self.warehouse / "blu_etl.sqlite").write_bytes(b"sqlite")
        (self.warehouse / "validation_report.json").write_text(
            json.dumps({"status": "passed", "issue_count": 0}), encoding="utf-8"
        )
        (self.warehouse / "manifest.json").write_text(
            json.dumps({
                "schema_version": 1,
                "validation": {"status": "passed"},
                "pdf_errors": [],
            }),
            encoding="utf-8",
        )
        self.policy = self.root / "policy.json"
        self.policy_value = {
            "schemaVersion": 1,
            "warehouseManifest": {
                "acceptedSchemaVersions": [1],
                "requiredFiles": ["blu_etl.sqlite", "manifest.json", "validation_report.json"],
            },
            "quality": {"maxIssues": 0, "maxPdfErrors": 0},
            "conflictExceptions": [],
        }
        self.write_policy()

    def tearDown(self):
        self.temporary.cleanup()

    def write_policy(self):
        self.policy.write_text(json.dumps(self.policy_value), encoding="utf-8")

    def conflict(self):
        (self.warehouse / "structured_merge_conflicts.jsonl").write_text(
            json.dumps({"table": "atracoes", "record_id": "A1", "field": "preco"}) + "\n",
            encoding="utf-8",
        )

    def test_valid_release_passes_with_versioned_contract(self):
        result = check(self.warehouse, self.policy, dt.date(2026, 10, 24))
        self.assertEqual(result, {
            "manifestSchemaVersion": 1,
            "issues": 0,
            "pdfErrors": 0,
            "conflicts": 0,
            "exceptions": 0,
        })

    def test_unapproved_conflict_is_blocked(self):
        self.conflict()
        with self.assertRaisesRegex(ValueError, "Conflitos sem exceção"):
            check(self.warehouse, self.policy, dt.date(2026, 10, 24))

    def test_exception_requires_owner_reason_expiry_and_matching_conflict(self):
        self.conflict()
        self.policy_value["conflictExceptions"] = [{
            "table": "atracoes",
            "recordId": "A1",
            "field": "preco",
            "reason": "Tarifa comercial prevalece durante revisão.",
            "owner": "data-owner",
            "expiresOn": "2026-10-31",
        }]
        self.write_policy()
        self.assertEqual(check(self.warehouse, self.policy, dt.date(2026, 10, 24))["exceptions"], 1)
        with self.assertRaisesRegex(ValueError, "expirada"):
            check(self.warehouse, self.policy, dt.date(2026, 11, 1))
        (self.warehouse / "structured_merge_conflicts.jsonl").unlink()
        with self.assertRaisesRegex(ValueError, "Exceções sem conflito"):
            check(self.warehouse, self.policy, dt.date(2026, 10, 24))

    def test_incompatible_manifest_and_quality_fail(self):
        manifest = json.loads((self.warehouse / "manifest.json").read_text(encoding="utf-8"))
        manifest["schema_version"] = 2
        (self.warehouse / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "Versão do manifesto"):
            check(self.warehouse, self.policy)
        manifest["schema_version"] = 1
        manifest["pdf_errors"] = ["documento.pdf"]
        (self.warehouse / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "erros de PDF"):
            check(self.warehouse, self.policy)


if __name__ == "__main__":
    unittest.main()
