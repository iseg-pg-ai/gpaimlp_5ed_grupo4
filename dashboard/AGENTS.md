# Dashboard guidance

The Streamlit dashboard is an analytical, read-only consumer of `warehouse/` and
`reports/`. It is not currently the operational itinerary editor shown in the
target diagram.

- Do not mutate source, warehouse, configuration, or exports from dashboard code.
- Handle missing, empty, or incompatible delivery artifacts with actionable,
  sanitized UI errors.
- Keep query and transformation logic testable outside Streamlit where practical.
- Dashboard changes need focused Python tests and a Streamlit smoke test. Visual
  changes also need desktop/mobile screenshots.
