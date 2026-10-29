# Especificação da intranet BLU

Estado em 2026-10-25: **F0, F1, F2, operações, equipa e governança (só
leitura) implementados em `BluCostaIntranet`; ainda sem deploy.** A wiki
(F4–F5) continua por fazer. Complementa a
[especificação da API de leads](LEADS_API.md) e o [plano](../PLAN.md).

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
   │ login                               │ chamadas com ID token
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
- **Página estática em HTML e JavaScript sem build** em `frontend/intranet/`
  (sem dependências novas). É uma entrada nova porque a fronteira
  cliente/servidor é diferente do portal Next.js. `frontend/intranet-preview/`
  é uma pré-visualização local com dados fictícios, excluída do deploy: `load.js`
  abre a página real (`frontend/intranet/index.html`) e troca só `config.js`
  pelos dados simulados, sem cópia do menu (`?role=marketing` mostra outro perfil).
- **Uma Lambda, `infra/lambda/intranet/`**: `app.mjs` (rotas, autorização e
  validação, testadas sem AWS), `model.mjs` (espelho de
  `dmc-workspace/src/lib/leads-model.ts`, com teste de paridade) e
  `index.mjs` (acessos AWS).
- Cada Lambda tem só as permissões do seu módulo; nenhuma tem `Scan`,
  `DeleteItem` nem curingas de recurso fora do Bedrock.

## Acesso

| Grupo Cognito | Pode |
| --- | --- |
| `curators` | Ver painéis, leads, tarefas, wiki, governança e operações; marcar contactado, etiquetar, assumir tarefas |
| `knowledge-editors` | Propor e editar rascunhos da wiki |
| `governance` | Aprovar páginas da wiki; ver evidências completas |
| `marketing` | Só «O meu trabalho», o painel (totais agregados), o site público e o portal de propostas; a API recusa leads, conversas, WhatsApp, agenda e parceiros |

O menu mostra o portal de propostas (`BluCostaPortal`, output `PortalUrl`) a
fundadores, curadores e marketing, os mesmos grupos que o portão do portal deixa
entrar. O site «backoffice» (a mesma intranet com quatro separadores escondidos,
num segundo endereço) foi retirado em 2026-10-29: a intranet é o único site da
equipa e os grupos Cognito já decidem o que cada pessoa vê. Em cada lead,
curadores e fundadores têm «Proposta no
portal», que abre o portal já nesse lead; o mapa é uma secção da proposta, sem
ligação própria. O endereço do portal vive só na ligação `#portal-link` do menu.

- Sem registo público; contas criadas pelo grupo. MFA TOTP obrigatório.
- Login gerido do Cognito com código e PKCE. O ID token (1 h, com email e
  grupos) fica só em memória no navegador (nunca `localStorage`, URL ou
  logs); o verificador PKCE fica em `sessionStorage` apenas até ao regresso.
  O refresh token (12 h) também fica só em memória e renova o ID token sem
  novo login; ao recarregar a página, a SPA volta logo ao login gerido, que
  devolve um código sem pedir MFA enquanto a sua sessão for válida.
- Política de segurança de conteúdo estrita, sem scripts de terceiros; CORS da
  API limitado ao domínio da intranet.
- Cada pedido é autorizado na Lambda pelos grupos do token, não só na SPA.

## Módulos

### 1. Acompanhamento da equipa

- Lista de leads (`open`, `contacted`, vencidos) e detalhe, como na API de
  leads, mais as tarefas que o avaliador diário marca como
  `QUEUED_FOR_REVIEW`.
- **Risco de desistência:** quando o cliente escreve no chat que vai desistir
  (frases fixas em inglês e português, em `event-processor/item.mjs`), o
  processador de eventos grava `churnSignalAt` e `churnSignal` no `PROFILE`.
  O lead fica `atRisk`, aparece primeiro em Seguimento com um alerta e gera um
  alerta urgente no Painel até um curador o marcar como contactado. Não há
  contacto automático; falsos positivos só antecipam a revisão humana.
