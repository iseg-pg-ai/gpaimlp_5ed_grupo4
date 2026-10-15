# Estrutura e fronteiras de execução

Revisto em 2026-10-08 contra o checkout local de main, commit f090e53.
As entradas indicadas abaixo existem na pasta atual.

## Fluxo

```text
data/ (Excel, suplementos e PDFs protegidos)
data/portal/catalog.sqlite (catálogo editável com revisões)
  -> etl.pipeline (extração, integração, validação e publicação atómica)
  -> warehouse/ (JSONL, relatórios JSON e SQLite)
     -> dashboard/app.py (análise Streamlit)
     -> dmc-workspace/ (briefing, catálogo, proposta e confirmações)
        -> localStorage (rascunhos/UI)
        -> exports/itineraries/ (histórico autoritativo e PDFs)
```

O portal importa oferta existente para revisão e guarda edições na fonte
operacional. O ETL publica as revisões; o portal não edita diretamente o warehouse.

## Entradas

| Área | Entrada | Responsabilidade |
| --- | --- | --- |
| Fontes | etl/sources.py | Catálogo Excel, suplementos, referências e PDFs |
| Publicação | etl/pipeline.py | Linhagem, validação, analytics e rollback |
| Enriquecimento | etl/structured.py | Preencher lacunas e auditar conflitos |
| Catálogo operacional | etl/portal_catalog.py | Leitura SQLite e integração de revisões |
| Análise | dashboard/app.py | Consumir warehouse e relatório |
| Portal | src/app/page.tsx, src/hooks/useWorkspace.ts | Briefing, propostas e estado |
| Catálogo | src/app/catalog/page.tsx, src/lib/catalog-store.ts | Editor, revisões e histórico |
| Curadoria | src/lib/curation.ts, src/lib/published-catalog.ts | Seleção explicável de oferta aprovada |
| Horários | src/lib/itinerary-scheduling.ts | Durações, conflitos e margens estimadas |
| Confirmações | src/lib/activity-confirmation.ts | Dados e evidência manual |
| Assistente | src/lib/assistant-editing.ts | Comandos com restrições/proteções |
| Versões | src/lib/version-store.ts | Concorrência, snapshots, hashes e PDFs |
| Orçamento | src/lib/proposal-budget.ts | Custos, pendências e moedas |
| TXT Canva | src/lib/itinerary-prompt.ts, src/app/api/versions/route.ts | JSON de versão guardada e download TXT |
| Tradução | translations/worker.py, src/lib/local-translation.ts | Subprocesso Python offline |

Caminhos src/ pertencem a dmc-workspace/. APIs atuais em src/app/api/:
catalog, catalog/publish, catalog/itinerary, dataset, itineraries, assistant,
versions e translate.

## Propriedade

- data/: fontes protegidas; exceção de escrita do editor em data/portal/.
- warehouse/: entrega gerada exclusivamente pelo ETL.
- config/curation_rule_overrides.json: overrides revistos.
- config/prompts/roteiro-visual-canva.txt: instruções de composição do TXT.
- plugins/blu-curadoria/: pacote do plugin privado com dependência Canva.
- data/portal/catalog.sqlite: catálogo operacional fora do Git; requer backup.
- exports/itineraries/history.sqlite: versões autoritativas.
- exports/itineraries/<id>/: snapshots/PDFs materializados fora do Git.
- localStorage: rascunhos/UI; não substitui histórico.
- reports/: relatórios; scripts/: automação e experiências isoladas.
- graphify-out/: ausente no checkout; grafo antigo preservado apenas no backup.

O ETL lê uma fotografia consistente e regista revisões consumidas.
Importações não sobrescrevem edições do portal. Reexportações reutilizam bytes;
mudanças no catálogo não alteram versões antigas.

## Validação e operações

tests/ cobre fontes, enriquecimento e publicação.
dmc-workspace/tests/ cobre domínio, catálogo, confirmações, horários, orçamento,
validação, versões e apresentação PDF; tests/browser/ cobre fluxos de navegador.
translations/test_worker.py cobre tradução.

.github/workflows/data-pipeline.yml verifica dependências, reconstrói e valida
warehouse, executa regressões e publica o artefacto.
.github/workflows/documentation.yml valida Markdown.
Não foi encontrado workflow de CI do frontend nesta revisão.

scripts/run_full_pipeline.ps1 prepara/verifica a pipeline;
scripts/start_dashboard.ps1 inicia Streamlit.
Ver AUTOMATION.md e docs/PORTAL.md para execução e backups.
