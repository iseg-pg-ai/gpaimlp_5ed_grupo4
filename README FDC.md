# BLU AI System

> Projeto do Grupo 4 da 5.ª edição da Pós-Graduação em Artificial Intelligence &
Machine Learning do ISEG.

## Introdução

O BLU AI System é composto ´por 3 componentes:

- **ETL** - transforma fontes de informação BLU locais, arquivando-as num catálogo no warehouse;
- **Portal DMC (Destination Management Company)** - usa esse catálogo para explorar as ofertas e criar, rever, versionar e exportar propostas de itinerário;
- **Canva (OpenAI)** - importa e formata visualmente em estilo BLU a proposta de itinerário. Após revisão humana e exporta para pdf.

## Componentes

| Componente | Responsabilidade | Porta |
| --- | --- | --- |
| ETL e `warehouse/` | Ingestão, validação e publicação atómica dos dados | — |
| DMC Workspace | Portal Next.js de curadoria e entrega | 3001 |
| Apresentação | Narrativa interativa independente | 3003 |
| BLU Operations | Monitoring privado e gestão de utilizadores | 3004 |
| Agente de IA | API FastAPI opcional com integração Bedrock | 8000 |
| Observatório | Dashboard analítico Streamlit, só de leitura | 8501 |

As fontes, o catálogo editável, as versões, os PDFs e o warehouse são arquivados em
releases S3. O arranque cria uma cache temporária em `/tmp`; segredos,
runtimes e dados operacionais não são partilhados pelo Git.

## Requisitos

- Python 3.12 ou 3.13;
- git
- uv 0.12.19;
- `pyproject.toml`, `uv.lock`, `package.json`, `package-lock.json` e
`requirements.txt` - consultar o [guia de dependências Python](docs/DEPENDABOT_PYTHON.md) antes de os usar ou
regenerar.
- PowerShell/bash para os scripts destinados a Windows / Linux&Mac.
- Framework Next.js - construção da aplicação web com React;
- Ambiente Node.js >=22.13 e <25, preferencialmente Node 24 LTS;
- Gestão de pacotes Node.js (npm);

## Preparar o ambiente

Via terminal, criar `<pasta-de-projecto>` e entrar na mesma.

```bash
mkdir <pasta-de-projecto>
cd <pasta-de-projecto>
```

Repor código git:

```bash
git pull https://github.com/iseg-pg-ai/gpaimlp_5ed_grupo4.git .
```

## Instalação

### Bibliotecas

Na pasta de projecto, executar:

```bash
pip install uv==0.12.19

# node.js 24
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc # reinicia o terminal
nvm install 24
node -v # Verificação - mostra v.24.xx.x

# python -m uv sync --locked
```

\#FDC è necessário 2x o sync --locked ??

Instalação de bibliotecas para as componente dashboard, agent e translation:

```bash
uv sync --locked --all-groups
```

Alternativa: instalação individual por componente:
>
> - uv sync --locked --inexact --group dashboard
> - uv sync --locked --inexact --group agent
> - uv sync --locked --inexact --group translation
> - uv run python translations/setup_models.py

### Activar ambiente uv

- linux

  ```bash
  source .venv/bin/activate
  ```

- ou windows

  ```powershell
  .\.venv\Scripts\Activate.ps1 
  ```

### Preparar o lançamento do portal

Identificar previamente o `<studio-id>` associado ao Code Editor.
<br>
Exemplo: `<studio-id>`=ekg16an0qsybxru

Substituir <studio-id> no comando abaixo e executar num terminal novo:

```bash
uv run python3 scripts/setup_workspace.py \
  --studio-url "https://<studio-id>.studio.eu-west-1.sagemaker.aws/codeeditor/default"
```

```bash
uv run python3 scripts/setup_workspace.py \
  --studio-url "https://ekg16an0qsybxru.studio.eu-west-1.sagemaker.aws/codeeditor/default"
```