- **Responsável:** botão «Assumir» grava `assignedTo` (o email Cognito) e
  `assignedAt`. Os leads assumidos aparecem em «O meu trabalho» (ver a secção
  de 2026-10-26).
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

Base: saída `IntranetApiUrl`. Todas as rotas exigem o ID token Cognito
(autorizador JWT da HTTP API) e um dos grupos `curators` ou `governance`;
as ações sobre leads exigem `curators`. Respostas JSON com
`Cache-Control: no-store`, exceto indicadores, operações e governança.

| Rota | Grupo | Resposta |
| --- | --- | --- |
| `GET /v1/me` | equipa | Email, nome e grupos |
| `GET /v1/leads?status=` (`open`, `contacted`, `all`) e `GET /v1/leads/{id}` | equipa | Lista; detalhe com a conversa do chatbot, email e telefone |
| `POST /v1/leads/{id}/contacted`, `PUT /v1/leads/{id}/tags` | `curators` | `204` |
| `POST /v1/leads/{id}/assign` (`{ "release": true }` liberta) | `curators` | `204`; grava `assignedTo` e `assignedAt` |
| `POST /v1/leads/{id}/ask` | `curators` | `200 { "answer", "sourceIds", "requiresHumanApproval" }` via Backoffice RAG |
| `GET /v1/metrics` | equipa | Contagens agregadas sem sintéticos |
| `GET /v1/team` | equipa | Membros dos grupos, estado da conta, leads e tarefas (abertas, em atraso, bloqueadas) por responsável |
| `GET /v1/work` | equipa | «O meu trabalho»: tarefas, leads assumidos, lembretes preparados e casos da pessoa, por urgência |
| `GET /v1/tasks?status=` (`open`, `done`) e `GET /v1/leads/{id}/tasks/{taskId}` | equipa | Tarefas da equipa; detalhe com histórico |
| `POST /v1/tasks`, `POST /v1/leads/{id}/tasks/{taskId}` | fundadores, curadores, governança | `201 { "taskId", "partition" }`; `204` |
| `GET /v1/feed` | equipa | Feed «O que se passa» dos últimos 7 dias (casos só para quem os vê) |
| `GET /v1/operations` | equipa | Filas (eventos, falhados, tarefas), workers `BluCosta*` nas últimas 24 h e última revisão diária |
| `GET /v1/governance` | equipa | Manifesto de `config/governance-controls.json` e evidências recentes |

As rotas da wiki (`/v1/wiki`) ficam para F4–F5.

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

## Publicação e contas

1. `cdk diff --exclusively BluCostaBackoffice BluCostaIntranet`. O Backoffice
   muda apenas o manifesto de controlos e exporta o RAG e o bucket de
   evidências para a intranet.
2. `cdk deploy --exclusively BluCostaBackoffice BluCostaIntranet`, com
   `TARGET_AWS_ACCOUNT_ID`, `TARGET_AWS_REGION`, `BEDROCK_MODEL_ID` e
   `BACKOFFICE_TRUSTED_PRINCIPAL_ARNS` iguais aos do deploy anterior.
3. Contas: cada pessoa da equipa é criada pelo grupo com
   `aws cognito-idp admin-create-user` (email como nome de utilizador) e
   adicionada a `curators` e, se for o caso, a `governance` com
   `admin-add-user-to-group`. No primeiro login define a palavra-passe e
   configura a aplicação de autenticação (MFA).
4. Abrir a saída `IntranetUrl`.

## Agenda, acessos e políticas (2026-10-25)

