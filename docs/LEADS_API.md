# Especificação da API de leads

Estado: **proposta para revisão do grupo, 2026-10-25.** Nada implementado
nem publicado. Contexto e tarefas em [PLAN.md](../PLAN.md).

## Objetivo

A página de Leads do portal passa a ler e atualizar contactos através de uma
API BLU com login próprio, em vez de usar as credenciais da máquina onde o
portal corre. O acesso fica ligado a uma pessoa autenticada do grupo
`curators`, e o portal funciona igual no SageMaker Studio, num portátil ou
alojado.

Não-objetivos:

- Não altera o papel `SageMakerTeachingExecutionRole`, o domínio
  `trabalhos-finais` nem os espaços do curso.
- Não cria tabelas nem outra persistência; reutiliza `BluCostaData`.
- Não protege as restantes páginas do portal (catálogo, histórico, etc.).
- Não contacta clientes nem altera mensagens, percurso ou consentimento.

## Fluxo

```text
Curador ──▶ Portal /leads ──sem sessão──▶ /api/auth/login
                                         │ PKCE + state
                                         ▼
                              Login gerido do Cognito (MFA)
                                         │ code
                                         ▼
           /api/auth/callback ──troca do code (servidor)──▶ Cognito /oauth2/token
                 │ cookies httpOnly
                 ▼
 leads.ts (servidor) ──Bearer access token──▶ HTTP API (autorizador JWT)
                                                   │
                                                   ▼
                                     Lambda leads-api (grupo curators)
                                                   │ política mínima
                                                   ▼
                              ConversationMessages · CustomerIntelligence
```

O navegador nunca vê os tokens: só o servidor do portal os lê e envia à API.

## Contrato HTTP

Base: saída `LeadsApiUrl` da stack. Todas as rotas exigem
`Authorization: Bearer <access token>`. Respostas JSON com
`Cache-Control: no-store`. Identificadores validados com o padrão já usado no
portal, `^[A-Za-z0-9-]{8,80}$` (`validLeadId`).

A API devolve itens DynamoDB no formato de atributos (`{ "S": "..." }`); o
mapeamento para `Lead`, `LeadDetail` e contactos continua só em
`dmc-workspace/src/lib/leads-model.ts`. Assim a Lambda é uma porta de dados
pequena e auditável, e as regras de apresentação não ficam duplicadas.

| Método e rota | Pedido | Resposta 2xx |
| --- | --- | --- |
| `GET /v1/leads?status=open\|contacted` | — | `200 { "items": Item[] }` |
| `GET /v1/leads/{id}` | — | `200 { "records": Item[], "messages": Item[] }` |
| `POST /v1/leads/{id}/contacted` | — | `204` |
| `PUT /v1/leads/{id}/tags` | `{ "tags": string[], "note"?: string }` | `204` |

Regras:

- `GET /v1/leads`: `status` em falta ou desconhecido equivale a `open`.
  `open` consulta `FollowUpIndex` com `PENDING` e `QUEUED_FOR_REVIEW`;
  `contacted` com `CONTACTED`. No máximo 1 000 itens, como hoje. A ordenação
  continua no portal.
- `GET /v1/leads/{id}`: devolve todos os registos da conversa nas duas
  tabelas; `404` se não existir o registo `PROFILE`.
- `POST .../contacted`: `followUpStatus = CONTACTED`, `contactedAt` e
  `updatedAt` com a hora do servidor; `404` se o perfil não existir.
- `PUT .../tags`: no máximo 6 etiquetas, apenas chaves conhecidas; nota com
  até 1 000 caracteres após `trim`. Lista vazia remove `tags`; nota vazia
  remove `curatorNote`. Valores inválidos dão `400`, nunca uma correção
  silenciosa. Atualiza `taggedAt` e `updatedAt`.
- As escritas usam `ConditionExpression: attribute_exists(conversationId)` e
  `ReturnValues: NONE`.

Erros: corpo `{ "error": "<mensagem em português>" }`.

