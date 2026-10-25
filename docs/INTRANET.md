# Especificação da intranet BLU

Estado: **proposta para revisão do grupo, 2026-10-25.** Nada implementado nem
publicado. Complementa a [especificação da API de leads](LEADS_API.md) e o
[plano](../PLAN.md).

## Objetivo

Uma intranet alojada na AWS, só para a equipa BLU, que centraliza o trabalho
de seguimento depois do chat público:

1. **Acompanhamento:** leads, tarefas de seguimento e responsável por cada uma.
2. **Painéis:** indicadores do funil comercial, sem dados sintéticos.
3. **Wiki:** conhecimento operacional aprovado, o mesmo que o Backoffice RAG lê.
4. **Governança e ISO:** controlos, evidências e mapeamento para normas.
5. **Operações:** estado do pipeline (filas, erros, última avaliação diária).

Não-objetivos:

- Não é uma certificação ISO nem afirma conformidade. Mostra controlos e
  evidências com um mapeamento proposto, a validar pelo grupo.
- Não aloja o portal DMC (`dmc-workspace`), o catálogo SQLite, `warehouse/`
  nem as fontes de `data/`; esses continuam locais.
- Não contacta clientes automaticamente nem altera mensagens, percurso ou
  consentimento.
- Não guarda transcrições em bruto na wiki.
- Não cria tabelas novas; reutiliza `BluCostaData` e `BluCostaBackoffice`.

## Arquitetura

```text
Equipa ──▶ CloudFront (intranet) ──▶ S3 privado (SPA estática)
   │ login                               │ chamadas com access token
   ▼                                     ▼
Cognito (MFA, grupos) ◀── JWT ── HTTP API (autorizador JWT, CORS só da intranet)
                                         │
              ┌──────────────┬───────────┼──────────────┬──────────────┐
              ▼              ▼           ▼              ▼              ▼
          leads e        indicadores   wiki         governança     operações
          tarefas        (Query)       (S3 curated) (S3 evidência)  (SQS, CloudWatch)
              └──────── DynamoDB e S3 de BluCostaData / BluCostaBackoffice ┘
```

- **Uma stack nova, `BluCostaIntranet`**, com Cognito, HTTP API, Lambdas por
  módulo e o site estático. A API de leads de [LEADS_API.md](LEADS_API.md)
  passa a ser o primeiro módulo desta API, em vez de uma stack separada; o
  portal local continua a chamá-la pelo servidor.
- **SPA em React e Vite**, como `frontend/blu-cloud-site`, em
  `frontend/intranet/`. É uma entrada nova porque a fronteira cliente/servidor
  é diferente do portal Next.js.
- Cada Lambda tem só as permissões do seu módulo; nenhuma tem `Scan`,
  `DeleteItem` nem curingas de recurso fora do Bedrock.

## Acesso

| Grupo Cognito | Pode |
| --- | --- |
| `curators` | Ver painéis, leads, tarefas, wiki, governança e operações; marcar contactado, etiquetar, assumir tarefas |
| `knowledge-editors` | Propor e editar rascunhos da wiki |
| `governance` | Aprovar páginas da wiki; ver evidências completas |

- Sem registo público; contas criadas pelo grupo. MFA TOTP obrigatório.
- Login gerido do Cognito com código e PKCE. Access token de 1 h, só em
  memória no navegador (nunca `localStorage`, URL ou logs).
- Política de segurança de conteúdo estrita, sem scripts de terceiros; CORS da
  API limitado ao domínio da intranet.
- Cada pedido é autorizado na Lambda pelos grupos do token, não só na SPA.

## Módulos

### 1. Acompanhamento da equipa

- Lista de leads (`open`, `contacted`, vencidos) e detalhe, como na API de
  leads, mais as tarefas que o avaliador diário marca como
  `QUEUED_FOR_REVIEW`.
- **Responsável:** botão «Assumir» grava `assignedTo` (o `sub` Cognito) e
  `assignedAt`; filtro «As minhas tarefas». Estes dois campos entram na lista
  de atributos permitidos da política `UpdateItem`.
- Ações existentes: marcar contactado, etiquetas e nota (até 1 000
  caracteres). Sem apagar registos.
- Pergunta ao Backoffice RAG sobre um lead (`conversationId` + pergunta),
  com a resposta marcada como sugestão para revisão humana.

### 2. Painéis

- Indicadores calculados pela Lambda com `Query` em `FollowUpIndex`, por
  estado: leads abertos, vencidos, contactados, tempo até contacto, etapa do
  percurso e origem de campanha (`socialSource`, `campaign`).
- Registos `synthetic` excluídos, conforme o controlo
  `syntheticExcludedFromBusinessKpis`; o modo demo mostra-os à parte.
- Resposta agregada com cache de 5 minutos; nunca contactos nem texto.
- O observatório de catálogo (`dashboard/`) continua local e fora de âmbito.

### 3. Wiki

- Fonte única: objetos Markdown no bucket de arquivo, prefixo
  `curated/approved/`, o mesmo que o Backoffice RAG já lê. Não há cópia noutro
  sítio.
- Rascunhos em `curated/drafts/`; um membro de `governance` aprova e a Lambda
  copia para `curated/approved/` com autor, aprovador e data em metadados. O
  bucket é versionado, por isso cada versão aprovada fica recuperável.
- Markdown sem HTML em bruto, sanitizado ao apresentar.
- Proibido publicar transcrições, contactos ou dados de clientes; a Lambda
  recusa texto com emails ou telefones (mesmo padrão de `contactDetails`).
- A documentação técnica do projeto continua no Git e não é copiada.

### 4. Governança e ISO

