# Arquitetura AWS de site, dados e Backoffice

Este guia descreve `infra/aws-split-app.mjs`, separado do portal DMC no Code Editor e da [alternativa ECS de curadoria](CURATION_WORKSPACE.md). Define recursos e contratos; a existência da stack não comprova deployment no ambiente atual.

## Pontos de entrada e configuração

A partir da raiz, com as dependências de `infra/` instaladas:

```bash
npm --prefix infra run synth:cloud
```

A síntese exige `TARGET_AWS_ACCOUNT_ID`; a região usa `TARGET_AWS_REGION`, predefinida para `eu-west-1`, e `DEPLOY_ENVIRONMENT` distingue o ambiente.
A rede usa `CLOUD_VPC_CIDR` quando indicado, duas sub-redes isoladas e nenhum NAT Gateway. O frontend deve estar construído antes da síntese.

`deploy:cloud` publica recursos e só deve ser executado com autorização própria.
Não inferir autorização de deployment a partir de um pedido de documentação, de um build ou de uma síntese aprovada.

## Unidades de deployment

| Stack | Responsabilidade |
| --- | --- |
| `BluCostaData` | Tabelas de mensagens/inteligência, arquivo S3, filas de ingestão e CRM, DLQ e segredo de canal |
| `BluCostaFrontend` | S3 privado/CloudFront do site, chat Bedrock, ingestão, webhook WhatsApp e processamento assíncrono |
| `BluCostaBackoffice` | Exportações/evidências, RAG limitado, avaliador diário e envio WhatsApp sujeito a aprovação |

A stack serve `frontend/blu-cloud-site/dist/client` através de CloudFront. Gera `config.js` com os endpoints `/v1/chat`, `/v1/conversation-events` e o URL público WhatsApp; não guardar segredos nesse ficheiro. A ponte social de `frontend/website/` tem o output `SocialConversationBridgeUrl`.

Os outputs `ConversationTableName` e `CustomerIntelligenceTableName` ligam o portal às tabelas existentes. O portal não cria outro catálogo ou CRM.
A API de Leads com login próprio permanece uma [proposta](../docs/LEADS_API.md).

## Conversa e consentimento

A referência aleatória `BLU-…` correlaciona eventos do site e WhatsApp. Não é identidade autenticada, autorização ou prova de titularidade de um contacto.
Os parâmetros `utm_source`, `utm_medium`, `utm_campaign` e `utm_content` são indícios de atribuição, não identidades verificadas.

Contrato de ingestão:

```text
POST /v1/conversation-events
journeyConsent=true
analyticsConsent=true|false
conversationId
leadId?
synthetic=true|false
source
message={actor,channel,text}
```

`journeyConsent` permite retenção para seguimento. `analyticsConsent` é uma escolha separada para análise; a conversa pode permanecer apenas no navegador sem autorização de retenção. Excluir eventos `synthetic=true` dos indicadores reais e respeitar `analyticsConsent=false`.

A ingestão valida o envelope e envia-o a SQS. O processador grava eventos idempotentes em DynamoDB e no arquivo S3 e publica `conversation.message.recorded` na fila CRM. A entrega é pelo menos uma vez; o consumidor tem de deduplicar pelo identificador do evento. Não particionar objetos por email ou telefone.

## Chat e controlo de abuso

O chat usa `BEDROCK_MODEL_ID`; em `eu-west-1`, o perfil predefinido é `eu.amazon.nova-lite-v1:0`. Este concierge público é distinto do planeador Nova Pro do portal. O prompt limita o serviço a Portugal, trata datas e orçamento como dados a confirmar e não promete preço final ou disponibilidade.

A stack inclui Guardrail, recusa local de padrões de extração de instruções e limites API: 10 pedidos/s com pico de 20 por omissão, e chat 2/s com pico de 5.
CORS público não autentica clientes nem substitui proteção contra abuso. A configuração efetiva e o comportamento AWS têm de ser validados antes de exposição.
`BEDROCK_GUARDRAIL_PROFILE_ARN` configura o perfil Guardrail quando aplicável.

