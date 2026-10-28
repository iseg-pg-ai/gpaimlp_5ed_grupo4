# Operações, monitoring e deployment

Revisto em 28 de outubro de 2026. Este guia descreve a operação existente no SageMaker Code Editor, a recuperação e os seus limites. O destino escolhido é `eu-west-1`, com um único utilizador e responsável e descoberta dinâmica do Space.
A escolha do destino não equivale a aceitação operacional de todos os serviços.

## Destino escolhido para esta entrega

O portal continua no Code Editor, sem exigir domínio próprio, certificado ACM ou ECS. O site e as funções AWS de concierge/Backoffice têm recursos separados.
O código de hosting cloud permanece disponível como alternativa, não como requisito nem como deployment implícito desta entrega.

`scripts/studio_urls.py` resolve o endereço pelos metadados do Code Editor e `sagemaker:DescribeSpace`. Uma falha nesse ambiente não reutiliza um URL antigo.
Fora do SageMaker, `config/studio.local.json` fornece a alternativa local.
O teste da apresentação usa o mesmo resolvedor dos servidores e launchers.

## Mapa de aceitação da entrega completa

| Componente | Execução e acesso | Critério de aceitação |
| --- | --- | --- |
| Portal DMC | Proxy do Code Editor, porta 3001 | Guardar/reabrir, aprovar, TXT/PDF e Lixo com histórico preservado |
| Agente | Subprocesso Python do portal; Bedrock via IAM | Propostas validadas e aceitação humana; edição manual disponível em falha |
| Tradução | Worker e modelos locais | Idiomas, números e fonte CJK validados nos PDFs |
| Observatório | Streamlit 8501 e vista nativa do portal | Leitura do warehouse publicado, sem escritas |
| Apresentação | Servidor estático 3003 | Navegação e link final para o Space atual |
| Monitoring | Servidor 3004, login próprio | Contas, sinais, incidentes e verificação de backups |
| ETL | CLI, sem endpoint público | Publicação validada/atómica e recuperação da entrega anterior |
| Site/concierge | Pré-visualização 5173; infraestrutura pública separada | Contexto, consentimento e endpoints do ambiente corretos |
| Leads | Rotas servidor do portal e DynamoDB existente | Leitura/gestão autorizadas, com dados de ensaio separados |
| Backoffice | Funções AWS invocadas por IAM | Principais autorizados, conhecimento aprovado e revisão humana |

O proxy Studio e a role da máquina não atribuem papéis pessoais ao portal.
No Code Editor, a identidade central está desativada e o Monitoring mantém contas próprias. Não apresentar os testes ALB/Cognito como autenticação ativa.

## Recuperação local

Executar na raiz do projeto:

```bash
./bin/just blu up
```

O arranque diário mantém processos ativos, inicia apenas os parados, verifica cinco endpoints e pede à integração web que abra cinco interfaces. Não cria checkpoints nem recupera dados. Se a cache estiver ausente ou incompleta, pede recuperação integral:

```bash
./bin/just blu it
```

A recuperação exige uma conta ativa `admin` do Monitoring e executa:

1. criação e confirmação remota do checkpoint identificado da execução;
2. paragem dos serviços conhecidos e confirmação das portas livres;
3. recuperação do checkpoint ou das releases S3 autorizadas;
4. preparação das dependências e execução do ETL/validações necessárias;
5. testes Python, Monitoring, portal e interfaces, com falha propagada;
6. build, arranque dos cinco serviços e confirmação dos endpoints;
7. pedido de abertura das cinco interfaces pela sessão web.

Uma falha no checkpoint obrigatório impede a paragem. Uma falha de testes interrompe a etapa correspondente. A ausência de confirmação do editor web pode deixar apenas a abertura pendente, sem transformar serviços saudáveis em falha. O diagnóstico técnico fica em `monitoring/runtime/recovery/just-blu-it.log`, fora do Git.

