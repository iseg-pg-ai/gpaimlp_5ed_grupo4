# Repository layout and runtime boundaries

Last verified: 2026-09-29

## Current data flow

```text
data/ (versioned Excel and proposal PDFs; source of truth)
  -> etl.pipeline (extract, integrate, validate, score, publish atomically)
  -> warehouse/ (versioned JSONL, JSON reports, and SQLite delivery)
     -> dashboard/app.py (read-only analytical Streamlit view)
     -> dmc-workspace/ (catalogue-backed curation and reference views)
        -> exports/ (ignored local itinerary versions, PDFs, translation cache)
```

## Entry points

| Area | Entry point | Responsibility |
| --- | --- | --- |
| Local source discovery | `etl/sources.py` | Finds one catalogue workbook, an optional structured supplement, reference workbooks, and proposal PDFs. |
| ETL publication | `etl/pipeline.py` | Extracts data, preserves lineage, validates, builds analytics, and replaces the warehouse with rollback. |
| Structured enrichment | `etl/structured.py` | Integrates `data/reference/structured_dataset.xlsx` and audits changes/conflicts. |
| Validation | `etl/validation.py` | Enforces identifiers, coordinates, and document/page integrity. |
| Analytics | `etl/analytics.py` | Produces KPIs and transparent model outputs after validation. |
| Analytical UI | `dashboard/app.py` | Reads warehouse SQLite/JSON and the data-model report. |
| Operational UI | `dmc-workspace/src/app/page.tsx` | Controls traveler intake, itinerary generation, editing, and local browser state. |
| Curation API | `dmc-workspace/src/app/api/itineraries/route.ts` | Reads warehouse JSONL and rule overrides, validates a brief, and returns a deterministic itinerary. |
| Curation domain | `dmc-workspace/src/lib/curation.ts` | Applies catalogue selection, rule explanations, and supported itinerary commands. |
| Version/export API | `dmc-workspace/src/app/api/versions/route.ts` | Creates/lists immutable itinerary versions and serves PDF/ZIP exports. |
| Version store | `dmc-workspace/src/lib/version-store.ts` | Persists SQLite metadata, snapshots, hashes, and localized PDFs under `exports/`. |
| Local translation | `translations/worker.py` and `dmc-workspace/src/lib/local-translation.ts` | Runs optional offline translation through a Python child process. |

The DMC workspace has two persistence layers: browser `localStorage` holds
draft/UI state, while SQLite and write-once files under `exports/itineraries`
hold authoritative immutable versions and exported artifacts.

## Ownership boundaries

- `data/`: protected input. The ETL reads it; applications do not write it.
- `warehouse/`: generated delivery. The pipeline owns it; dashboards read it.
- `config/curation_rule_overrides.json`: reviewed business overrides applied by
  both ETL extraction and the DMC curation API.
- `exports/`: mutable local operational state owned by the version/export and
  translation workflows; ignored by Git.
- `reports/data_model_report.md`: human-readable warehouse model description
  rendered by Streamlit.
- `scripts/`: automation plus standalone API experiments; scripts are not
  automatically application services.
- `src/` and `notebooks/`: currently placeholders, not active entry points.

## Validation and CI

- Python regression tests live under `tests/` and use temporary directories for
  ETL publication tests.
- DMC domain/version tests live under `dmc-workspace/tests/`.
- `.github/workflows/data-pipeline.yml` checks dependency exports, rebuilds the
  warehouse, enforces validation, runs Python regressions, and publishes the
  warehouse artifact on Windows.
- There is currently no checked-in frontend CI workflow.
- The data workflow rebuilds the checked-in warehouse, while regression tests
  also exercise publication independently in temporary directories.

## Documentation caveat

The root README still references Docker Compose, `services/`, `infrastructure/`,
and several `docs/*.md` files that are absent. Treat those passages as an older
reference architecture until they are reconciled with the current codebase.
