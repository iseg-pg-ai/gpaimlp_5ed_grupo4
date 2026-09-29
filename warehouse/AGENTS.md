# Warehouse guidance

This directory is generated delivery data owned by `etl.pipeline`.

- Never hand-edit JSON, JSONL, or SQLite outputs.
- Regenerate only for approved source or ETL behavior changes:

```powershell
.\.venv\Scripts\python.exe -B -m etl.pipeline --data-dir data --output-dir warehouse
```

- Require a passing validation report, deliberate review of manifest source
  inventory and PDF errors, and explicit review of structured merge conflicts.
- Review generated diffs for deterministic output, schema compatibility,
  unexpected row-count changes, source lineage, and accidental customer data.
- The team must still decide whether this directory is a committed release
  snapshot, a CI artifact, or both; do not change that policy implicitly.
