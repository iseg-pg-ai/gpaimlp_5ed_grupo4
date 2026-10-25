# Dashboard guidance

The Streamlit dashboard is an analytical, read-only consumer of
`BLU_WAREHOUSE_DIR` and `reports/`. In SageMaker the warehouse is materialized
from S3 into the temporary runtime cache. It is not the operational itinerary
editor.

- Do not mutate source, warehouse, configuration, or exports from dashboard code.
- Handle missing, empty, or incompatible delivery artifacts with actionable,
  sanitized UI errors.
- Keep query and transformation logic testable outside Streamlit where practical.
- Dashboard changes need focused Python tests and a Streamlit smoke test. Visual
  changes also need desktop/mobile screenshots.
