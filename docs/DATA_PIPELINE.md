# ETL local: `data` → `warehouse`

O diretório `data/` é a origem local que representa o futuro bucket S3. A pipeline
descobre ficheiros Excel e PDF recursivamente, valida os dados e publica um
warehouse completo. A origem nunca é alterada.

## Gerar ou atualizar o warehouse

Na raiz do repositório:

```bash
uv run python -B -m etl.pipeline --data-dir data --output-dir warehouse
```

No Windows também pode ser usado
`.\.venv\Scripts\python.exe -B -m etl.pipeline --data-dir data --output-dir warehouse`.
O fluxo com instalação, validação e testes está em
[Automação e operações](#automação-e-operações).

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
| `model_*.jsonl` | Scores explicáveis, destinos/unidades harmonizados e evidência por campo. |

O `warehouse/` é uma entrega gerada. Não deve ser editado manualmente.

## Dataset estruturado complementar

Quando `data/reference/structured_dataset.xlsx` está presente, as suas folhas são
publicadas como `structured_*`. As bases complementam o catálogo apenas por chave
exata e sem substituir valores existentes. Divergências e alterações ficam em
`structured_merge_conflicts` e `structured_merge_changes`.

Roteiros, viajantes e preços históricos permanecem fontes de referência; não são
reservas, disponibilidade ou tarifas atuais. Consulte a
[política do dataset complementar](../data/reference/README.md).

## Catálogo editável

O portal guarda alterações em `data/portal/catalog.sqlite`. Durante a execução, o
ETL incorpora apenas revisões aprovadas, preservando IDs e histórico. O portal lê
sempre a oferta publicada no warehouse para gerar itinerários. Consulte o
[contrato do catálogo local](../data/portal/README.md).

Esta base e `exports/itineraries/history.sqlite` são operacionais e não pertencem
ao ciclo de vida do ETL. Recriar `warehouse/` não as remove. Os deployments devem
montar `data/portal/` e `exports/` em armazenamento persistente separado do
container. Se uma base SQLite operacional estiver temporariamente indisponível,
as novas versões ou revisões ficam em JSON sob `BLU_OPERATIONAL_DIR` e são
sincronizadas de forma idempotente quando a base regressa.

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

- [Operações e recuperação](OPERATIONS.md)
- [Modelo de dados](../reports/data_model_report.md)
- [DMC Workspace](PORTAL.md)

## Automação e operações

### Fluxo local completo

Na raiz do repositório:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run_full_pipeline.ps1
```

O script:

1. cria `.venv`, caso não exista;
2. instala as dependências fixadas em `requirements.txt`;
3. executa o ETL, a validação, os KPIs e os modelos analíticos;
4. exige `status: passed` em `warehouse/validation_report.json`;
5. compila os módulos Python e executa os testes de regressão do ETL.

Para ignorar a instalação num ambiente atualizado:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run_full_pipeline.ps1 -SkipInstall
```

Para usar outros diretórios:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run_full_pipeline.ps1 `
  -DataDirectory data `
  -OutputDirectory warehouse
```

### Dashboard analítico

Instalar o componente opcional: `uv sync --locked --inexact --group dashboard`.

Depois de publicar o warehouse:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start_dashboard.ps1
```

Abrir [http://localhost:8501](http://localhost:8501). Para escolher outra porta:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start_dashboard.ps1 -Port 8502
```

O dashboard lê os artefactos gerados e não edita as fontes. Os contratos de
normalização, confirmação por campo, validade e fotografias estão no
[guia do Observatório](OBSERVATORY.md).

### Integração contínua

O workflow `.github/workflows/data-pipeline.yml` é executado quando mudam dados,
ETL, dashboard, testes, dependências ou scripts. Valida o lock e os exports de
dependências, reconstrói o warehouse, executa a validação e os testes e publica o
artefacto `blu-warehouse`.

Não existe atualização agendada das fontes. Um agendamento só deve ser criado
depois de serem definidos a cadência, a origem e o processo de aprovação.

### Recuperação e resolução de problemas

- **`.venv` em falta:** executar o fluxo completo sem `-SkipInstall`.
- **Falha de instalação:** confirmar acesso à Internet e repetir a instalação.
- **Validação falhou:** consultar `warehouse/validation_report.json` e
  `warehouse/data_quality_issues.jsonl`, corrigir a fonte e repetir o ETL.
- **Dashboard sem warehouse:** executar primeiro a pipeline.
- **Portal sem catálogo aprovado:** rever o catálogo e voltar a publicar pelo ETL.
- **Tradução local indisponível:** instalar o grupo `translation` e executar
  `translations/setup_models.py`.

### Cópias de segurança

- Fazer backup de `exports/itineraries/` para preservar versões e PDFs.
- Fazer backup de `exports/portal-persistence/` enquanto existirem operações pendentes.
- Fazer backup de `data/portal/catalog.sqlite` com o portal e o ETL parados.
- Não guardar segredos, credenciais ou ficheiros `.env` no Git.
- Não tratar `warehouse/` como fonte editável.

Consulte também o [guia do portal](PORTAL.md) e o
[plano de operações](OPERATIONS.md).
