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

As fontes, o catálogo editável, as versões, os PDFs e o warehouse vivem em
releases S3. O arranque materializa uma cache efémera em `/tmp`; segredos,
runtimes e dados operacionais não são partilhados pelo Git.

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

Num clone sem dados locais, o [guia de onboarding](docs/ONBOARDING.md) prepara o
ambiente e o `just blu it` materializa as releases S3 autorizadas. A configuração
partilhável do agente está em `.env.example`. Também é possível usar
`./bin/just blu it` sem instalar o launcher no `PATH`.

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

Os URLs `/codeeditor/default/ports/PORTA/` exigem que as portas 3001, 3003, 3004
e 8501 estejam registadas no painel **Ports** do Code Editor aberto no browser.
Adicionar portas apenas numa sessão VS Code local/remota cria endereços
`127.0.0.1` e não autoriza o proxy web do SageMaker. Num workspace novo, abrir o
Code Editor pelo browser e adicionar uma vez as quatro portas nesse painel.

Este arranque rápido não cria checkpoints, não recupera backups e não para
processos ativos. Essas ações pertencem exclusivamente ao `just blu it`.

Os launchers carregam estas chaves reconhecidas a partir do `.env` local, sem
executar o ficheiro como código. Valores já exportados no terminal prevalecem.

O bucket de dados é separado dos checkpoints. Releases validadas podem ser
publicadas e recuperadas com `python3 -B -m etl.s3_transport`; os contratos e
comandos estão em [Dados e operações](docs/DATA_PIPELINE.md#origem-etl-em-s3).
O mesmo bucket guarda releases operacionais versionadas do catálogo, itinerários
e propostas. O SQLite é materializado como cache porque o S3 não executa uma base
SQL diretamente. Os launchers apontam todos os consumidores para essa cache.
O percurso de criação, alteração e publicação está em
[Dados e ETL](docs/DATA_PIPELINE.md); checkpoints, recuperação e limites estão em
[Operações](docs/OPERATIONS.md).

O S3 guarda objetos imutáveis por ambiente e data. Sem cópia local válida, o
arranque tenta automaticamente a cópia remota mais recente. Configuração KMS,
permissões mínimas e recuperação manual estão no
[guia de operações](docs/OPERATIONS.md#recuperação-local).

Para uma recuperação integral autenticada:

```bash
just blu it
```

Depois de validar uma conta `admin` do Monitoring, o comando para os serviços,
prepara dependências, inicializa um clone novo ou recupera dados existentes,
executa testes, constrói o portal, reinicia o sistema e abre as interfaces. Os
detalhes e limites estão no
[guia de operações](docs/OPERATIONS.md#recuperação-local).

O `just blu it` cria um identificador único, guarda e confirma no bucket de
backups o checkpoint dessa execução e só depois para os serviços. Recupera essa
cópia específica; se ela não estiver disponível, recupera os ficheiros ausentes
das releases de fontes e warehouse do bucket de dados. Depois prepara e testa o
sistema, sincroniza as operações pendentes, inicia os serviços e abre os
dashboards. Uma falha no backup obrigatório impede a paragem.

A autenticação administrativa é sempre interativa; não colocar a palavra-passe
em variáveis, scripts ou logs. A role da aplicação também não administra
Versioning, encriptação por defeito, Block Public Access ou lifecycle dos buckets.
As exceções e confirmações manuais estão documentadas em
[Retenção dos buckets S3](docs/S3_RETENTION.md#exceções-e-validações-manuais).

O `just blu up` não executa recuperação nem para processos ativos. Inicia apenas
os serviços parados, confirma os cinco endpoints e abre os quatro dashboards.

Cada alteração confirmada do catálogo ou das versões gera também um evento numa
outbox persistente. O Monitoring envia estes eventos de forma idempotente para
`operational-changes/` no bucket de dados e só remove o JSON local depois da
confirmação remota. Falhas de rede mantêm a operação pendente.

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
- [Integração do agente OpenAI/Codex](agente_codex.md)
- [Monitoring e deployment](docs/OPERATIONS.md)
- [Testes](docs/TESTING.md)
- [Plano ativo](PLAN.md)
- [Decisões técnicas vigentes](docs/DECISIONS.md)

## Limites atuais

O portal produz propostas e documentos; não efetua reservas nem confirma
automaticamente preços, disponibilidade, acessibilidade ou condições alimentares.
O portal não tem autenticação própria nem sincronização multiutilizador. O login
do Monitoring protege apenas o painel operacional. A publicação em produção,
identidade central, retenção administrada e alertas externos continuam por definir.

## Assistente transacional

O fluxo proposta → pré-visualização → aceitação explícita usa os contratos
atuais de [docs/ASSISTANT.md](docs/ASSISTANT.md). A rota anterior de assistência
permanece como entrada de compatibilidade para este mesmo fluxo. O monitoring
não autoriza execução implícita nem chamadas reais a fornecedores.