| Código | Quando |
| --- | --- |
| `400` | Identificador, `status`, etiquetas, nota ou JSON inválidos |
| `401` | Token em falta, expirado ou de outro cliente (autorizador) |
| `403` | Utilizador autenticado fora do grupo `curators` |
| `404` | Perfil inexistente |
| `429` | Limite de pedidos excedido |
| `500` | Falha interna; sem detalhes no corpo |

### Etiquetas

As chaves válidas são as de `LEAD_TAGS` em `leads-model.ts`. A Lambda guarda
uma cópia das chaves (sem rótulos), seguindo o padrão já usado para os
estados partilhados com `event-processor`. Um teste do portal compara as duas
listas e falha se divergirem.

## Autenticação e autorização

- User pool Cognito sem registo público; contas criadas pelo grupo.
- Grupo `curators`; a Lambda recusa (`403`) tokens sem esse grupo em
  `cognito:groups`.
- MFA TOTP, palavra-passe com pelo menos 12 caracteres, recuperação por email.
- Cliente público com código de autorização e PKCE, sem segredo a guardar.
  Âmbitos `openid` e `email`. Access token de 1 h; refresh token de 12 h.
- Autorizador JWT do HTTP API: emissor do user pool e audiência igual ao
  client id. Tokens de outro cliente ou pool são recusados antes da Lambda.
- URLs de retorno e de saída exatas, por ambiente (localhost, cada espaço
  Studio, alojado). O URL do Studio muda por espaço e tem de ser acrescentado.

## Dados e permissões

A Lambda tem só registos no CloudWatch Logs e esta política, já validada no
IAM Access Analyzer sem resultados:

- `dynamodb:Query` em `ConversationMessages`, `CustomerIntelligence` e
  `CustomerIntelligence/index/FollowUpIndex`.
- `dynamodb:UpdateItem` em `CustomerIntelligence`, com
  `dynamodb:Attributes` limitado a `conversationId`, `recordKey`,
  `followUpStatus`, `contactedAt`, `updatedAt`, `taggedAt`, `tags` e
  `curatorNote`, e `dynamodb:ReturnValues` igual a `NONE`.

Sem `Scan`, `BatchGetItem`, `PutItem`, `DeleteItem` nem curingas. Na
stack, os ARNs vêm das tabelas de `BluCostaData`, não de nomes fixos.

## Portal

- `src/lib/leads.ts` mantém `listLeads`, `getLead`, `markContacted`,
  `tagLead`, `LeadsNotConfigured` e `LeadNotFound`, com as mesmas
  assinaturas. Troca as chamadas DynamoDB por `fetch` à API com o token da
  sessão e acrescenta `LeadsUnauthorized` (401) e `LeadsForbidden` (403).
- As rotas `/api/leads` e `/api/leads/[id]` passam esses erros como 401 e
  403; a página de Leads mostra «Sessão expirada» com ligação para entrar.
- Novas rotas `/api/auth/login`, `/api/auth/callback` e `/api/auth/logout`.
  Antes de as escrever, ler o guia Next.js em `node_modules/next/dist/docs/`,
  como exige `dmc-workspace/AGENTS.md`.
- Cookies `httpOnly`, `secure`, `sameSite=lax`: access token até expirar;
  refresh token restrito a `/api/auth`; `state` e verificador PKCE durante
  10 minutos. Tokens nunca em `localStorage`, URLs ou logs.
- Renovação: com o access token expirado e refresh token válido, o servidor
  renova uma vez e repete o pedido; se falhar, devolve 401.
- O URL de retorno usa `publicOrigin` de `server-http.ts`, para funcionar
  com o prefixo do proxy do Studio.
- O portal deixa de precisar de `BLU_CONVERSATION_TABLE`,
  `BLU_INTELLIGENCE_TABLE` e de credenciais AWS para esta página.

## Configuração

Entradas da stack (variáveis no `cdk synth`/`deploy`):

| Variável | Obrigatória | Uso |
| --- | --- | --- |
| `LEADS_CALLBACK_URLS` | Sim | URLs exatos de `/api/auth/callback`, separados por vírgulas |
| `LEADS_LOGOUT_URLS` | Sim | URLs para onde o Cognito regressa após sair |
| `LEADS_AUTH_DOMAIN_PREFIX` | Não | Prefixo do domínio de login; por defeito `<projeto>-<ambiente>-leads` |

