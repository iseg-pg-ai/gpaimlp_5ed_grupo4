# ETL guidance

- `LocalSource` must discover exactly one main catalogue and at most one
  structured supplement; unknown workbooks remain inventoried as references.
- Preserve deterministic ordering, source-file/sheet/row lineage, content hashes,
  and the separation between current catalogue inventory and historical proposals.
- Structured enrichment fills missing values by exact key, retains original
  conflicts, and audits every change and conflict.
- Validation must pass before analytics or publication. Build into staging and
  preserve the previous warehouse if build or publication fails.
- PDF extraction errors and structured merge conflicts require explicit review;
  never infer that `validation_report.status == passed` resolves them.
- Never write into `data/` and never patch `warehouse/` by hand.

Validation from the repository root:

```powershell
.\.venv\Scripts\python.exe -B -m unittest tests.test_local_source tests.test_structured_dataset tests.test_etl_pipeline -v
.\.venv\Scripts\python.exe -B -m etl.pipeline --data-dir data --output-dir warehouse
```

After regeneration, inspect `manifest.json`, `validation_report.json`,
`pdf_errors`, structured conflicts, and the complete warehouse diff before
accepting the delivery.