> Nota:
>
> - Num clone de sistema sem dados locais, o [guia de onboarding](docs/ONBOARDING.md) descreve a preparação do ambiente e o `./bin/just blu it` materializa as releases S3 autorizadas.
> - A configuração partilhável do agente está em `.env.example`.
> - Também é possível usar `./bin/just blu it` sem instalar o launcher no `PATH`.
> - O assistente valida o ambiente, guarda a URL em `config/studio.local.json`;
> - Instala o launcher local e cria o administrador inicial do Monitoring quando ainda não existem contas;
> - A palavra-passe inicial fica em `monitoring/runtime/initial-password.txt` e deve ser substituída após o primeiro login;
> - A gestão de contas está documentada no [guia de Monitoring](monitoring/README.md#gerir-utilizadores-na-página).

<br>

## Lançar o "Sistema"

Exitem 2 opções:

- Uso diário: Quando a informação já existe carregada em catálogo;
- Inicialização ou recuperação/reset do Catálogo.

### Para o uso diário

Executar:

```bash
./bin/just blu up
```

Notas:

- O comando mantém serviços ativos, inicia os que estejam parados, confirma os
cinco endpoints e abre as quatro interfaces;
- A porta técnica 8000 é validada,
mas não abre um separador.
- Este arranque rápido não cria checkpoints, não recupera backups e não para
processos ativos. Essas ações pertencem exclusivamente ao `just blu it`;

- Os launchers carregam estas chaves reconhecidas a partir do `.env` local, sem
executar o ficheiro como código;
- Valores já exportados no terminal prevalecem;

\#FDC - Esta infor deve passar para secção recuperação

```text
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
```

### Para inicialização ou recuperação integral

Executar:

```bash
just blu it
```

\#FDC deveria estar no Onboarding.md

```text
Detalhe do funcionamento:
  - Caso não tenha sido feito, criar conta de admin;
  - Depois de validar uma conta `admin` do Monitoring, o comando pára os serviços,
prepara dependências, inicializa um clone novo ou recupera dados existentes,
executa testes, constrói o portal, reinicia o sistema e abre as interfaces.
  -  Os detalhes e limites estão no
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
```

## Operações individuais

\#FDC - Incluir contexto . O termo Operações é adequado ?

- ETL e warehouse: [dados e operações](docs/DATA_PIPELINE.md).
- Portal: [guia do DMC Workspace](docs/PORTAL.md).
- Observatório: [contratos analíticos](docs/OBSERVATORY.md).
- Monitoring e recuperação: [BLU Operations](monitoring/README.md).
- Apresentação: [execução e controlos](presentation/README.md).

\#FDC este comentário deveria estar em Observatory.md

```text
O Observatório permite explorar a oferta, destinos, preços, histórico e qualidade
da entrega publicada. É uma ferramenta de consulta para a curadoria; não edita o
warehouse nem confirma disponibilidade, reservas ou preços.
```

## Verificação

Verificar estrutura e ligações locais, sem instalar dependências:

```bash
uv run python scripts/check_project.py
```

(#FDC ??) As baterias (??) dependem da área alterada. Os comandos atuais e os requisitos dos
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

## Limites atuais do Portal DMC

\#FDC Proponho retirar daqui e passar para a ppt ??

- O portal produz propostas e documentos;
- Não efetua reservas nem confirma automaticamente preços, disponibilidade, acessibilidade ou condições alimentares;
- Sem autenticação própria e sem sincronização multiutilizador;
- O login do Monitoring protege apenas o painel operacional.

## Assistente transacional

\#FDC ??

- O fluxo **proposta → pré-visualização → aceitação explícita** usa os contratos
atuais de [docs/ASSISTANT.md](docs/ASSISTANT.md);
- A rota anterior de assistência
permanece como entrada de compatibilidade para este mesmo fluxo;
- O monitoring não autoriza execução implícita nem chamadas reais a fornecedores.
