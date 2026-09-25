# BLU pipeline automation and operations

## Purpose

This project turns the raw workbook and proposal PDFs in `data/` into an auditable analytical warehouse, validates the transformed data, creates KPIs and transparent scoring models, and makes the results available through Streamlit.

## One-command local run

From the repository root, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run_full_pipeline.ps1
```

The script performs these stages in order and fails fast if any stage fails:

1. Installs `virtualenv` with the system Python and creates `.venv` when it does not exist.
2. Installs the pinned dependencies from `requirements.txt`.
3. Runs `etl.pipeline`, which extracts all files in `data/`, transforms them, and rebuilds `warehouse/`.
4. Runs the validation release gate. The run proceeds only when `validation_report.json` has `status: passed`.
5. Compiles the ETL/dashboard modules and runs the end-to-end test.

To skip installation in an already prepared environment:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run_full_pipeline.ps1 -SkipInstall
```

To choose an alternative input or delivery path:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run_full_pipeline.ps1 -DataDirectory data -OutputDirectory warehouse
```

## Dashboard operations

Run the data pipeline first, then start the dashboard:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start_dashboard.ps1
```

Visit `http://localhost:8501`. Use another port when required:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start_dashboard.ps1 -Port 8502
```

The dashboard reads only generated warehouse artifacts; it does not edit raw source data.

## Data flow and outputs

```text
data/*.xlsx + data/**/*.pdf
            │
            ▼
       etl.pipeline
            │
            ├── validation_report.json + data_quality_issues.jsonl
            ├── kpis.json
            ├── model_catalog_readiness.jsonl
            ├── model_proposal_complexity.jsonl
            ├── table-level JSONL files
            └── blu_etl.sqlite
                     │
                     ▼
              Streamlit dashboard
```

`warehouse/` is intentionally regenerated on every run. Treat it as a delivery artifact, not a manual editing location.

## Validation release gate

Validation checks primary keys, duplicate keys, coordinate ranges, and the document-to-page relationship. Optional-field completeness is reported by table and does not itself fail a run. Investigate every non-empty `data_quality_issues.jsonl` before publishing a warehouse externally.

## Data model and analytics

The definitive entity grain, keys, relationships, lineage, and scoring logic are documented in [the data-model report](reports/data_model_report.md). The model outputs are explainable scores, not predictive ML, because the current source has no observed outcome variable.

## Continuous integration

`.github/workflows/data-pipeline.yml` executes on relevant pushes, pull requests, or manual dispatch. It installs dependencies, rebuilds the warehouse, applies the validation gate, runs regression tests, and uploads the warehouse as the `blu-warehouse` workflow artifact.

For a scheduled refresh in GitHub Actions, add a `schedule` trigger to that workflow only after deciding the source-data refresh cadence and committing an approved automated source update process. For local scheduled runs, create a Windows Task Scheduler task that invokes `powershell.exe -ExecutionPolicy Bypass -File <repository>\scripts\run_full_pipeline.ps1` from the repository root.

## Recovery and troubleshooting

- Missing `.venv`: run the one-command script; it bootstraps the environment.
- Failed package installation: confirm internet access, then rerun without `-SkipInstall`.
- Validation failure: inspect `warehouse/validation_report.json` and `warehouse/data_quality_issues.jsonl`; correct the raw data and rerun.
- Dashboard reports a missing warehouse: run the pipeline before starting Streamlit.
- Dashboard code changes: Streamlit detects and reloads them automatically.
