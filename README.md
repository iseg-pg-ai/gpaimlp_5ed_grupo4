# BLU AI System

Projeto do Grupo 4 da 5.ª edição da Pós-Graduação em Artificial Intelligence &
Machine Learning do ISEG.

O sistema transforma fontes locais num warehouse auditável e usa esse catálogo
para explorar a oferta e criar, rever, versionar e exportar propostas de
itinerário. Neste contexto, DMC significa *Destination Management Company*.

## Componentes

| Componente | Responsabilidade | Porta |
| --- | --- | --- |
| ETL e `warehouse/` | Ingestão, validação e publicação atómica dos dados | — |
| DMC Workspace | Portal Next.js de curadoria e entrega | 3001 |
| Apresentação | Narrativa interativa independente | 3003 |
| BLU Operations | Monitoring privado e gestão de utilizadores | 3004 |
| Agente de IA | API FastAPI opcional com integração Bedrock | 8000 |
| Observatório | Dashboard analítico Streamlit, só de leitura | 8501 |

As fontes estão em `data/`; o catálogo editável em
`data/portal/catalog.sqlite`; e as versões e PDFs autoritativos em
`exports/itineraries/`. Segredos, runtimes e dados operacionais locais não são
partilhados pelo Git.

## Requisitos

- Python 3.12 ou 3.13;
- Node.js >=22.13 e <25, preferencialmente Node 24 LTS;
- npm, Git e `uv` 0.12.19;
- PowerShell apenas para os scripts destinados a Windows.

## Preparar um ambiente

Na raiz do repositório:

```bash
python -m pip install uv==0.12.19
python -m uv sync --locked
```

A instalação base contém o ETL. Preparar todos os componentes Python para
desenvolvimento ou recuperação integral com:

```bash
uv sync --locked --all-groups
```

Os grupos `dashboard`, `agent` e `translation` também podem ser instalados
individualmente com `uv sync --locked --inexact --group NOME`. Depois de instalar
`translation`, executar `python translations/setup_models.py`. O portal tem
dependências próprias, instaladas com `npm ci` em `dmc-workspace/`.

O `pyproject.toml`, `uv.lock`, `package.json` e `package-lock.json` são as
fontes das dependências. Os ficheiros `requirements.txt` são exports; consultar a
[nota de dependências Python](docs/DEPENDABOT_PYTHON.md) antes de os usar ou
regenerar.

Num SageMaker Code Editor novo, seguir o
[guia de onboarding](docs/ONBOARDING.md) ou executar:

```bash
python3 scripts/setup_workspace.py \
  --studio-url "https://<studio-id>.studio.eu-west-1.sagemaker.aws/codeeditor/default"
```

Num clone sem dados locais, o [guia de onboarding](docs/ONBOARDING.md) inclui
`--initialize-data` para criar o catálogo e a pasta de itinerários a partir dos
ficheiros versionados. A configuração partilhável do agente está em `.env.example`.
Também é possível usar `./bin/just blu it` sem instalar o launcher no `PATH`.