Saídas: `LeadsApiUrl`, `LeadsUserPoolId`, `LeadsClientId`, `LeadsAuthDomain`.

Portal (`.env.local`, fora do Git):

| Variável | Valor |
| --- | --- |
| `BLU_LEADS_API_URL` | `LeadsApiUrl` |
| `BLU_LEADS_AUTH_DOMAIN` | `LeadsAuthDomain` |
| `BLU_LEADS_CLIENT_ID` | `LeadsClientId` |

Sem estas variáveis, a página continua a responder `503` com instruções
(`LeadsNotConfigured`).

## Segurança e privacidade

- Sem CORS: só o servidor do portal chama a API.
- Limite do HTTP API: 10 pedidos/s com picos de 20.
- Logs da Lambda em JSON com hora, `sub` do utilizador, rota, id da conversa,
  código e duração. Nunca texto de mensagens, contactos, notas ou tokens.
  Retenção de um mês.
- User pool com `RemovalPolicy.RETAIN`, como os buckets: remover a stack não
  apaga as contas por engano.
- Nenhuma alteração ao papel partilhado do Studio.

## Correção associada: confiança do Backoffice

Implementada em 2026-10-25 (`af957b7`), ainda sem deploy.
`BackofficeAnalysisRole` em `infra/aws-split-app.mjs` confiava em toda a
conta (`AccountPrincipal`), pelo que outros papéis da conta, incluindo o papel
partilhado do Studio se tiver permissão `sts:AssumeRole`, poderiam assumi-lo.
Agora confia apenas nos ARNs de `BACKOFFICE_TRUSTED_PRINCIPAL_ARNS`
(separados por vírgulas) e recusa a raiz da conta, curingas e outras contas.
Sem essa variável, o papel não é criado e as restantes funções do Backoffice
continuam a ser publicadas. `infra/tests/frontend.test.mjs` cobre os três
casos com synth real.

## Testes e critérios de aceitação

Testes locais, sem chamadas AWS:

- Lambda (`infra/tests/leads-api.test.mjs`, `node --test`, cliente DynamoDB
  injetado): listas `open`/`contacted`, paginação até 1 000, detalhe, `404`,
  `403` sem grupo, etiquetas e notas inválidas, remoção de campos vazios,
  logs sem dados pessoais.
- Synth: a política da Lambda tem só as duas ações, nos recursos indicados,
  com as condições; autorizador JWT em todas as rotas; nenhum
  `AccountPrincipal`.
- Portal: `leads.ts` com `fetch` simulado (sucesso, 401 com e sem renovação,
  403, 404, API indisponível, variáveis em falta) e igualdade das listas de
  etiquetas; rotas de autenticação (state errado, PKCE, cookies).
- Navegador: página de Leads com API simulada em 390/1440 px, incluindo
  sessão expirada.
- `npm run check` e `npm run build` no portal; `npm test` em `infra/`;
  verificações de documentação.

Aceitação na AWS, só com autorização e dados de teste:

1. Sem token: `401`. Token de utilizador fora de `curators`: `403`.
2. Curador: lista e detalhe `200`; marcar contactado e etiquetar refletem-se
   na página.
3. Uma chamada direta à tabela com campos fora da lista é recusada pelo IAM.
4. Os logs da Lambda não contêm texto de mensagens nem contactos.

## Publicação e reversão

1. `cdk diff BluCostaLeadsApi`, mostrado ao grupo antes de publicar.
2. `cdk deploy --exclusively BluCostaLeadsApi`, com o resultado de synth fora
   de `infra/`.
3. Contas de curador criadas pelo grupo no Cognito.
4. Variáveis do portal e verificação de aceitação.

Reversão: `cdk destroy BluCostaLeadsApi` remove API e Lambda; o user pool fica
retido e apaga-se manualmente se desejado. As tabelas não são afetadas. Sem a
API, a página de Leads mostra a mensagem de configuração em falta.

Custo esperado: Cognito dentro do escalão gratuito de utilizadores ativos
(confirmar o plano de funcionalidades do login gerido), HTTP API e Lambda
cobrados por pedido. Confirmar no orçamento antes do deploy.
