# ETL local: `data` → `warehouse`

O diretório `data/` é a origem local que representa o futuro bucket S3. A pipeline
descobre ficheiros Excel e PDF recursivamente, valida os dados e publica um
warehouse completo. A origem nunca é alterada.

## Execução

Na raiz do repositório:

```powershell
.\.venv\Scripts\python.exe -B -m etl.pipeline --data-dir data --output-dir warehouse
```

Ou executar o fluxo completo, incluindo instalação e testes:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run_full_pipeline.ps1
```

Para um ambiente já preparado:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run_full_pipeline.ps1 -SkipInstall
```

## Contrato de entrada

- Um Excel principal é reconhecido pelas folhas `ATRACOES` e
  `REGRAS_CURADORIA`.
- O complemento estruturado é reconhecido pelas folhas `Roteiros`,
  `Atracoes_base` e `Precos_propostas`, independentemente do nome ou subpasta.
- Outros Excel são preservados em `source_workbook_rows`; não são convertidos
  automaticamente em catálogo operacional.
- Cada PDF gera um registo de documento e registos por página, mantendo ficheiro,
  página e texto extraído para rastreabilidade.
- Ficheiros temporários de Excel são ignorados.

Origem e saída não podem coincidir nem estar contidas uma na outra.

## Publicação

A pipeline escreve primeiro numa pasta temporária ao lado do destino. O warehouse
operacional só é substituído depois de a validação terminar com sucesso. Em caso
de falha durante a troca, a versão anterior é reposta.

Principais artefactos:

| Artefacto | Conteúdo |
| --- | --- |
| `manifest.json` | Fontes, hashes SHA-256, tamanhos, papéis e contagens. |
| `blu_etl.sqlite` | Entrega SQLite usada pelo dashboard. |
| `*.jsonl` | Exportações por entidade e fontes estruturadas. |
| `validation_report.json` | Resultado da validação e métricas de completude. |
| `data_quality_issues.jsonl` | Problemas de qualidade detetados. |
| `kpis.json` | Indicadores do catálogo, preços e propostas. |
| `analytical_models.json` | Definições dos modelos analíticos. |
| `model_*.jsonl` | Scores explicáveis de prontidão e complexidade. |

O `warehouse/` é uma entrega gerada. Não deve ser editado manualmente.

## Dataset estruturado complementar

Quando `data/reference/structured_dataset.xlsx` está presente, as suas folhas são
publicadas como `structured_*`. As bases complementam o catálogo apenas por chave
exata e sem substituir valores existentes. Divergências e alterações ficam em
`structured_merge_conflicts` e `structured_merge_changes`.

Roteiros, viajantes e preços históricos permanecem fontes de referência; não são
reservas, disponibilidade ou tarifas atuais. Consulte a
[política do dataset complementar](data/reference/README.md).

## Catálogo editável

O portal guarda alterações em `data/portal/catalog.sqlite`. Durante a execução, o
ETL incorpora apenas revisões aprovadas, preservando IDs e histórico. O portal lê
sempre a oferta publicada no warehouse para gerar itinerários. Consulte o
[contrato do catálogo local](data/portal/README.md).

## Validação e testes

```powershell
.\.venv\Scripts\python.exe -B -m unittest `
  tests.test_local_source `
  tests.test_structured_dataset `
  tests.test_portal_catalog `
  tests.test_etl_pipeline -v
```

Os testes usam diretórios temporários e não reescrevem o warehouse operacional.

## Evolução para S3

O adaptador S3 ainda não está implementado. A futura camada de origem deverá
listar e descarregar objetos para uma área local controlada e entregá-los à mesma
pipeline. A transformação e a validação não devem depender do transporte.

## Documentação relacionada

- [Automação e operações](AUTOMATION.md)
- [Modelo de dados](reports/data_model_report.md)
- [DMC Workspace](docs/PORTAL.md)
