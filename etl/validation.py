"""Data-quality validation for records produced by the local ETL."""

from __future__ import annotations

from collections import Counter
from typing import Any


# Each table's business identifier is used to identify missing values and duplicates.
PRIMARY_KEYS = {
    "atracoes": "id",
    "restaurantes": "id_blu",
    "experiencias": "nome_da_experiencia",
    "curation_principles": "id",
    "curation_rules": "id",
    "precos": "id",
    "proposal_documents": "document_id",
    # A document ID repeats by design, so a page is identified by this composite key.
    "proposal_pages": ("document_id", "page_number"),
}


def validate(tables: dict[str, list[dict[str, Any]]]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """Return a coverage report and record-level data-quality issues.

    Validation never changes source-derived records; it describes defects separately
    so downstream consumers can decide whether a warning is acceptable.
    """
    issues: list[dict[str, Any]] = []
    table_summaries: dict[str, dict[str, Any]] = {}

    for table_name, records in tables.items():
        key = PRIMARY_KEYS.get(table_name)
        # Experience names are editable; portal identity remains stable across renames.
        if table_name == "experiencias" and records and all(r.get("_catalog_id") for r in records):
            key = "_catalog_id"
        key_fields = (key,) if isinstance(key, str) else key
        # Build the full business-field schema so omitted sparse values count as missing.
        business_columns = sorted({column for record in records for column in record if not column.startswith("_")})
        missing_by_column = Counter(
            column
            for record in records
            for column in business_columns
            if record.get(column) is None
        )
        if key_fields:
            missing_keys = [record for record in records if any(record.get(field) is None for field in key_fields)]
            key_values = [tuple(record[field] for field in key_fields) for record in records if all(record.get(field) is not None for field in key_fields)]
            duplicate_keys = {value for value, count in Counter(key_values).items() if count > 1}
            for record in missing_keys:
                issues.append({"table": table_name, "issue_type": "missing_primary_key", "key": list(key_fields), "source": source(record)})
            for record in records:
                record_key = tuple(record.get(field) for field in key_fields)
                if record_key in duplicate_keys:
                    issues.append({"table": table_name, "issue_type": "duplicate_primary_key", "key": list(key_fields), "value": list(record_key), "source": source(record)})
        else:
            missing_keys, duplicate_keys = [], set()

        # Coordinates should be geographic degrees after the ETL microdegree fix.
        for record in records:
            for coordinate, lower, upper in (("latitude", -90, 90), ("longitude", -180, 180)):
                value = record.get(coordinate)
                if value is not None and (not isinstance(value, (int, float)) or not lower <= value <= upper):
                    issues.append({"table": table_name, "issue_type": "invalid_coordinate", "field": coordinate, "value": value, "source": source(record)})

        populated = sum(1 for record in records for column in business_columns if record.get(column) is not None)
        possible = len(records) * len(business_columns)
        table_summaries[table_name] = {
            "record_count": len(records),
            "primary_key": list(key_fields) if key_fields else None,
            "missing_primary_keys": len(missing_keys),
            "duplicate_primary_key_values": len(duplicate_keys),
            "completeness_pct": round(100 * populated / possible, 2) if possible else 100.0,
            "missing_values_by_column": dict(missing_by_column),
        }

    # Every extracted page must be attributable to an extracted document.
    document_ids = {record["document_id"] for record in tables.get("proposal_documents", [])}
    orphan_pages = [record for record in tables.get("proposal_pages", []) if record.get("document_id") not in document_ids]
    for page in orphan_pages:
        issues.append({"table": "proposal_pages", "issue_type": "orphan_document_reference", "source": source(page)})

    report = {
        "status": "passed" if not issues else "passed_with_warnings",
        "tables": table_summaries,
        "issue_count": len(issues),
        "orphan_page_count": len(orphan_pages),
    }
    return report, issues


def source(record: dict[str, Any]) -> dict[str, Any]:
    """Keep validation findings traceable to their original source location."""
    return {key: record[key] for key in ("_source_sheet", "_source_row", "source_file", "page_number") if key in record}