- **Agenda:** no detalhe de um lead, o curador agenda recolhas ou excursões
  (um dia ou todos os dias até 31 dias), com parceiro ou Bolt, e escolhe os
  lembretes (véspera às 18:00, 1 h ou 2 h antes) e o canal: WhatsApp, SMS
  (Amazon SNS) ou email (Amazon SES). Cada lembrete fica como registo `NOTIFY#`
  no perfil, indexado em `FollowUpIndex` com estado `NOTIFY_*`. O despachante
  `ScheduledNotifications` corre a cada 5 minutos, reserva cada lembrete antes
  de enviar e grava evidência sem texto nem números em
  `controls/scheduled-notifications/`. Sem consentimento não há lembretes ao
  viajante; canais por configurar deixam a mensagem "preparada" para envio
  manual. SMS e email ligam-se com `INTRANET_SMS_ENABLED=true` e
  `INTRANET_EMAIL_FROM` (remetente verificado no SES).
- **Parceiros:** `config/partners.json`. Parceiros reais precisam de licença
  (RNAAT, TVDE ou alvará); o agendamento recusa os que não a têm.
- **Equipa e acessos:** papéis `founders`, `curators`, `governance` e
  `testers`. Só fundadores convidam, mudam papéis e desativam contas (o Cognito
  envia o convite por email; MFA no primeiro login). A página mostra a matriz de
  papéis e os metadados dos segredos geridos, nunca os valores.
- **Primeira conta de fundador:** criada pelo grupo depois do deploy:
  `aws cognito-idp admin-create-user --user-pool-id <IntranetUserPoolId> --username <email> --user-attributes Name=email,Value=<email> Name=email_verified,Value=true Name=name,Value=<nome>`
  e `aws cognito-idp admin-add-user-to-group --user-pool-id <IntranetUserPoolId> --username <email> --group-name founders`.
  As restantes pessoas são convidadas a partir da intranet.
- **Políticas como código:** `config/policies.json` liga cada regra europeia ou
  portuguesa à fonte legal; `infra/policy/checks.mjs` verifica-as nos ficheiros
  do projeto. Uma regra bloqueante em falha impede o synth (e o deploy); o
  relatório é publicado em `controls/manifests/policy-report.json` e aparece em
  Governança. Mapeamento técnico; não substitui parecer jurídico.

## Reclamações, litígios e segurança (2026-10-25)

- **Reclamações e litígios:** registo único de feedback, reclamações, Livro de
  Reclamações e contencioso. Cada caso tem tipo, canal, data de receção,
  responsável (membro da equipa), prioridade, prazo, referência (folha do Livro,
  processo) e histórico. Fica como registo `CASE#` no perfil do lead ou na
  partição `CASES-UNLINKED`, listado por `FollowUpIndex` (`CASE_OPEN` e
  `CASE_CLOSED`, prazo em `followUpAt`). Prazos automáticos em dias úteis, sem
  fins de semana nem feriados nacionais: feedback 5, reclamação 15, Livro de
  Reclamações 15 (prazo legal, não pode ser alargado; política
  `complaints-deadline`). Litígios exigem prazo indicado. Fechar exige resolução.
- **Acesso:** fundadores, curadores e governança veem e tratam casos; a equipa
  de testes não os vê.
- **Segurança:** só fundadores e governança. Mostra o que requer atenção (menos
  de dois fundadores, convites por aceitar, políticas em falta, casos fora do
  prazo), contas e os controlos ativos ou por ativar (AWS WAF e CloudTrail com
  alertas ainda por ativar).

## O meu trabalho, tarefas e feed (2026-10-26)

- **O meu trabalho:** primeiro separador depois do login. Junta numa lista o
  que é da pessoa: tarefas, leads assumidos, lembretes preparados para enviar à
  mão (aprovados por ela ou de leads seus) e casos de que é responsável. Ordem:
  risco de desistência, em atraso, bloqueado, prazo próximo, resto.
- **Tarefas:** estados *Por fazer → Em curso → Bloqueado → Feito*; um toque
  avança para o passo seguinte (botões de 44 px para tablet). Bloquear exige o
  motivo. Cada tarefa tem responsável (membro da equipa), prazo opcional, nota e
  pode ligar-se a um lead ou a um caso. Fica como registo `TASK#` no perfil do
  lead ou na partição `TASKS-UNLINKED`, listada por `FollowUpIndex`
  (`TASK_OPEN` com o prazo em `followUpAt`; sem prazo, `9999-12-31`).
  «Feito» passa a `TASK_DONE` e arquiva; não há rota para apagar.
