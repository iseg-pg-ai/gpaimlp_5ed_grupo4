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

Para uma recuperação integral autenticada:

```bash
just blu it
```

Depois de validar uma conta `admin` do Monitoring, o comando para os serviços,
prepara dependências, inicializa um clone novo ou recupera dados existentes,
executa testes, constrói o portal, reinicia o sistema e abre as interfaces. Os
detalhes e limites estão no
[guia de operações](docs/OPERATIONS.md#recuperação-local).

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
