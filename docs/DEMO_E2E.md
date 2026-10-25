# Demonstração de ponta a ponta — concierge, CRM e seguimento

Guião para as sessões de terça-feira, 27 de outubro, e de 29 a 31 de outubro
de 2026. Mostra o percurso completo: visitante no site, conversa com o
concierge, consentimento, registo na AWS, contacto no portal e seguimento do
curador. Complementa a [Parte III da apresentação](APRESENTACAO.md#4-parte-iii--demonstração-do-portal-real).

## Percurso demonstrado

```text
Site (CloudFront) ─ chat ─► Lambda BedrockChat ─► resposta + dados da viagem
        │ consentimento
        ▼
API /v1/conversation-events ─► SQS ─► processador ─► DynamoDB + arquivo S3
                                                        │
Portal (SageMaker Studio) ─ /leads ◄────────────────────┘
        └─ etiquetas, nota, contactado, email/WhatsApp
```

## Preparação (até à véspera)

1. **Disco do portátil:** pelo menos 3 GB livres. Desligar a hibernação numa
   consola de administrador (`powercfg /h off`), que liberta cerca de 9,5 GB.
2. **Sessão AWS:** `aws sso login --profile blu-costa-admin` e confirmar com
   `aws sts get-caller-identity --profile blu-costa-admin`.
3. **Site:** confirmar que `https://d1sb8lbbur6ggj.cloudfront.net/?demo=1`
   mostra o botão **New conversation** no cabeçalho do chat. Se não aparecer,
   publicar o `BluCostaFrontend` a partir de `inge/addon`.
4. **Portal no SageMaker Studio:** obter o branch `inge/leads-page` e definir as
   tabelas do `BluCostaData` antes de arrancar o portal na porta 3001:

   ```bash
   export BLU_CONVERSATION_TABLE=<ConversationTableName>
   export BLU_INTELLIGENCE_TABLE=<CustomerIntelligenceTableName>
   ```

   Os valores são as saídas da stack `BluCostaData` (CloudFormation). O papel
   de execução do Studio precisa de `dynamodb:Query` nas duas tabelas e no
   índice `FollowUpIndex`, e de `dynamodb:UpdateItem` na tabela
   `CustomerIntelligence`.
5. **Ensaio completo:** executar o guião uma vez e confirmar que o contacto
   aparece em **Contactos** com a etiqueta “teste”.

## Guião (cerca de 10 minutos)

Abrir o site com o modo de demonstração e uma campanha fictícia:
`https://d1sb8lbbur6ggj.cloudfront.net/?demo=1&utm_source=instagram&utm_campaign=demo-29out`.

| Passo | Ação | O que mostrar |
| --- | --- | --- |
| 1 | Abrir **Talk to BLU** e tocar em *A week in Lisbon and Sintra* | Sugestões de resposta; o visitante pode continuar a escrever enquanto o BLU responde |
| 2 | Escrever “Madrid in 1945 for 1000 pesetas” | O concierge limita-se a Portugal, recusa datas passadas e pede orçamento em euros |
| 3 | Responder com os botões: viajantes, datas e orçamento | A cada resposta, o chat pergunta só o que falta; *Skip* permite avançar |
| 4 | Aceitar **Yes** no pedido de consentimento | Nada é guardado antes; depois surge a referência `BLU-…` |
| 5 | Abrir **Contactos** no portal e o contacto mais recente | Etapa, destino, datas, viajantes, orçamento, campanha `demo-29out`, conversa e data do consentimento |
| 6 | Marcar *Preparar proposta*, escrever uma nota e guardar | Etiquetas fixas para CRM e churn; nota interna nunca enviada ao cliente |
| 7 | Mostrar os botões de email ou WhatsApp e **Marcar como contactado** | O contacto passa para *Contactados*; nova mensagem do cliente volta a colocá-lo *Por contactar* |
| 8 | Carregar em **New conversation** | Nova referência e consentimento limpo, para o ensaio seguinte |

Mensagem central: o chat recolhe dados úteis sem interrogar o cliente, só
guarda com consentimento, e o curador decide o seguimento.

## Prova na AWS (opcional, para perguntas técnicas)

Substituir a referência pela que o chat mostrou:

```bash
aws dynamodb get-item --profile blu-costa-admin --region eu-west-1 \
  --table-name <CustomerIntelligenceTableName> \
  --key '{"conversationId":{"S":"BLU-…"},"recordKey":{"S":"PROFILE"}}'
```

O registo `PROFILE` mostra `followUpStatus`, `followUpAt` (três dias após a
última mensagem), `journeyStage`, `journeyJson`, `consentAt`, `tags` e
`curatorNote`.

## Limites a assumir na sessão

- O seguimento automático diário (churn) e o chatbot de backoffice pertencem à
  stack `BluCostaBackoffice`, que ainda não está publicada.
- O WhatsApp junta mensagens com a referência `BLU-…` à mesma conversa apenas
  se o número e o webhook estiverem configurados.
- O portal não tem autenticação própria: mostrar apenas através da sessão do
  SageMaker Studio, nunca num endereço público.
- Os contactos de demonstração ficam marcados como `synthetic` e com “teste” no
  portal. Remover os registos de ensaio depois das sessões.

## Plano B

- **Bedrock indisponível:** o chat mostra a mensagem de recurso e o botão de
  WhatsApp. Usar capturas de um ensaio anterior.
- **Portal indisponível:** mostrar o registo `PROFILE` com o comando acima.
- **Site com versão antiga:** recarregar com Ctrl+F5; os ficheiros são servidos
  com `Cache-Control: no-cache`.
