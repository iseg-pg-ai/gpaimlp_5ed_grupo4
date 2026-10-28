# ETL: S3 → cache temporária → S3

O bucket de dados é a origem permanente. O `just blu it` descarrega a release
`sources` para uma área temporária, descobre os Excel e PDF, valida os dados e
publica um warehouse completo na cache e numa nova release S3. A origem nunca é
alterada.

## Gerar ou atualizar o warehouse

Para uma execução manual, na raiz do repositório:

```bash
.venv/bin/python -B -m etl.cloud_runtime --destination /tmp/blu-runtime-manual
```

O comando cloud pode publicar recursos S3 e exige o ambiente e a autorização
correspondentes. Para transformação estritamente local, usar `etl.pipeline`
sobre fontes e destinos explicitamente escolhidos; não executar uma regeneração
operacional apenas para testar código.
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

O `BLU_WAREHOUSE_DIR` é uma entrega gerada na cache. Não deve ser editado
manualmente nem versionado.

## Dataset estruturado complementar

`data/reference/structured_dataset.xlsx` é o suplemento fornecido pelo utilizador
na release de fontes. Quando materializado, mantém a identidade do original;
não deve ser editado durante o onboarding. A pipeline importa-o em conjunto com
o Excel principal, quando presente, sem alterar os ficheiros de origem.

- As folhas, incluindo guias e auditorias, são preservadas como `structured_*`.
- `Atracoes_base`, `Restaurantes_base`, `Experiencias_base` e `Precos_base`
  complementam o catálogo por chave exata: preenchem lacunas e acrescentam chaves
  novas, sem substituir valores existentes.
- Divergências ficam em `structured_merge_conflicts`; alterações em
  `structured_merge_changes`. A linhagem identifica ficheiro, folha e linha.
- IDs duplicados, chaves em falta ou referências quebradas interrompem a
  importação antes da substituição do warehouse.
- Roteiros, viajantes, menções e preços históricos continuam separados da oferta
  atual: não são reservas, disponibilidade ou tarifas vigentes.
- `Regras_BLU` conserva a versão documental; regras operacionais e tiers seguem
  a origem principal e os overrides em `config/curation_rule_overrides.json`.

O manifesto inclui hash, contagens por folha e balanço da integração. O conteúdo
dos guias é tratado como dados, nunca como instruções. O portal consome o catálogo
enriquecido; a consulta técnica permanece em `portal/data.py`. A rota antiga
`/references` redireciona para `/catalog`, sem página autónoma na navegação normal.

## Catálogo editável

O portal guarda alterações em `BLU_DATA_DIR/portal/catalog.sqlite`. Durante a execução, o
ETL incorpora apenas revisões aprovadas, preservando IDs e histórico. O portal lê
sempre a oferta publicada no warehouse para gerar itinerários.

