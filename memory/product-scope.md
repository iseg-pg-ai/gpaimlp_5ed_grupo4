# Product scope: current system and target architecture

Last verified: 2026-09-29

## Product goal

Help a travel designer turn a traveler brief and BLU company knowledge into an
explainable, editable itinerary, while preserving data lineage, operational
constraints, and immutable proposal history.

## Current implementation

| Capability | Status | Evidence |
| --- | --- | --- |
| Local Excel/PDF ingestion | Implemented | `etl/sources.py`, `etl/pipeline.py` |
| Validated JSONL/SQLite warehouse | Implemented | `etl/validation.py`, `warehouse/manifest.json` |
| KPI and model reporting | Implemented | `etl/analytics.py`, `dashboard/app.py` |
| Traveler brief and deterministic curation | Implemented locally | `dmc-workspace/src/lib/curation.ts` |
| Explainable rule IDs and overrides | Implemented | `warehouse/curation_rules.jsonl`, `config/curation_rule_overrides.json` |
| Itinerary edits, versions, and PDF exports | Implemented locally | `dmc-workspace/src/lib/version-store.ts` |
| Local multilingual portal/PDF translation | Optional implementation | `translations/`, DMC translation route |
| Google Forms/Sheets intake | Not implemented in this checkout | Mentioned in README; no service code present |
| S3-backed source or storage | Target only | Supplied project diagram; no wired adapter |
| Bedrock itinerary agent | Prototype only | `scripts/bedrock.py` is not wired into the application |
| Live route provider | Prototype only | Google Distance Matrix scripts are not wired into curation |
| Live weather and POI providers | Target only | Supplied project diagram |
| AWS deployment/infrastructure | Not implemented in this checkout | No infrastructure directory or deploy workflow |

## Target flow from the supplied diagram

```text
Traveler
  -> Google Forms intake
  -> S3-backed data boundary
  -> Bedrock agent
       + BLU company data and response prompt
       + routing APIs
       + weather APIs
       + attraction/restaurant/POI APIs
  -> curator-facing application
  -> itinerary changes and saved versions
```

The diagram labels the local presentation layer as Streamlit. The repository
also contains a substantially richer Next.js DMC Workspace. Which UI is the
primary operational product remains an explicit decision; do not duplicate the
same workflow in both by default.

## Integration candidates from the supplied diagram

The diagram lists the following as essential candidates:

- Google Distance Matrix for travel time and traffic;
- Geoapify Routing for incline, altitude, and physical effort;
- Google Places for attractions, restaurants, hours, reviews, and photos;
- OpenWeatherMap for forecasts and outdoor-activity adjustments;
- OpenAI API for conversation-to-traveler-profile extraction.

It also places Bedrock at the center of the target agent architecture. The role
of OpenAI versus Bedrock is therefore unresolved. API names, availability,
licensing, coverage, and pricing must be re-verified before implementation; the
PDF is scope evidence, not a live provider contract.

## Recommended MVP boundary

Build one end-to-end path around a normalized `TravelerBrief` and a versioned
`Itinerary` contract:

1. Accept one brief through a provider-neutral intake interface.
2. Curate from the existing validated warehouse with explicit rule evidence.
3. Persist an immutable version and export it through the DMC Workspace.
4. Add agent and provider adapters behind contracts, beginning with mocked
   routing/weather/POI responses.
5. Add Google Forms and S3 only after the local contract and acceptance tests
   are stable.

## Non-negotiable product constraints

- A human curator remains the acceptance gate for generated itineraries.
- Mobility, allergy, dietary, timing, budget, and explicit exclusion rules are
  safety/quality constraints, not decorative metadata.
- External provider failures must degrade explicitly; do not invent live
  availability, prices, weather, travel times, or accessibility guarantees.
- Company knowledge and source provenance must remain distinguishable from
  generated text.
- Customer data, credentials, and exports must not enter prompts, logs, memory,
  or Git without an approved privacy design.
