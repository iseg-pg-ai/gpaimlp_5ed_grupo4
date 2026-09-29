# BLU warehouse data-model report

## Modelling approach

The warehouse uses a pragmatic analytical model: each source worksheet becomes a business entity, and the PDF corpus is represented as a document-to-page relationship. JSONL exports preserve portable, row-level outputs; SQLite provides the query layer used by the dashboard.

| Entity | Grain | Business key | Purpose |
| --- | --- | --- | --- |
| `atracoes` | One attraction | `id` | Curated places for itinerary selection. |
| `restaurantes` | One restaurant | `id_blu` | Dining catalog and operational notes. |
| `experiencias` | One experience | `nome_da_experiencia` | Curated activities and suppliers. |
| `precos` | One price reference | `id` | Reference-price catalog. |
| `curation_principles` | One principle | `id` | High-level decision principles. |
| `curation_rules` | One operational rule | `id` | Rules that guide itinerary curation. |
| `data_request` | One requested data definition | Source row | Data-governance requirements; labels are intentionally not forced unique. |
| `proposal_documents` | One source PDF file instance | `document_id` | Proposal-level metadata, text, and derived search facets. |
| `proposal_pages` | One extracted PDF page | `(document_id, page_number)` | Searchable page text and source traceability. |

## Relationships and lineage

`proposal_documents` has a one-to-many relationship with `proposal_pages` through `document_id`. Every worksheet record retains `_source_sheet` and `_source_row`; every PDF record retains `source_file`, and page records retain `page_number`. The ETL verifies that no orphan page references remain.

The document identifier represents a supplied file instance. `content_sha256` is also retained to enable duplicate-content analysis without collapsing separately supplied files.

## Analytical layer

Two explainable models are materialized after validation:

1. `model_catalog_readiness` scores each attraction, restaurant, and experience by the percentage of fields needed for curation that are populated. It is an operational data-readiness score, not a prediction.
2. `model_proposal_complexity` scores proposal-processing effort using 45% page count, 45% extracted-text volume, and 10% price-reference density. Scores are normalized inside the current proposal corpus.

The KPI layer aggregates catalog coverage, price-reference distributions, proposal extraction coverage, and table completeness. No predictive machine-learning model is fitted because the source data contains no observed outcome or target variable (for example, booking conversion, revenue, satisfaction, or itinerary acceptance).

## Data-quality observations

Structural validation passes: all entity keys are present and unique, coordinates are in valid ranges, and every proposal page belongs to a document. The validation report retains optional-field completeness so operations can prioritize enrichment, especially missing geographic and operational attributes in catalog and price records.
