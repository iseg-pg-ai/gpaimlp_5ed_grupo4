# BLU AI System

Projeto final do Grupo 4 da 5.ª edição da Pós-Graduação em AI & Machine
Learning do ISEG.

**Equipa:** Fernando, Gisela, Henrique, Manuel e Pedro.

O BLU AI System ajuda um designer de viagens a transformar um briefing num
roteiro explicável, editável e versionado. A implementação atual funciona
localmente: ingere ficheiros Excel e PDF, publica um warehouse validado,
apresenta análises em Streamlit e disponibiliza um workspace operacional em
Next.js para curadoria, revisão e exportação de itinerários.

## Estado atual

Estão implementados:

- ingestão local recursiva de Excel e PDF, com proveniência dos dados;
- enriquecimento estruturado, validação e publicação atómica do warehouse;
- KPIs e modelos analíticos transparentes;
- dashboard analítico em Streamlit;
- captação do briefing dentro do workspace de curadoria;
- curadoria determinística baseada no catálogo e em regras identificáveis;
- edição humana, histórico imutável, hashes encadeados e controlo de conflitos;
- exportação de PDFs persistidos e reproduzíveis;
- tradução local opcional do portal e dos PDFs.

Não estão ligados à aplicação serviços S3, Bedrock, meteorologia, pontos de
interesse ou routing em tempo real. Os scripts em `scripts/bedrock.py`,
`scripts/distancias.py` e `scripts/processar_pontos.py` são experiências
isoladas. A evolução prevista encontra-se em [PLAN.md](PLAN.md).

## Arquitetura local

```text
data/
  -> etl.pipeline
  -> warehouse/
       -> dashboard/app.py          (análise em Streamlit)
       -> dmc-workspace/            (curadoria operacional em Next.js)
            -> exports/             (versões, PDFs e cache de tradução)
```

- `data/` contém as fontes protegidas e é lido pelo ETL.
- `warehouse/` é regenerado pelo pipeline; não deve ser editado manualmente.
- `dashboard/` consome o warehouse apenas para análise.
- `dmc-workspace/` lê o warehouse e aplica as regras revistas em
  `config/curation_rule_overrides.json`.
- `exports/` guarda estado operacional local e não pertence ao Git.

O estado temporário da interface fica no `localStorage` do navegador. O
histórico autoritativo das versões e os PDFs ficam em SQLite e em ficheiros de
escrita única sob `exports/itineraries/` ou `BLU_EXPORT_DIR`.

## Requisitos

- Python 3.12 ou 3.13;
- Node.js 24 LTS e npm;
- PowerShell para os scripts de automatização apresentados abaixo.

As dependências Python são definidas em `pyproject.toml` e fixadas em `uv.lock`.
`requirements.txt` e `translations/requirements.txt` são exports gerados. As
dependências frontend são definidas em `dmc-workspace/package.json` e
`dmc-workspace/package-lock.json`.

## Preparar o ambiente Python

Na raiz do repositório:

```powershell
python -m pip install uv==0.12.19
python -m uv sync --locked --group dev
```

O ambiente é criado em `.venv`. Para incluir a tradução local:

```powershell
python -m uv sync --locked --group dev --group translation
.\.venv\Scripts\python.exe -B translations/setup_models.py
```

A instalação inicial dos modelos requer internet. Depois de instalados, a
tradução funciona localmente e não envia os textos para um serviço externo.
Use o grupo `sagemaker` apenas para as experiências que dependem desse SDK:

```powershell
python -m uv sync --locked --group dev --group sagemaker
```

O comando `uv sync` remove pacotes que não pertençam aos grupos selecionados;
inclua todos os grupos necessários no mesmo comando.

## Executar o pipeline

O fluxo completo instala as dependências quando necessário, executa o ETL,
aplica a validação de publicação e corre os testes Python:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run_full_pipeline.ps1
```

Num ambiente já preparado:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run_full_pipeline.ps1 -SkipInstall
```

Também é possível executar apenas o ETL:

```powershell
.\.venv\Scripts\python.exe -B -m etl.pipeline --data-dir data --output-dir warehouse
```

