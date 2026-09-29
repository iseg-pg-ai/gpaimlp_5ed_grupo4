# Active plan

## Objective

Evolve the validated local BLU system toward the supplied architecture diagram
while preserving source lineage, deterministic curation, human approval, privacy,
and immutable itinerary history.

The diagram is directional evidence, not an approved provider contract. Its
original separate Google Forms intake is superseded by the product decision to
embed intake directly in the curator dashboard. The remaining target elements
are S3, a Bedrock agent, company data and prompts, external APIs, route/change
requests, and save behavior. The repository currently implements a local ETL,
warehouse, analytical Streamlit dashboard, and a richer Next.js operational
workspace.

## Current baseline

- [x] Local source discovery, lineage, structured enrichment, and validated
  atomic warehouse publication.
- [x] Streamlit analytics over warehouse and report artifacts.
- [x] Next.js traveler brief, deterministic catalogue curation, human editing,
  immutable version history, and PDF export.
- [x] Optional offline portal/PDF translation.
- [x] Version 1.0 embedded intake in
  `dmc-workspace/src/components/NewTripScreen.tsx`; Google Forms is out of scope.
- [ ] Integrate the agent-guidance commit `cb60263` into the chosen integration
  branch.
- [ ] Review and integrate translation setup fix `0c1ba50`.
- [ ] Reconcile the obsolete root README with the implemented product.
- [ ] Decide whether `origin/dev` becomes `main` or the repository default
  branch changes.

## Phase 0 - Decisions and contracts

- [ ] Document the accepted operational boundary: Next.js owns embedded intake
  and curation; Streamlit remains analytical.
- [ ] Define and approve `TravelerBrief`, `Itinerary`, `ProviderEvidence`,
  and `CompanyKnowledge` contracts.
- [ ] Decide the Bedrock/OpenAI responsibility boundary and require a
  provider-neutral application interface.
- [ ] Define what S3 would store, including identifiers, encryption, retention,
  deletion, regional constraints, and local fallback.
- [ ] Approve privacy, consent, prompt-redaction, audit, and release roles.
- [ ] Choose one acceptance scenario and measurable cost, latency, reliability,
  and accessibility constraints.

Completion: decisions are recorded in `memory/decisions.md` or ADRs and the
acceptance scenario can be tested without selecting a live provider.

## Phase 1 - Harden the local baseline

- [ ] Decide whether `warehouse/` is a committed release snapshot, CI artifact,
  or both.
- [ ] Make PDF extraction failures a publication gate or define an explicit,
  auditable waiver.
- [ ] Define approved structured conflicts by identity and test them, rather than
  asserting only the current count.
- [ ] Add dashboard unit coverage and one Streamlit smoke test.
- [ ] Add frontend CI for tests, TypeScript, lint, and build.
- [ ] Add schema/manifest compatibility checks for Streamlit and Next.js
  consumers.
- [ ] Add one end-to-end local acceptance test: normalized brief -> curated
  itinerary -> curator approval -> immutable version -> reproducible PDF.
- [ ] Remove tracked cache/platform artifacts in a dedicated reviewed change.

Completion: both applications consume a validated compatible delivery, branch-only
fixes are reconciled, and the local acceptance path is automated.

## Phase 2 - Provider-neutral integration layer

- [ ] Add typed interfaces for intake, routing, weather, POIs, object storage,
  and model orchestration.
- [ ] Implement deterministic mock adapters and failure-mode tests first.
- [ ] Define timeouts, bounded retries, cache/freshness rules, attribution,
  sanitized errors, telemetry, and cost controls.
- [ ] Keep provider evidence, BLU facts, and generated text distinguishable.
- [ ] Ensure provider failure degrades explicitly without inventing availability,
  price, weather, travel time, or accessibility.

Completion: the chosen acceptance scenario runs entirely with mocks and records
provider, retrieval time, request context, status, and evidence.

## Phase 3 - First live provider

- [ ] Re-verify current availability, licensing, pricing, coverage, and data terms
  for the diagram's routing candidates.
- [ ] Select one routing provider; do not add multi-provider failover yet.
- [ ] Enrich itinerary transit legs without silently overriding curated facts.
- [ ] Add mocked contract tests and one explicitly approved live smoke test.

Completion: one route result is traceable, replaceable, failure-tolerant, and
visible to the curator before approval.

## Phase 4 - Embedded intake and object storage

- [ ] Evolve the version 1.0 dashboard form against the approved
  `TravelerBrief` contract without creating a separate intake channel.
- [ ] Preserve validation errors and draft state inside the curator workflow.
- [ ] Validate, minimize, and redact data before persistence or model calls.
- [ ] Add an S3 adapter with least privilege, encryption, lifecycle policy, and
  idempotent writes.
- [ ] Preserve local adapters for development and offline tests.

Completion: one consented dashboard intake can be validated, curated, replayed
locally, and persisted through the approved cloud boundary without changing
domain logic.

## Phase 5 - Agent orchestration

- [ ] Place Bedrock or the approved model behind the provider-neutral interface.
- [ ] Version prompts and company knowledge independently from generated text.
- [ ] Restrict model output to validated structured proposals and supported
  commands.
- [ ] Test prompt injection, malformed output, sensitive-data handling, timeout,
  retry, and model/provider failure.
- [ ] Require curator approval before saving or exporting a released itinerary.

Completion: model output cannot bypass deterministic constraints, evidence
boundaries, version history, or the human release gate.

## Phase 6 - Weather and POI enrichment

- [ ] Re-verify and select providers only for an approved acceptance scenario.
- [ ] Define freshness, attribution, conflict, and degradation policies.
- [ ] Add latency, cache, quota, and cost observability.
- [ ] Keep live enrichment advisory until the curator accepts it.

Completion: weather and POI data are traceable enhancements, never silent
replacements for warehouse facts.

## Phase 7 - Deployment and operations

- [ ] Define environments, infrastructure as code, secrets, logging, alerting,
  backups, recovery, retention, and incident response.
- [ ] Add integration-contract, security, privacy, performance, and cost gates.
- [ ] Approve deployment and migration plans before any AWS write.

Completion: production readiness is evidenced by tested operational controls, not
only a successful deployment.

## Deferred

- Ride-hailing, public transit, events, tourism trends, flight status, and visa
  providers listed in the diagram.
- Multi-provider failover before one provider contract is proven.
- Automated itinerary release without curator approval.

## Validation policy

Use the closest `AGENTS.md` for commands. Every phase must include focused tests,
`git diff --check`, and an explicit review of skipped checks, costs, side effects,
privacy impact, and generated artifacts.
