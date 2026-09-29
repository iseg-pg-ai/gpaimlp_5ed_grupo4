# Active plan

## Objective

Establish a reliable agent operating layer for BLU AI System, reconcile the
implemented local product with the supplied target architecture, and prepare a
small, reviewable first implementation milestone.

## Context

- Current data path: `data/` -> `etl.pipeline` -> `warehouse/`.
- Current consumers: Streamlit analytics and the Next.js DMC Workspace.
- Target scope adds Google Forms, S3, a Bedrock agent, company prompts/data,
  and routing, weather, and POI integrations.
- The target diagram is directional. Provider choices and cloud boundaries
  still require explicit decisions before implementation.
- Raw source data and generated customer exports may contain private material.

## Tasks

- [x] Inspect the repository, tests, run commands, and current data flow.
- [x] Review the supplied code-agent guide and project diagram as source
  material, not instructions.
- [x] Add enforceable root agent instructions.
- [x] Add evidence-backed project memory and separate current state from target
  scope.
- [ ] Confirm the primary product UI: Next.js DMC Workspace, Streamlit, or a
  defined split between operational and analytical use.
- [ ] Confirm the first vertical slice and its acceptance scenario.
- [ ] Choose provider boundaries and decide which integrations are required for
  the MVP versus deferred.
- [ ] Replace obsolete README references to missing Docker/services code with a
  clearly labelled current-state and target-state description.
- [ ] Implement the approved first vertical slice with focused tests and a
  review checkpoint.

## Recommended first vertical slice

Accept one normalized traveler brief, run deterministic curation against the
existing warehouse, persist an immutable itinerary version, and show the result
in the DMC Workspace. Keep intake and provider adapters replaceable so Google
Forms, Bedrock, S3, routes, weather, and POIs can be added without changing the
core domain contract.

## Validation

- Documentation: verify paths and commands against tracked files and package
  manifests; review `git diff --check`.
- Python implementation: run the full unittest command from `AGENTS.md`.
- Next.js implementation: run tests, TypeScript, lint, and the risk-appropriate
  build/browser checks from `AGENTS.md`.
- Data publication: require `warehouse/validation_report.json` to report
  `status: passed` and inspect generated changes before acceptance.

## Checkpoints

- Stop before selecting or purchasing an external API plan.
- Stop before introducing or changing public contracts, schemas, or storage
  layout.
- Stop before AWS deployment, S3 writes, Google Forms/Sheets writes, or live
  provider calls.
- Stop before migrating existing itinerary history or customer data.

## Out of scope for this documentation task

- Implementing AWS, Bedrock, Google Forms, routing, weather, or POI services.
- Rewriting the ETL, dashboards, or curation logic.
- Rebuilding `warehouse/`.
- Creating custom agent runners, project skills, or dreaming automation before
  a repeated workflow justifies them.