A publicação é feita primeiro numa pasta de staging. Se a construção ou a
substituição falhar, a entrega anterior é preservada ou restaurada.

## Abrir o dashboard analítico

Execute primeiro o pipeline e depois:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start_dashboard.ps1
```

O dashboard fica disponível em [http://localhost:8501](http://localhost:8501).
Para escolher outra porta, acrescente `-Port 8502`.

## Abrir o workspace de curadoria

```powershell
cd dmc-workspace
npm ci
npm run dev -- -p 3001
```

Abra [http://localhost:3001](http://localhost:3001). O workspace permite:

1. preencher o briefing do viajante;
2. gerar uma proposta preliminar a partir do catálogo validado;
3. rever regras aplicadas, avisos e verificações pendentes;
4. editar o roteiro e guardar versões imutáveis;
5. exportar PDFs e consultar o histórico em `/exports`;
6. consultar fontes e divergências estruturadas em `/references`.

Preços, horários, disponibilidade e acessibilidade continuam sujeitos a
confirmação humana. A aplicação não consulta fornecedores externos em tempo
real. Consulte [README_UIMOCK.md](README_UIMOCK.md) para detalhes funcionais.

## Tradução e PDFs localizados

O portal suporta português, inglês, espanhol, francês, alemão e chinês
simplificado. A tradução de conteúdo livre usa um processo Python local e é
opcional. O executável predefinido é `.venv/Scripts/python.exe` no Windows;
`BLU_TRANSLATION_PYTHON` permite indicar outro.

Os modelos ficam em `.tools/translation-models` e a cache fica em
`exports/translations/cache.sqlite`. Para PDFs chineses fora do Windows,
configure `BLU_PDF_CJK_FONT`; para coleções TTC, configure também
`BLU_PDF_CJK_FACE`.

Cada variante linguística é arquivada na primeira exportação. Exportações
seguintes da mesma versão recuperam os mesmos bytes e não criam uma nova versão
do roteiro.

## Validação

Testes Python, a partir da raiz:

```powershell
.\.venv\Scripts\python.exe -B -m unittest tests.test_local_source tests.test_structured_dataset tests.test_etl_pipeline -v
.\.venv\Scripts\python.exe -B -m unittest translations.test_worker -v
```

Validação do workspace:

```powershell
cd dmc-workspace
npm test
npx tsc --noEmit --incremental false
npm run lint
npm run build
```

O workflow `.github/workflows/data-pipeline.yml` valida os locks e exports de
dependências, reconstrói o warehouse, aplica o gate de qualidade, corre os testes
Python e publica o warehouse como artefacto. Ainda não existe um workflow de CI
dedicado ao frontend.

## Estrutura do repositório

| Caminho | Responsabilidade |
| --- | --- |
| `data/` | Excel e PDFs de origem; entrada protegida |
| `etl/` | descoberta, transformação, validação e publicação |
| `warehouse/` | entrega gerada em JSONL, JSON e SQLite |
| `dashboard/` | interface analítica Streamlit |
| `dmc-workspace/` | captação, curadoria, versões e exportação |
| `translations/` | tradução local e catálogo de idiomas do portal |
| `config/` | overrides de regras sujeitos a revisão |
| `tests/` | regressões do pipeline e das fontes locais |
| `scripts/` | automatização e experiências isoladas |
| `memory/` | âmbito, decisões e orientação persistente do projeto |

## Documentação complementar

- [README_ETL.md](README_ETL.md): contrato de dados e operação do pipeline;
- [README_UIMOCK.md](README_UIMOCK.md): workspace de curadoria e PDFs;
- [AUTOMATION.md](AUTOMATION.md): execução local resumida;
- [PLAN.md](PLAN.md): evolução proposta e arquitetura alvo;
- [memory/product-scope.md](memory/product-scope.md): capacidades atuais e limites;
- [memory/repo-layout.md](memory/repo-layout.md): fronteiras de execução e propriedade.

Não coloque credenciais, conteúdo de clientes ou exports operacionais no Git ou
nos logs. Qualquer integração externa deve validar as respostas, preservar a
proveniência e manter a aprovação do curador antes da publicação.
