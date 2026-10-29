# DMC Workspace guidance

This is the operational itinerary workspace. It reads the warehouse and runtime
paths selected by the `BLU_*_DIR` variables plus
`../config/curation_rule_overrides.json`. In SageMaker these paths point to a
temporary cache materialized from the authoritative S3 release.

The existing `src/components/NewTripScreen.tsx` form is the version 1.0 intake
baseline. Keep intake, curation, review, versioning, and export in this curator
workspace; do not introduce Google Forms or a separate intake application.

## Boundaries

- Keep `src/lib/curation.ts` deterministic and explainable. It is rule-based
  domain logic, not an autonomous model agent.
- Browser `localStorage` is draft/UI state. SQLite and write-once files under
  `BLU_EXPORT_DIR` are the runtime representation; the active operational S3
  release is the permanent source of truth.
- Preserve `baseVersion` conflict checks, immutable snapshots, parent links,
  snapshot/hash-chain semantics, write-once files, and persisted PDF bytes.
- Keep portal localization separate from itinerary translation:
  `src/i18n/messages.json` is the checked-in UI catalogue; runtime itinerary
  translation goes through `../translations/worker.py`.
- Regenerate the UI catalogue from `../translations/ui_sources.json` and
  `../translations/ui_overrides.json`; do not hand-edit generated translations.
- API errors must be sanitized. Never log traveler briefs or raw translation
  requests. Server diagnostics may identify error categories, not customer text.
- PDF changes require rendered inspection of every affected language. Chinese
  output also requires the configured CJK font/face.

Relevant environment variables are `BLU_EXPORT_DIR`, `BLU_TRANSLATION_PYTHON`,
`BLU_PDF_FONT`, `BLU_PDF_CJK_FONT`, and `BLU_PDF_CJK_FACE`.

## Apresentação de produção

- Não apresentar códigos de regras, IDs técnicos ou hashes aos utilizadores normais.
  Preservá-los nos contratos internos, no histórico e nos snapshots.
- Manter visíveis as fontes públicas úteis, as pendências, as condições e os estados
  de confirmação; não transformar a limpeza visual em confirmação implícita.
- PDFs guardados são imutáveis. Ajustes de apresentação aplicam-se aos novos PDFs;
  o Prompt TXT conserva o seu contrato próprio.

## Validation

From this directory:

```powershell
npm.cmd ci
npm.cmd test
npx.cmd tsc --noEmit --incremental false
npm.cmd run lint
npm.cmd run build
```

Add desktop/mobile browser smoke tests for UI changes. Version-store changes need
concurrency, duplicate-save, hash-chain, and repeatable-export coverage. Translation
changes also follow `../translations/AGENTS.md`.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
