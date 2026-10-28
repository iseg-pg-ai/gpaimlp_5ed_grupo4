# BLU AI System

Projeto do Grupo 4 da 5.ª edição da Pós-Graduação em Artificial Intelligence & Machine Learning do ISEG. O sistema transforma fontes BLU num warehouse auditável e apoia a criação, revisão e exportação de propostas de itinerário. DMC significa *Destination Management Company*.

## Componentes

| Componente | Responsabilidade | Porta no Code Editor |
| --- | --- | --- |
| ETL | Ingestão, validação e publicação do warehouse | — |
| DMC Workspace | Briefing, catálogo, curadoria, versões e propostas | 3001 |
| Leads / Concierge | Pré-visualização do site e qualificação inicial | 5173 |
| Apresentação | Pitch comercial ilustrativo para viajantes e parceiros | 3003 |
| BLU Operations | Monitoring privado, incidentes e contas locais | 3004 |
| Assistente BLU | Planeador Python transacional integrado no portal | — |
| Observatório | Análise Streamlit, só de leitura | 8501 |

As cinco interfaces seguem `config/workspace_interfaces.json`. O agente não tem porta HTTP própria. O site público e os recursos AWS de Leads/Backoffice são uma fronteira distinta da pré-visualização local.

## Requisitos

- Python 3.12 ou 3.13.
- Node.js >=22.13 e <25, preferindo Node 24 LTS; npm e Git.
- `uv` 0.12.19; PowerShell apenas para os scripts Windows.
- No SageMaker, role IAM com acesso aos recursos autorizados do ambiente.

`pyproject.toml` e `uv.lock` definem Python; cada projeto Node tem `package.json` e `package-lock.json`. Requirements são exports gerados, não fontes de edição.
Ver [dependências Python](docs/DEPENDABOT_PYTHON.md).

## Preparar um ambiente

No SageMaker Code Editor, seguir o [guia único de inicialização](docs/ONBOARDING.md): cobre uma instalação nova ou um segundo Space, desde o clone até à abertura dos cinco dashboards no navegador.

O ambiente AWS é um **SageMaker Studio Code Editor (Space)**. Os comandos podem ser executados pelo **VS Code remoto** ligado a esse ambiente; para abrir os dashboards pelo proxy AWS, usar o **Code Editor web no navegador**. São dois acessos ao mesmo ambiente, com encaminhamentos de portas distintos.
O guia cobre clone, Node, Python, IAM, configuração e recuperação S3.

A instalação Python base contém apenas o ETL. Para o ambiente completo, na raiz:

```bash
python3 -m pip install --user uv==0.12.19
export PATH="$HOME/.local/bin:$PATH"
uv sync --locked --all-groups
```

Os grupos opcionais são `dashboard`, `agent` e `translation`. Modelos de tradução e fontes CJK são recursos locais separados; `npm ci` não os instala.

## Arrancar o sistema

Num ambiente preparado e com cache válida:

```bash
./bin/just blu up
```

Para recuperação integral, com autenticação interativa de administrador do Monitoring e autorização para os efeitos S3:

```bash
./bin/just blu it
```

| Comando | Comportamento |
| --- | --- |
| `blu up` | Mantém serviços ativos, inicia os parados, verifica cinco endpoints e pede abertura das cinco interfaces |
| `blu it` | Protege o estado com checkpoint, para serviços, recupera/materializa dados, testa, constrói e reinicia |

