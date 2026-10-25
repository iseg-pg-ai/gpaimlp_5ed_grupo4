# Warehouse guidance

This directory represents generated delivery data owned by `etl.pipeline`.
In SageMaker, `BLU_WAREHOUSE_DIR` points to the temporary cache materialized
from the validated S3 release.

- Never hand-edit JSON, JSONL, or SQLite outputs.
- Regenerate only for approved source or ETL behavior changes:

```powershell
.\.venv\Scripts\python.exe -B -m etl.pipeline --data-dir data --output-dir warehouse
```

- Require a passing validation report, deliberate review of manifest source
  inventory and PDF errors, and explicit review of structured merge conflicts.
- Review generated diffs for deterministic output, schema compatibility,
  unexpected row-count changes, source lineage, and accidental customer data.
- The S3 release is authoritative. CI produces only the synthetic
  `blu-warehouse-ci-smoke` artefact and must never publish it as operational data.