O assistente valida o ambiente, guarda a URL em `config/studio.local.json`,
instala o launcher local e cria o administrador inicial do Monitoring quando
ainda não existem contas. A palavra-passe inicial fica apenas em
`monitoring/runtime/initial-password.txt` e deve ser substituída após o primeiro
login. A gestão de contas está documentada no
[guia de Monitoring](monitoring/README.md#gerir-utilizadores-na-página).

## Arrancar o sistema

Para o uso diário num ambiente já preparado:

```bash
just blu up
```

O comando mantém serviços ativos, inicia os que estejam parados, confirma os
cinco endpoints e abre as quatro interfaces. A porta técnica 8000 é validada,
mas não abre um separador.

Antes do arranque, recupera ficheiros em falta do último backup verificado e
guarda uma nova cópia em `/home/blu-system-backups/sagemaker-user` neste ambiente
(por defeito, `blu-system-backups/<nome-do-projeto>` ao lado do projeto).
É possível escolher outro destino fora do projeto com `BLU_BACKUP_DIR`.
O destino deve permitir escrita pelo utilizador que executa o comando.
As cópias incluem `data/`, `warehouse/`, `exports/` e ficheiros JSON, JSONL e
SQLite persistentes diretamente em `monitoring/runtime/`, incluindo contas.
São privadas, verificadas por SHA-256 e acumuladas sem eliminação automática.
SQLite usa a API de backup para incluir transações confirmadas no WAL.
Ficheiros existentes têm prioridade; dados em falta são recuperados sem repetir
o ETL. Rascunhos do navegador, dependências, builds e credenciais AWS não entram
nestas cópias. Uma cópia com serviços ativos não garante uma transação conjunta
entre catálogo e exports; evitar edições durante o comando.

Para uma recuperação integral autenticada:

```bash
just blu it
```

Depois de validar uma conta `admin` do Monitoring, o comando para os serviços,
prepara dependências, inicializa um clone novo ou recupera dados existentes,
executa testes, constrói o portal, reinicia o sistema e abre as interfaces. Os
detalhes e limites estão no
[guia de operações](docs/OPERATIONS.md#recuperação-local).

O `just blu it` também guarda e verifica um backup antes de parar os serviços;
uma falha impede a paragem. Depois de parar, guarda outra cópia do estado estável.
O `just blu up` continua a preservar os serviços que já estão ativos.

Quando executados num terminal interativo do VS Code/SageMaker, ambos os comandos
abrem o Codex num **novo terminal em split**, ao lado do Bash de origem. O painel
fica em baixo para apresentar Bash à esquerda e Codex à direita. O Bash volta a
ficar disponível; um terminal Codex já aberto pela integração é reutilizado.
O Codex CLI tem de estar instalado e autenticado nesse ambiente e não recebe
nenhum pedido inicial. Sair do Codex com `/quit` mantém os serviços ativos.

A integração usa a extensão local `scripts/vscode-terminal/`, instalada por
`scripts/install_just_blu_it.sh`. Num ambiente que já tinha o launcher instalado,
executar uma vez:

```bash
python3 scripts/vscode_terminal.py --install
```

Se o editor não ativar a extensão imediatamente, usar **Developer: Reload Window**.
A instalação usa apenas fontes do repositório, sem dependências do Marketplace.
Sem integração disponível, o comando informa como a instalar e deixa o Bash livre.
Para arrancar sem abrir o Codex, usar `BLU_CODEX_AUTO=0 just blu up` ou
`BLU_CODEX_AUTO=0 just blu it`. Execuções com entrada ou saída redirecionada
não abrem terminais. Esta integração é específica do VS Code em Linux.

O SageMaker pode exigir a renovação da sessão pela consola AWS; os comandos não
conseguem renovar tokens externos expirados.

## Operações individuais

- ETL e warehouse: [dados e operações](docs/DATA_PIPELINE.md).
- Portal: [guia do DMC Workspace](docs/PORTAL.md).
- Observatório: [contratos analíticos](docs/OBSERVATORY.md).
- Monitoring e recuperação: [BLU Operations](monitoring/README.md).
- Apresentação: [execução e controlos](presentation/README.md).

O Observatório permite explorar a oferta, destinos, preços, histórico e qualidade
da entrega publicada. É uma ferramenta de consulta para a curadoria; não edita o
warehouse nem confirma disponibilidade, reservas ou preços.

## Verificação

Verificar estrutura e ligações locais sem instalar dependências:

```bash
python scripts/check_project.py
```

As baterias dependem da área alterada. Os comandos atuais e os requisitos dos
testes de navegador estão em [docs/TESTING.md](docs/TESTING.md).

## Documentação

- [Arquitetura e âmbito](docs/ARCHITECTURE.md)
- [Preparar um novo ambiente](docs/ONBOARDING.md)
- [Dados e ETL](docs/DATA_PIPELINE.md)
- [Portal](docs/PORTAL.md)
- [Monitoring e deployment](docs/OPERATIONS.md)
- [Testes](docs/TESTING.md)
- [Plano ativo](PLAN.md)
- [Decisões históricas](docs/DECISIONS.md)

## Limites atuais

O portal produz propostas e documentos; não efetua reservas nem confirma
automaticamente preços, disponibilidade, acessibilidade ou condições alimentares.
O portal não tem autenticação própria nem sincronização multiutilizador. O login
do Monitoring protege apenas o painel operacional. A publicação em produção,
identidade central, backups externos e alertas externos continuam por definir.

## Assistente transacional — Fase 2

O fluxo proposta → pré-visualização → aceitação explícita usa os contratos
atuais de [docs/ASSISTANT.md](docs/ASSISTANT.md). A rota anterior de assistência
permanece como entrada de compatibilidade para este mesmo fluxo. O monitoring
não autoriza execução implícita, Fase 3 ou chamadas reais a fornecedores.

## Guia anterior preservado — 2026-10-22

Registo histórico do guia deste branch, preservado durante a integração.
As instruções atuais de preparação e arranque estão nas secções acima.

### BLU AI System

Sistema de curadoria de viagens: transforma fontes locais num warehouse auditável
e permite criar, rever, versionar e exportar itinerários no portal operacional.

#### Componentes

- `data/`: fontes Excel/PDF e catálogo operacional, preservando a proveniência.
- `etl/`: ingestão, validação e publicação do warehouse com rollback.
- `warehouse/`: entrega gerada pelo ETL; não editar manualmente.
- `dashboard/`: observatório analítico Streamlit, de leitura.
- `dmc-workspace/`: portal Next.js para briefing, catálogo, itinerários e exportações.
- `src/blu_ai/`: agente legado opcional; o novo fluxo transacional está em preparação.
- `translations/`: tradução local dos conteúdos exportados.
- `exports/itineraries/`: versões e PDFs operacionais, fora do Git.

#### Preparar o ambiente

Usar Python 3.12 ou 3.13, Node.js >=22.13 e <25 (preferindo 24 LTS) e uv instalado.
Os manifests e lockfiles são as fontes de dependências; não alterar os exports pip à mão.

Na raiz do projeto, preparar apenas a base ETL:

```powershell
uv sync --locked --python 3.12
```

Os grupos opcionais atuais são `dashboard`, `agent` e `translation`.
Para desenvolver e verificar o conjunto:

```powershell
uv sync --locked --all-groups --python 3.12
```

`uv sync` pode remover grupos não selecionados; usar todos os grupos necessários
ou `--inexact` quando se pretende conservar os pacotes adicionais já instalados.
Não existem grupos `dev` ou `sagemaker` neste checkout.

A tradução exige também os modelos locais, preparados separadamente por
`translations/setup_models.py`. Antes de instalar, consultar a
[exceção de compatibilidade Argos/Stanza](docs/DEPENDABOT_PYTHON.md).
Os testes com mocks não demonstram que os modelos estejam instalados.

Alternativa pip para a base e o grafo de tradução exportado:

```powershell
python -m pip install -r requirements.txt
python -m pip install --no-deps -r translations/requirements.txt
```

Preferir uv para respeitar o override Stanza. Ao manter dependências, o script
`scripts/export_requirements.py` exige que o interpretador usado tenha o módulo
`uv` instalado; suporta `--check` para detetar exports desatualizados.

#### Dados e arranque

O percurso é `data/` → ETL → `warehouse/` → observatório e portal. A publicação
valida a entrega antes de substituir o destino e preserva rollback. Executar
apenas quando se pretende atualizar o warehouse:

```powershell
.\.venv\Scripts\python.exe -B -m etl.pipeline --data-dir data --output-dir warehouse
```

Nos testes usar fontes copiadas e destinos temporários separados, nunca a
entrega operacional. Consultar [dados e operações](docs/DATA_PIPELINE.md).

Para iniciar o portal:

```powershell
cd dmc-workspace
npm ci
npm run dev -- -p 3001
```

Abrir [http://localhost:3001](http://localhost:3001). O Python do portal pode ser
indicado por `BLU_PYTHON`; a tradução usa `BLU_TRANSLATION_PYTHON`.
As versões e PDFs usam `BLU_EXPORT_DIR` ou `exports/itineraries/` por defeito.
O [guia do portal](dmc-workspace/README.md) descreve SageMaker, proxy e fontes CJK.

O dashboard analítico pode ser iniciado, com o grupo `dashboard` instalado:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start_dashboard.ps1
```

O agente legado é opcional. O seu código existente não comprova a implementação
do fluxo proposta → pré-visualização → aceitação → versão. Confirmar o
[estado da arquitetura](docs/ARCHITECTURE.md) e o [plano](PLAN.md).

#### Verificações

Na raiz, usando a `.venv` preparada:

```powershell
.\.venv\Scripts\python.exe -B scripts/check_project.py
$env:PYTHONPATH = "src"
.\.venv\Scripts\python.exe -B -m unittest discover -s tests -v
.\.venv\Scripts\python.exe -B -m unittest translations.test_worker -v
```

No portal:

```powershell
cd dmc-workspace
npm run check
npm run build
npm run test:catalog-etl
```

Nos outros sistemas usar o executável equivalente em `.venv/bin/python`.
Os testes de navegador exigem o portal e configuração próprios. PDF real,
tradução real e acesso SageMaker/Bedrock são verificações separadas dos mocks.
Ver [testes e limitações](docs/TESTING.md).

#### Documentação e limites

- [Como trabalhar neste projeto](AIREADME.md).
- [Arquitetura e âmbito](docs/ARCHITECTURE.md).
- [Portal operacional](docs/PORTAL.md).
- [Dados e operações](docs/DATA_PIPELINE.md).
- [Decisões](docs/DECISIONS.md).
- [Plano de evolução](PLAN.md).

O portal não confirma automaticamente disponibilidade, reservas, preços finais,
acessibilidade ou condições alimentares. Propostas e pendências exigem revisão
humana. Preservar fontes, histórico, atividades protegidas e credenciais.

#### Assistente de itinerário — Fase 2

O fluxo de propostas com aceitação explícita, configuração privada e limites
está em [docs/ASSISTANT.md](docs/ASSISTANT.md). A exportação TXT mantém o
contrato atual para o Canva. Testes com fornecedor simulado não substituem
a avaliação real aprovada numa fase posterior.
