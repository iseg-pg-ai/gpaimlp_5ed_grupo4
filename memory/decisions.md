# Decisions and open choices

Last verified: 2026-09-29

## D-001 - Separate implemented state from target architecture

- Status: accepted for project planning
- Date: 2026-09-29
- Decision: treat the local ETL, warehouse, Streamlit dashboard, and Next.js DMC
  Workspace as the implemented baseline. Treat S3, Bedrock, live provider APIs,
  and AWS deployment as target scope until code and tests exist. The earlier
  Google Forms concept is superseded by embedded dashboard intake.
- Reason: this prevents agents from relying on README passages or diagram boxes
  as if they were deployed components.
- Evidence: repository tree, package manifests, tests, supplied project diagram.
- Scope: architecture, plans, estimates, and implementation summaries.

## D-002 - Protect source and generated-data boundaries

- Status: established by current implementation
- Date: 2026-09-29
- Decision: `data/` is protected source input; `warehouse/` is generated only by
  the validated ETL; applications consume but do not mutate either location.
- Reason: lineage, reproducibility, and atomic publication depend on this split.
- Evidence: `etl/sources.py`, `etl/pipeline.py`, `README_ETL.md`.
- Scope: all data, dashboard, and integration work.

## D-003 - Keep business overrides versioned outside raw workbooks

- Status: established by current implementation
- Date: 2026-09-29
- Decision: reviewed curation wording/behavior overrides belong in
  `config/curation_rule_overrides.json` and must be applied consistently by ETL
  and the DMC Workspace.
- Reason: preserves original files while making business changes auditable.
- Evidence: `etl/pipeline.py`, DMC itinerary API route.
- Scope: curation rules R01-R51 and tier wording.

## D-004 - Human review remains the itinerary release gate

- Status: accepted from product workflow
- Date: 2026-09-29
- Decision: generated or agent-modified itineraries are proposals until a human
  curator reviews them. Live availability, final price, accessibility, and
  schedule claims require confirmation.
- Reason: the current catalogue is reference data and future providers may fail
  or return incomplete information.
- Evidence: `README.md`, `README_UIMOCK.md`, supplied project diagram.
- Scope: UI language, agent behavior, exports, and integration error handling.

## D-005 - Embed intake in the curator dashboard

- Status: accepted product decision
- Date: 2026-09-29
- Decision: use the existing version 1.0 form in
  `dmc-workspace/src/components/NewTripScreen.tsx` as the intake baseline.
  Google Forms and a separate intake application are out of scope.
- Reason: keeps intake, curation, review, versioning, and export in one
  operational workflow.
- Evidence: explicit team direction and the existing component.
- Scope: UI ownership, intake contracts, roadmap, and cloud integration.

## Open decisions

### O-001 - Primary operational UI

Document the accepted boundary in user-facing architecture material: Next.js
owns operational intake and curation; Streamlit remains analytical.

### O-002 - Agent/model boundary

Choose Bedrock-only, OpenAI-only, or a provider-neutral model interface. The
diagram currently names both Bedrock and OpenAI for different responsibilities.

### O-003 - First external integration

Choose the first MVP provider based on the acceptance scenario. Routing is the
strongest candidate because itinerary viability depends on travel time and
mobility constraints, but no provider is approved yet.

### O-004 - Cloud persistence contract

Define what S3 stores (raw intake, curated company knowledge, generated
itineraries, or all three), retention, encryption, region, identifiers, and the
local/offline fallback before writing an adapter.

### O-005 - Privacy and consent

Define the minimum traveler data, consent, retention, redaction, logging, and
deletion rules before persisting dashboard intake or sending briefs to an LLM.

### O-006 - Warehouse delivery policy

Choose whether `warehouse/` is a committed release snapshot, a CI artifact, or
both. Define review and retention rules before changing the current mixed model.

### O-007 - Extraction and conflict gates

Decide whether any PDF extraction error blocks publication and how approved
structured merge conflicts are identified, reviewed, and waived.

### O-008 - Translation deployment

Choose whether the Python runtime and local models are bundled with deployment or
provisioned separately. The Node workspace does not install them.
