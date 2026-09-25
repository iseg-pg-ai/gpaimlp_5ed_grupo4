# Local data ETL

Run the complete, deterministic ingestion from the repository root:

```powershell
.\.venv\Scripts\python.exe -m etl.pipeline --data-dir data --output-dir warehouse
```

The pipeline processes every `.xlsx` and `.pdf` below `data/`.

- Excel sheets become normalized JSONL files and SQLite tables. The two structures in `REGRAS_CURADORIA` are split into `curation_principles` and `curation_rules`.
- Each PDF becomes a document record containing extracted text and discoverable contacts, URLs and price mentions; every PDF page is separately loaded for traceability and search.
- `warehouse/manifest.json` reports input coverage, row counts and non-fatal PDF extraction failures.
- `warehouse/blu_etl.sqlite` is the queryable delivery. Use `sqlite3 warehouse/blu_etl.sqlite ".tables"` to inspect it.
- `warehouse/validation_report.json` and `data_quality_issues.jsonl` are created first; they report completeness, duplicate IDs, invalid coordinates, and broken PDF-page links.
- `warehouse/kpis.json` then reports catalog, pricing, proposal, and data-quality KPIs.
- `warehouse/model_catalog_readiness.jsonl` and `model_proposal_complexity.jsonl` contain transparent analytical scores. Their scoring definitions are in `analytical_models.json`.

The pipeline only reads `data/` and fully recreates the selected output directory on each run, preventing stale records after source changes.

## Dashboard

After running the ETL, launch the dashboard with:

```powershell
.\.venv\Scripts\streamlit.exe run dashboard\app.py
```

It reads the SQLite warehouse and the validation/KPI/model artifacts. The warehouse data-model documentation is in `reports/data_model_report.md`.

## Automation and operations

Use `powershell -ExecutionPolicy Bypass -File .\scripts\run_full_pipeline.ps1` for the complete automated local workflow. See [AUTOMATION.md](AUTOMATION.md) for the full operating guide, CI behavior, validation gate, data flow, dashboard commands, and troubleshooting.