A barra adapta-se à largura do terminal; uma repetição visual num log copiado não comprova repetição de tarefas ou duplicação de dados. Confirmar o resultado final e o diagnóstico antes de repetir uma recuperação com efeitos S3.

### Exceções que exigem intervenção humana

- O login de recuperação é interativo; não fornecer a credencial ao agente, nem colocá-la em argumentos, variáveis ou logs.
- O ambiente AWS é Code Editor, mesmo quando a edição e os comandos são feitos pelo VS Code remoto. Para os encaminhamentos HTTPS, usar o Code Editor web no navegador: um túnel `localhost` do VS Code remoto não comprova acesso no proxy AWS.
- Após instalar a integração, pode ser necessário **Developer: Reload Window**.
- Os comandos não renovam uma sessão AWS expirada nem criam infraestrutura.
- Administração de buckets, IAM, publicação e chamadas pagas têm autorização própria; ver [retenção S3](S3_RETENTION.md#exceções-e-validações-manuais).

## Persistência e recuperação

| Estado | Fonte permanente | Representação de execução |
| --- | --- | --- |
| Fontes Excel/PDF e suplementos | Release S3 de fontes | `BLU_DATA_DIR` |
| Warehouse publicado | Release S3 validada | `BLU_WAREHOUSE_DIR` |
| Catálogo e histórico | Release S3 operacional | SQLite operacional |
| Versões e PDFs | Release S3 operacional | `BLU_EXPORT_DIR` |
| Escritas por sincronizar | Fila local até confirmação SQL/S3 | `BLU_OPERATIONAL_DIR` |
| Credenciais e sessões Monitoring | Configuração privada da instalação | Runtime local excluído dos checkpoints |
| Rascunhos e preferências | Navegador | `localStorage` |

O ETL não elimina catálogo, versões ou PDFs. Uma versão guardada conserva snapshot, parentesco, hashes e bytes PDF. Reverter código não reverte dados; alterações de esquema exigem um ensaio próprio de compatibilidade.

Cada operação usa identificador idempotente, revisão-base e transação. Pedidos pendentes e eventos da outbox só são removidos depois da confirmação seguinte.
Falhas de rede não autorizam apagar filas nem repetir escritas sem o mesmo contrato.
Ver o percurso completo em [Dados e ETL](DATA_PIPELINE.md#estado-operacional-do-portal).

### Checkpoints

`monitoring.checkpoint` guarda inventário, hashes, SQLite consistente e estado persistente elegível do Monitoring. O contrato atual pode incluir as árvores `data`, `warehouse` e `exports`; não é apenas um backup incremental. Credenciais, sessões e estado privado do editor são excluídos. Evitar edições durante uma cópia: integridade individual SQLite não equivale a uma transação global entre bases e ficheiros.

`BLU_BACKUP_DIR` tem de ficar fora do repositório. Com `BLU_BACKUP_S3_BUCKET`, a cópia é enviada para o prefixo aprovado e validada por tamanho e SHA-256.
Não há eliminação remota automática. A role usa as permissões S3 dos prefixos; com KMS, precisa também das permissões aprovadas da chave.

Criação manual, apenas com o destino já configurado e escritas autorizadas:

```bash
.venv/bin/python -B -m monitoring.checkpoint create --remote-required
```

Restauro manual limitado a ficheiros ausentes:

```bash
read -r -p "Identificador do checkpoint verificado: " BLU_BACKUP_ID
.venv/bin/python -B -m monitoring.checkpoint restore-missing --backup-id "$BLU_BACKUP_ID"
```

Um checkpoint corrompido é rejeitado e o fluxo procura uma cópia válida anterior.
A recuperação do estado ativo e eventual republicação operacional são coordenadas pelo launcher e pelo transporte S3; não substituir bases operacionais manualmente.
A criação/renovação do acesso Monitoring pertence à instalação local.

## Sinais e resposta

O Monitoring agrega disponibilidade local, idade/validação do warehouse, disco, backups, filas, erros reduzidos do portal e consumo de IA quando reportado.
Não guarda prompts, contactos, passwords ou corpos de pedidos nos logs.

| Sinal | Interpretação |
| --- | --- |
| HTTP 200 | O endpoint respondeu; não prova o fluxo completo |
| Warehouse `passed` | Entrega validada; não confirma disponibilidade comercial |
| Backup verificado | Integridade e restauro do âmbito testado |
| SNS entregue | Transporte confirmado; receção e atuação exigem evidência própria |
| Sonda local | Observa componentes locais; não deteta a queda total da máquina |

O transporte SNS tem fila, repetição e deduplicação; a ativação é configuração local por ambiente. O painel e os limiares estão em [Monitoring](../monitoring/README.md); as ações em incidente estão no [runbook](MONITORING_RUNBOOK.md). A fundamentação dos controlos está em [Decisões](DECISIONS.md#monitoring-acesso-às-interfaces-e-limites-operacionais); ensaios antigos não substituem aceitação atual.

## Alternativa de hosting cloud

`infra/curation-workspace.mjs` define ECS com uma task escritora, quatro containers, EFS retido, ALB HTTPS, Cognito e Secrets Manager. Os comandos são partilhados com `config/curation_services.json`. O agente continua subprocesso do portal. Essa alternativa não é ativada pela operação no Code Editor.

Parâmetros, limitações e dimensões para orçamentação estão em [Infraestrutura de curadoria](../infra/CURATION_WORKSPACE.md). Os objetivos e estimativas cloud de 25 de outubro são históricos; não constituem um SLA, um orçamento ou uma autorização vigente para o Code Editor.

### Ligação entre curadoria e Leads

`infra/aws-split-app.mjs` define `BluCostaData`, `BluCostaFrontend` e `BluCostaBackoffice`. O portal atual consulta DynamoDB pelo servidor; a API de Leads autónoma com login próprio é uma [proposta](LEADS_API.md).

No Code Editor, configurar em conjunto `BLU_CONVERSATION_TABLE` e `BLU_INTELLIGENCE_TABLE` no `.env` ignorado pelo Git. Os nomes correspondem aos outputs `ConversationTableName` e `CustomerIntelligenceTableName` da stack Data.
A role precisa de Query nas duas tabelas e no `FollowUpIndex`, e UpdateItem na tabela de inteligência; não inferir acesso a partir de um STS bem-sucedido.

Na alternativa ECS, a stack de curadoria aceita os mesmos nomes, injeta-os apenas no portal e concede essas ações à role partilhada da task. Não há isolamento IAM por container. Configuração parcial ou nomes inválidos são recusados; sem ambos, Leads fica indisponível. Não são criadas tabelas paralelas.

## Fluxo de entrega pretendido

1. Rever o código e identificar um candidato com lockfiles reproduzíveis.
2. Executar testes locais e CI no candidato, com dados sintéticos.
3. Confirmar instalação/recuperação num Space independente e acesso web.
4. Validar os recursos externos com identidade autorizada e dados de teste.
5. Rever traduções, recuperação, orçamento e critérios operacionais.
6. Obter aceitação antes de promover o uso ou publicar recursos.

## Pendências para produção

Continuam por concluir a identificação do commit candidato e a CI final, a reavaliação Dependabot após integração, a aceitação num segundo Space e a confirmação das permissões e recursos AWS de Leads/Backoffice. Faltam também os objetivos RPO/RTO, o orçamento total, a revisão humana das traduções e a aceitação operacional. A revisão documental não fecha estes pontos.

## Pendências de monitoring

Continuam abertas a implementação de uma sonda fora da máquina e a validação de receção e recuperação do canal externo, incluindo o prazo de resposta.
A operação é individual e não foi indicado substituto. Consultar o [runbook](MONITORING_RUNBOOK.md) para diagnóstico e fecho de incidentes.
Não anunciar cobertura total sem sonda externa, receção/atuação dos alertas e evidência de recuperação.