`just blu up` e `just blu it` são equivalentes quando o launcher está no `PATH`.
Os detalhes, efeitos, falhas e recuperação estão em [Operações](docs/OPERATIONS.md#recuperação-local).

No Code Editor, **BLU · Interfaces** usa o encaminhamento da sessão web atual.
O domínio é descoberto por metadados e `sagemaker:DescribeSpace`; não copiar um `studio-id` entre workspaces. A ausência de sessão web pode deixar a abertura pendente mesmo com os serviços saudáveis. Fora do SageMaker, `config/studio.local.json` é a alternativa local de configuração.

## Dados e persistência

As fontes, warehouse, catálogo, histórico e PDFs autoritativos pertencem às releases S3. A execução materializa uma cache em `/tmp`; o Git não é backup.
`BLU_DATA_DIR`, `BLU_WAREHOUSE_DIR`, `BLU_EXPORT_DIR` e `BLU_OPERATIONAL_DIR` selecionam essa cache. O portal escreve no catálogo operacional; o ETL publica o warehouse sem modificar fontes ou versões guardadas.

Os rascunhos e preferências do navegador não são versões autoritativas.
Segredos, modelos, fontes CJK, runtimes e dados operacionais ficam fora do Git.
Ver [Dados e ETL](docs/DATA_PIPELINE.md) e [retenção S3](docs/S3_RETENTION.md).

## Verificação

```bash
python3 scripts/check_project.py
```

As baterias Python, Node, navegador e PDF e a preparação de dados sintéticos estão em [Testes](docs/TESTING.md). Um build aprovado ou HTTP 200 não comprova o fluxo completo, disponibilidade de fornecedores ou operação entre máquinas.

## Documentação

A documentação descreve o comportamento existente e os seus limites. Código, testes e manifests prevalecem sobre exemplos e resultados históricos. O destino atual é operação individual no SageMaker Code Editor em `eu-west-1`.

### Como escolher o documento

| Necessidade | Documento responsável |
| --- | --- |
| Inicializar o projeto e abrir os cinco dashboards | [Guia de inicialização](docs/ONBOARDING.md) |
| Entender fronteiras e contratos | [Arquitetura](docs/ARCHITECTURE.md) |
| Arrancar, recuperar e operar | [Operações](docs/OPERATIONS.md) |
| Executar verificações com dados isolados | [Testes](docs/TESTING.md) |
| Compreender a fundamentação das decisões | [Decisões](docs/DECISIONS.md) |
| Identificar pendências de entrega | [Operações](docs/OPERATIONS.md#pendências-para-produção) |

### Dados e análise

| Documento | Âmbito |
| --- | --- |
| [Dados e ETL](docs/DATA_PIPELINE.md) | Fontes, publicação, cache, S3 e estado operacional |
| [Modelo de dados](reports/data_model_report.md) | Entidades, grão, chaves e modelos analíticos |
| [Dataset complementar](docs/DATA_PIPELINE.md#dataset-estruturado-complementar) | Integração exata do suplemento e tratamento de conflitos |
| [Catálogo operacional](docs/DATA_PIPELINE.md#catálogo-editável) | Base editável e relação com o warehouse |
| [Observatório](docs/OBSERVATORY.md) | Normalização, evidência, validade e fotografias |
| [Dashboard Streamlit](dashboard/README.md) | Execução e interação da aplicação analítica original |
| [Critérios de enriquecimento](docs/DECISIONS.md#fontes-qualidade-e-publicação-do-warehouse) | Razões para exigir chaves exatas, evidência e validade por campo |
| [Retenção S3](docs/S3_RETENTION.md) | Política proposta, fronteira administrativa e validação manual |

### Portal, agente e dependências

| Documento | Âmbito |
| --- | --- |
| [Portal](docs/PORTAL.md) | Utilização, catálogo, propostas, versões, TXT/PDF e resolução de problemas |
| [Entrada do DMC Workspace](dmc-workspace/README.md) | Comandos locais e ligações para os contratos do portal |
| [Assistente transacional](docs/ASSISTANT.md) | Âmbito funcional, contrato, ferramentas, autoridade e configuração |
| [Dependências Python](docs/DEPENDABOT_PYTHON.md) | Grupos, CPU, override Argos/Stanza e manutenção dos exports |

### Monitoring e infraestrutura

| Documento | Âmbito |
| --- | --- |
| [BLU Operations](monitoring/README.md) | Contas, painel, sinais, backups e transporte de alertas |
| [Runbook](docs/MONITORING_RUNBOOK.md) | Resposta a incidentes e limites da deteção local |
| [Arquitetura AWS separada](infra/SPLIT_ARCHITECTURE.md) | Data, site público, eventos, WhatsApp e Backoffice |
| [Alternativa ECS](infra/CURATION_WORKSPACE.md) | Parâmetros e contrato do hosting cloud de curadoria |
| [Entrega de imagem](infra/IMAGE_DELIVERY.md) | OCI, SBOM, assinatura, publicação ECR e referência de rollback |

Uma síntese ou build não comprova deployment. O hosting ECS e a imagem ECR não são requisitos de arranque do destino Code Editor escolhido.

### Apresentação, demonstrações e canais

| Documento | Âmbito |
| --- | --- |
| [Apresentação](presentation/README.md) | Execução, controlos, isolamento e testes da narrativa |
| [Guião editorial](docs/APRESENTACAO.md) | Pitch de seis momentos e encerramentos para viajantes e parceiros |
| [Demo do assistente](docs/DEMO_CHATBOT_SCRIPT.md) | Percurso ilustrativo de curadoria com confirmação humana |
| [Demo E2E](docs/DEMO_E2E.md) | Concierge, consentimento, eventos e seguimento no portal |
| [Site BLU](frontend/blu-cloud-site/README.md) | Pré-visualização, configuração pública, build e testes |
| [QA visual](frontend/blu-cloud-site/README.md#verificação-visual-e-funcional) | Critérios de comparação e evidência reproduzível |
| [Ponte social](infra/SPLIT_ARCHITECTURE.md#ponte-social-de-campanhas) | Campanhas, referência BLU e passagem para WhatsApp |
| [Proveniência](infra/SPLIT_ARCHITECTURE.md#proveniência-do-addon) | Autoria e proveniência do addon de canais |

### Propostas e instruções de desenvolvimento

[API de Leads](docs/LEADS_API.md) e [Intranet](docs/INTRANET.md) são propostas de novas fronteiras autenticadas. Não são manuais de stacks já implementadas. As páginas Leads existentes não equivalem à API ou SPA propostas.

[AGENTS.md](AGENTS.md) e os ficheiros homónimos de cada área são instruções de desenvolvimento, não guias de produto. `dmc-workspace/CLAUDE.md` delega nessas instruções. Instalação e operação mantêm uma entrada de referência por fluxo.

## Limites atuais

O sistema produz propostas e documentos, sem efetuar reservas ou confirmar preços, disponibilidade ou compatibilidade automaticamente. O curador revê e aceita as alterações do [assistente transacional](docs/ASSISTANT.md).

O destino escolhido é operação individual no Code Editor em `eu-west-1`.
O portal depende do acesso privado do Studio; o login do Monitoring protege apenas esse painel. A implementação ALB/Cognito é uma alternativa cloud, sem ativação implícita neste destino. Monitoring externo e aceitação operacional mantêm as pendências indicadas no plano e no runbook.