- **Histórico e feed:** cada alteração grava `TASKLOG#` na partição da tarefa e
  uma entrada `FEED#` na partição `TEAM-FEED` (estado `FEED`, data em
  `followUpAt`). Assumir, libertar e marcar contactado um lead, e abrir ou
  atualizar um caso, também entram no feed; as entradas de casos ficam ocultas a
  quem não vê casos. O feed atualiza ao voltar ao separador ou em «Atualizar».
  Se a escrita no feed falhar, a ação mantém-se e só fica registado o erro.
- **Painel:** tabela «Carga da equipa» com tarefas abertas, em atraso e
  bloqueadas e leads em aberto por pessoa, com quem tem atrasos primeiro.
- **Acesso:** a equipa de testes vê tudo isto mas não altera tarefas
  (permissão `tasks` só para fundadores, curadores e governança).
- **Sem contacto automático:** tarefas e feed nunca enviam mensagens a clientes.
- Sem tabela nova nem permissões IAM novas: reutiliza `PutItem` condicional,
  `UpdateItem` e `Query` em `FollowUpIndex`. Os workers que leem o índice só
  consultam os seus próprios estados.

## Respostas automáticas por WhatsApp, com regras (2026-10-27)

Só em modo de teste: nada sai para o WhatsApp até haver credenciais Meta e
`INTRANET_WHATSAPP_MODE=live`. As regras estão em
`infra/lambda/intranet/guardrails.mjs` e valem para cada mensagem recebida.

- **Responde sozinho** apenas à hora, ao local, a confirmações e a
  agradecimentos, com os factos da próxima atividade ativa do lead (título,
  local, data, hora, pessoas, parceiro). Sem atividade, uma pergunta de hora ou
  local vai para uma pessoa.
- **Vai sempre para uma pessoa**, com uma resposta sugerida: preço, pagamento,
  gorjetas, alterações, cancelamentos, queixas, emergências, pedidos novos ou
  qualquer outra pergunta. `STOP` (ou «parar») fecha a conversa: a BLU deixa de
  poder escrever nela.
- **Limites:** no máximo 3 respostas automáticas por pessoa em 24 h, nenhuma
  entre as 22:00 e as 08:00 de Lisboa, e um interruptor nas regras de seguimento
  («Respostas sozinhas…»), desligado por defeito e só alterado por fundadores.
- **Texto:** o Bedrock (`MODEL_ID`, o mesmo modelo do chatbot público) só escreve
  a frase. Uma verificação final rejeita ligações, contactos, dinheiro e números
  que não estejam nos factos; nesse caso, ou se o modelo falhar, vale um modelo
  fixo. A mensagem do cliente é dado, nunca instrução.
- **Registo:** cada mensagem recebida guarda a decisão (`auto`, `person`,
  `stop`), o motivo e a sugestão; as respostas automáticas têm o autor
  `auto-assistant` e aparecem marcadas «automática».
- **O meu trabalho:** as conversas cuja última mensagem espera por uma pessoa
  aparecem a todos os curadores e fundadores, com a mensagem, o motivo, a
  resposta sugerida editável, «Enviar resposta» e «Abrir conversa» (abre essa
  conversa no WhatsApp de teste). Ficam em atraso depois do prazo de resposta
  das regras de seguimento.
- **Parceiros:** uma conversa nova escolhe o parceiro na lista, sem escrever o
  número; um parceiro de demonstração sem número fica com a chave
  `partner:<id>`. A caixa filtra por «À espera de uma pessoa», clientes e
  parceiros.
- Permissão nova: `bedrock:InvokeModel` para a Lambda da intranet. Sem tabela
  nova: tudo fica na partição `WHATSAPP-TEST`.