## Canal WhatsApp

`GET|POST /v1/channels/whatsapp` implementa o callback Meta. GET verifica o challenge; POST valida `X-Hub-Signature-256` sobre os bytes originais antes de aceitar eventos. Uma referência BLU explícita junta os canais; sem ela, o identificador de origem é pseudonimizado com HMAC.

WhatsApp não implica consentimento analítico: os eventos de serviço usam `analyticsConsent=false`. Conteúdo de média não é descarregado ou enviado ao modelo. Os identificadores necessários ao canal pertencem ao arquivo privado e à fronteira CRM, não à configuração pública do navegador.

Credenciais ficam no segredo `WhatsAppChannelSecretArn`, importado através de `WHATSAPP_SECRET_ARN` ou criado pela stack com valores a configurar no servidor.
Os campos são `verifyToken`, `appSecret`, `accessToken`, `phoneNumberId` e `graphApiVersion`; não os colocar no Git, browser ou variáveis públicas GitHub.

`WhatsAppOutboundFunctionArn` é invocável pelo Backoffice autorizado, sem rota HTTP pública. Um pedido exige conversa, `requestId` estável, destino, `approvedBy` e texto ou template aprovado. Autenticação do operador, opt-out, contacto correto e política de repetição continuam responsabilidades do consumidor.

## Backoffice, propostas e RAG

O Backoffice limita a confiança de análise aos ARNs explícitos em `BACKOFFICE_TRUSTED_PRINCIPAL_ARNS`. Raiz da conta, curingas e outras contas são recusados; sem a lista, o papel de análise não é criado.

O RAG lê a conversa selecionada e documentos apenas sob `curated/approved/`.
Transcrições brutas em `sessions/` não são uma base de conhecimento aprovada.
Respostas incluem fontes e exigem revisão humana. O avaliador diário cria tarefas
CRM de revisão; não contacta clientes. Evidências no bucket de governança apoiam auditoria, sem constituir certificação ISO.

Preços finais, disponibilidade, publicação e entrega ao cliente permanecem sujeitos aos controlos de aprovação existentes.

## Validação e ensaio sintético

Construir o site e executar a bateria de infraestrutura conforme [Testes](../docs/TESTING.md#infraestrutura). A síntese testa o contrato produzido, não comprova serviços publicados.

Depois de deployment autorizado, `npm --prefix infra run synthetic:cloud` envia conversas fictícias para os endpoints configurados em `CONVERSATION_EVENTS_ENDPOINT` e, opcionalmente, `BLU_CHAT_API`. Tem efeitos reais e pode gerar custos. Confirmar eventos S3/DynamoDB e deduplicação da fila CRM sem misturar esses registos com indicadores comerciais ou contactos reais.

Referências: [guião E2E](../docs/DEMO_E2E.md) e [operações](../docs/OPERATIONS.md).

## Ponte social de campanhas

`frontend/website/index/index.html` é a entrada leve para campanhas sociais.
Encaminha para concierge e WhatsApp mantendo a referência pseudónima do separador; não é outro portal DMC. Com retenção autorizada, as mensagens e o contexto de campanha usam o endpoint de eventos existente.

Os valores públicos estão em `frontend/website/data/channels.json`. O deployment gera `config.js` junto das pastas `data` e `index`; tokens Meta, segredos e credenciais CRM permanecem no servidor. Etiquetas Instagram, Facebook, Pinterest, LinkedIn, WhatsApp e acesso direto são indícios de atribuição, não identidades.
Os parâmetros UTM nunca são instruções de execução.

## Proveniência do addon

O addon de canais desenvolvido em `inge/addon` foi orientado e escrito por GiselaInge.
O âmbito inclui o código específico de `frontend/website`, a ponte de eventos e WhatsApp de `infra` e os testes/notas associados; não atribui autoria do trabalho pré-existente do grupo ou de recursos de terceiros.

O histórico Git é a fonte de proveniência. Esta consolidação não altera licenças ou atribuições do conteúdo.
