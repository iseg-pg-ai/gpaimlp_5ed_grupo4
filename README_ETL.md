# Ingestão local: data → ETL → warehouse

```powershell
.\.venv\Scripts\python.exe -B -m etl.pipeline --data-dir data --output-dir warehouse
```

`data/` é a origem bruta local que representa, por enquanto, o futuro bucket.
O adaptador `etl/sources.py` descobre recursivamente Excel e PDF e regista chave
relativa, papel, tamanho e SHA-256 de cada ficheiro no `warehouse/manifest.json`.
Não há chamadas AWS nem necessidade de credenciais.

- Um Excel principal é identificado pelas folhas `ATRACOES` e `REGRAS_CURADORIA`.
- Até um complemento estruturado é identificado pelas folhas `Roteiros`, `Atracoes_base` e `Precos_propostas`, independentemente do nome ou subpasta.
- Outros Excel são preservados em `source_workbook_rows`, sem inferir equivalência com o catálogo.
- PDFs de todas as subpastas alimentam documentos e páginas. Ficheiros temporários de Excel são ignorados.
- JSONL, SQLite, indicadores, modelos e relatórios são gerados numa pasta temporária ao lado da saída. Só após validação bem-sucedida se substitui o warehouse, com reposição do anterior se a troca falhar. Uma leitura simultânea pode necessitar de nova tentativa durante a troca de diretórios.
- A origem nunca é alterada. Origem e saída não podem coincidir nem estar uma dentro da outra.

O DMC Workspace continua a ler exclusivamente `warehouse/`. As propostas já
guardadas no navegador não são regeneradas automaticamente.

Quando se acrescentar S3, a camada de origem deverá listar/descarregar os objetos
para uma área local e fornecer os ficheiros ao mesmo ETL. O adaptador S3 ainda não
está implementado; esta separação mantém a transformação independente do transporte.

## Documentação anterior e detalhes dos artefactos

# Local data ETL

Run the complete, deterministic ingestion from the repository root:

```powershell
.\.venv\Scripts\python.exe -m etl.pipeline --data-dir data --output-dir warehouse
```

The pipeline processes every `.xlsx` and `.pdf` below `data/`.

- Excel sheets become normalized JSONL files and SQLite tables. The two structures in `REGRAS_CURADORIA` are split into `curation_principles` and `curation_rules`.
- Each PDF becomes a document record containing extracted text and discoverable contacts, URLs and price mentions; every PDF page is separately loaded for traceability and search.
- `warehouse/manifest.json` reports input coverage, row counts and non-fatal PDF extraction failures.
- `warehouse/blu_etl.sqlite` is the queryable delivery. Use `sqlite3 warehouse/blu_etl.sqlite ".tables"` to inspect it.
- `warehouse/validation_report.json` and `data_quality_issues.jsonl` are created first; they report completeness, duplicate IDs, invalid coordinates, and broken PDF-page links.
- `warehouse/kpis.json` then reports catalog, pricing, proposal, and data-quality KPIs.
- `warehouse/model_catalog_readiness.jsonl` and `model_proposal_complexity.jsonl` contain transparent analytical scores. Their scoring definitions are in `analytical_models.json`.

The pipeline only reads `data/` and fully recreates the selected output directory on each run, preventing stale records after source changes.

## Dashboard

After running the ETL, launch the dashboard with:

```powershell
.\.venv\Scripts\streamlit.exe run dashboard\app.py
```

It reads the SQLite warehouse and the validation/KPI/model artifacts. The warehouse data-model documentation is in `reports/data_model_report.md`.

## Automation and operations

Use `powershell -ExecutionPolicy Bypass -File .\scripts\run_full_pipeline.ps1` for the complete automated local workflow. See [AUTOMATION.md](AUTOMATION.md) for the full operating guide, CI behavior, validation gate, data flow, dashboard commands, and troubleshooting.

## Dataset estruturado complementar

A pipeline importa também `data/reference/structured_dataset.xlsx`, quando presente.
As bases complementam o catálogo por chave, apenas nos campos ausentes; conflitos
ficam auditados e os valores originais são preservados. As propostas e os preços
históricos são carregados separadamente em `structured_*` (JSONL e SQLite).
Consulte [a política de integração](data/reference/README.md). O DMC Workspace usa
o catálogo enriquecido e disponibiliza as referências históricas em `/references`.

Teste isolado, sem reescrever o warehouse:

```powershell
.\.venv\Scripts\python.exe -B -m unittest tests.test_structured_dataset -v
```