- O manifesto de controlos hoje escrito em `infra/aws-split-app.mjs` passa
  para `config/governance-controls.json`, versionado no Git e publicado no
  bucket de evidências como agora. Uma fonte, duas leituras (stack e
  intranet).
- Cada controlo tem descrição, dono, evidência e um mapeamento **proposto**
  para a ISO/IEC 27001:2022 (Anexo A) e o RGPD, por exemplo:

  | Controlo BLU | Evidência | Mapeamento proposto |
  | --- | --- | --- |
  | Acesso só a principais nomeados | Política de confiança, contas Cognito | 27001 A.5.15, A.5.18 |
  | Consentimento antes de guardar | Evento `lead.consent.granted` | RGPD art. 6.º e 7.º |
  | Sem contacto automático | Manifesto, código do avaliador | Revisão humana (controlo interno) |
  | Registos sem dados pessoais | Logs das Lambdas | 27001 A.8.15 |
  | Recuperação de dados | PITR nas tabelas, buckets versionados | 27001 A.8.13 |

- Lista das evidências em `controls/` (manifestos e execuções do avaliador),
  com data e hash; só leitura.
- Cada página indica: «Mapeamento de apoio à auditoria; não constitui
  certificação.»

### 5. Operações

- Profundidade das filas de eventos, CRM e mensagens falhadas (DLQ).
- Última execução e número de tarefas do avaliador diário.
- Erros das Lambdas nas últimas 24 h (métricas CloudWatch, sem conteúdo).
- Só leitura; nenhuma ação de reprocessamento nesta fase.

## Contrato HTTP

Base: saída `IntranetApiUrl`. Todas as rotas exigem access token; respostas
JSON com `Cache-Control: no-store`, exceto os indicadores.

| Rota | Grupo | Resposta |
| --- | --- | --- |
| `GET /v1/leads?status=` e `GET /v1/leads/{id}` | `curators` | Como em LEADS_API.md |
| `POST /v1/leads/{id}/contacted`, `PUT /v1/leads/{id}/tags` | `curators` | `204` |
| `POST /v1/leads/{id}/assign` | `curators` | `204`; grava `assignedTo` e `assignedAt` |
| `POST /v1/leads/{id}/ask` | `curators` | `200 { "answer", "sourceIds", "requiresHumanApproval" }` via Backoffice RAG |
| `GET /v1/metrics?from=&to=` | `curators` | `200` com contagens agregadas |
| `GET /v1/wiki` e `GET /v1/wiki/{slug}` | `curators` | Índice e página aprovada |
| `PUT /v1/wiki/drafts/{slug}` | `knowledge-editors` | `204` |
| `POST /v1/wiki/drafts/{slug}/approve` | `governance` | `204` |
| `GET /v1/governance/controls` e `/evidence` | `curators` | Manifesto e lista de evidências |
| `GET /v1/operations` | `curators` | Filas, última avaliação e erros |

Erros como em LEADS_API.md (`400`, `401`, `403`, `404`, `429`, `500`), com
mensagens em português.

## Configuração

Entradas da stack: `INTRANET_CALLBACK_URLS`, `INTRANET_LOGOUT_URLS`,
`INTRANET_AUTH_DOMAIN_PREFIX` (opcional). Para o portal local continuam as
URLs de LEADS_API.md. Saídas: `IntranetUrl`, `IntranetApiUrl`,
`IntranetUserPoolId`, `IntranetClientId`, `IntranetAuthDomain`. O site recebe a
configuração num `config.js` gerado no deploy, como o site público.

## Fases

| Fase | Entrega | Para a demo |
| --- | --- | --- |
| F0 | Stack, login com MFA, estrutura da SPA e navegação | Sim |
| F1 | Acompanhamento: leads, tarefas, responsável | Sim |
| F2 | Painéis | Sim |
| F3 | Governança e ISO (só leitura) e manifesto em `config/` | Se houver tempo |
| F4 | Wiki: leitura e pergunta ao RAG | Depois |
| F5 | Wiki: rascunhos e aprovação | Depois |
| F6 | Operações | Depois |

Pré-requisito: `BluCostaBackoffice` publicado (avaliador diário, RAG, buckets),
com `BACKOFFICE_TRUSTED_PRINCIPAL_ARNS` a incluir o papel das Lambdas da
intranet que invocam o RAG.

## Testes e aceitação

Locais, sem AWS:

- Lambdas com clientes AWS injetados: permissões por grupo (`403`),
  validação, `404`, recusa de contactos na wiki, exclusão de sintéticos nos
  indicadores, logs sem dados pessoais.
- Synth: autorizador JWT em todas as rotas, CORS só do domínio da intranet,
  políticas sem `Scan`, `DeleteItem` nem curingas, user pool retido.
- SPA: testes de componentes e cenário de navegador a 390 e 1440 px, com
  API simulada, incluindo sessão expirada e utilizador sem grupo.

Na AWS, só com autorização e dados de teste:

1. Sem login, a intranet pede autenticação e a API devolve `401`.
2. Curador vê painéis e leads, assume uma tarefa e marca contactado.
3. Editor cria um rascunho; só `governance` o aprova; o RAG passa a citá-lo.
4. Utilizador sem grupo recebe `403` em todas as rotas.
5. Logs sem texto de mensagens, contactos nem tokens.

## Publicação, custo e reversão

- `cdk diff BluCostaIntranet`, revisto pelo grupo, depois
  `cdk deploy --exclusively BluCostaIntranet`. Contas criadas pelo grupo.
- Custo esperado baixo: Cognito no escalão gratuito, CloudFront, HTTP API e
  Lambda por pedido. Confirmar no orçamento antes do deploy.
- `cdk destroy BluCostaIntranet` remove site, API e Lambdas; o user pool e o
  bucket do site ficam retidos. Dados de `BluCostaData` não são afetados.