A pasta `data/portal/` no checkout é apenas o caminho local de compatibilidade;
no SageMaker, a base é materializada na cache selecionada por `BLU_DATA_DIR`.
Criar, rever e aprovar oferta no [portal](PORTAL.md#catálogo) antes da publicação.
Não editar o warehouse, copiar SQLite durante escritas ou usar o Git como backup.

Esta base e `BLU_EXPORT_DIR/history.sqlite` são operacionais e não pertencem ao
ciclo de vida do ETL. Recriar o warehouse não as remove. O deployment guarda o
estado permanente em releases S3 e reconstrói uma cache SQLite temporária. Se uma
base SQLite operacional estiver temporariamente indisponível,
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

## Origem ETL em S3

O transporte S3 dos checkpoints operacionais permanece independente do ETL. O
bucket de dados recebe releases imutáveis de `sources` e `warehouse`, separadas
por ambiente, tipo e data. Cada ficheiro tem SHA-256 e o manifesto da release é
publicado por último; a ausência desse manifesto significa que a publicação não
está completa.

As fontes incluem apenas Excel e PDF inventariados por `LocalSource`. Excluem
explicitamente `data/portal/catalog.sqlite`, que é estado operacional protegido
pelos checkpoints. O warehouse só pode ser publicado quando
`validation_report.json` e `manifest.json` confirmam `passed`.

```bash
.venv/bin/python -B -m etl.s3_transport publish sources --path data
.venv/bin/python -B -m etl.s3_transport publish warehouse --path warehouse
```

Uma recuperação descarrega para um diretório novo ou vazio e confirma manifesto,
tamanho e hash de todos os objetos antes de publicar a pasta local:

```bash
.venv/bin/python -B -m etl.s3_transport fetch-latest sources --path /tmp/blu-sources
.venv/bin/python -B -m etl.s3_transport fetch-latest warehouse --path /tmp/blu-warehouse
```

Antes de definir retenção, o inventário de releases identifica a release válida
ativa, as releases válidas substituídas e manifestos inválidos, sem escrever ou
eliminar objetos:

```bash
.venv/bin/python -B -m etl.s3_transport inventory sources
.venv/bin/python -B -m etl.s3_transport inventory warehouse
```

A classificação usa a mesma validação de integridade da recuperação. Não concede
por si só autorização para apagar releases substituídas.

O adaptador usa `BLU_DATA_S3_BUCKET`, `BLU_ENVIRONMENT` e o IAM do ambiente. Não
guarda credenciais nem elimina objetos. A transformação e a validação continuam
independentes do transporte.

A role da aplicação valida objetos dentro dos prefixos autorizados, mas não
administra Versioning, Default Encryption, Block Public Access ou lifecycle. Um
`AccessDenied` nesses controlos é esperado e não deve ser contornado dando
permissões administrativas ao ETL. As exceções e o procedimento manual estão em
[Retenção dos buckets S3](S3_RETENTION.md#exceções-e-validações-manuais).

Antes de uma alteração no catálogo ou nas versões chegar ao commit SQLite, é
criado um write-ahead validado em `BLU_OPERATIONAL_DIR/pending-*`. Depois do
commit, esse registo origina o evento em `data-s3-outbox/` e só então é removido.
Assim, uma interrupção entre o commit e a outbox é retomada sem duplicar a revisão.
O evento contém a operação completa necessária à recuperação, com identificador
idempotente. O ciclo do Monitoring e o arranque enviam-no para
`operational-changes/`; o ficheiro local só é removido depois de `PutObject` e
`HeadObject` confirmarem tamanho, AES-256 e SHA-256.

### Estado operacional do portal

O destino final usa o bucket de dados como persistência permanente. Como o S3
não executa SQLite, `etl.operational_s3` publica snapshots consistentes do
catálogo e do histórico, juntamente com propostas PDF e filas pendentes. Os
objetos da release são imutáveis; `operational/current.json` identifica a release
ativa e o versionamento do bucket conserva as revisões anteriores.

```bash
.venv/bin/python -B -m etl.operational_s3 publish \
  --catalog data/portal/catalog.sqlite \
  --exports exports/itineraries \
  --pending exports/portal-persistence

.venv/bin/python -B -m etl.operational_s3 materialize \
  --destination /tmp/blu-runtime
```

A materialização valida manifesto, tamanho, SHA-256 e integridade SQLite antes
de trocar atomicamente a cache. O launcher exporta os caminhos da cache para
todos os consumidores.

Uma operação do catálogo ou das versões protege primeiro o pedido no write-ahead,
confirma a transação SQLite da cache, cria a outbox idempotente e publica uma nova
snapshot operacional. Se SQLite estiver indisponível, o pedido permanece pendente;
se o processo parar depois do commit, a repetição reconhece a operação SQL e
completa a outbox. Se o S3 falhar, o evento permanece na outbox. A sincronização
respeita a ordem e só remove cada registo depois da confirmação seguinte.

Esta garantia cobre falhas do processo e reinícios enquanto
`BLU_OPERATIONAL_DIR` sobreviver. No SageMaker atual, a perda total da cache antes da publicação S3 pode perder
operações ainda locais. O objetivo cloud histórico de cinco minutos não comprova
uma garantia de RPO nesta instalação. A alternativa ECS usa EFS persistente;
a sua existência em código não equivale a deployment ou ensaio de recuperação.

Enviar uma versão para o Lixo conserva-a na release ativa com `trashedAt`.
Uma eliminação permanente retira-a apenas da release ativa seguinte; releases e
checkpoints anteriores não são apagados automaticamente.

## Documentação relacionada

- [Operações e recuperação](OPERATIONS.md)
- [Retenção dos buckets S3](S3_RETENTION.md)
- [Modelo de dados](../reports/data_model_report.md)
- [DMC Workspace](PORTAL.md)

## Automação e operações

O CI não descarrega fontes reais do S3 nem recebe credenciais AWS. Em Windows,
`scripts/create_ci_etl_fixture.py` cria um catálogo exclusivamente sintético num
diretório temporário e o workflow executa sobre ele o ETL, o gate de validação e
os testes de regressão. O artefacto `blu-warehouse-ci-smoke` comprova o percurso
técnico, mas não é uma entrega de dados BLU e nunca deve ser publicado como
warehouse operacional.

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
artefacto sintético `blu-warehouse-ci-smoke`, retido durante 14 dias.

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

No SageMaker, usar `just blu it`: o launcher cria um checkpoint consistente do
catálogo, histórico, PDFs e operações pendentes, valida-o e confirma a cópia no
bucket de backups antes de parar os serviços. O bucket de dados conserva as
releases autoritativas de fontes, warehouse e estado operacional.

`monitoring.checkpoint` permite criar, verificar ou restaurar uma versão
identificada manualmente. Não copiar bases SQLite enquanto os serviços escrevem,
não guardar segredos no Git e não tratar `warehouse/` como fonte editável. Ver o
[procedimento de recuperação](OPERATIONS.md#recuperação-local).

Consulte também o [guia do portal](PORTAL.md) e o
[plano de operações](OPERATIONS.md).
