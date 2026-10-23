# Split AWS architecture

The cloud entry point is `npm run synth:cloud`; an explicitly approved deployment is
`npm run deploy:cloud`. Set `TARGET_AWS_ACCOUNT_ID`, `TARGET_AWS_REGION`, and optionally
`DEPLOY_ENVIRONMENT`, `CLOUD_VPC_CIDR`, and `BEDROCK_MODEL_ID`. The default cloud network is
`10.10.0.0/16`, with two isolated `/24` backoffice subnets and no NAT gateways.

`BEDROCK_GUARDRAIL_PROFILE_ARN` is optional. Supplying a supported cross-Region guardrail profile
enables the Standard content-filter tier; otherwise the stack uses the classic regional tier. The
chat Lambda also refuses common prompt-extraction instructions before calling Bedrock. Neither
control replaces API abuse protection: add a production origin allowlist and rate limits before a
public launch.

For the default `eu-west-1` deployment, the chat uses the EU Nova Lite inference profile
`eu.amazon.nova-lite-v1:0`. Override `BEDROCK_MODEL_ID` when deploying to another Region. To enable
the Standard guardrail tier in Ireland, set `BEDROCK_GUARDRAIL_PROFILE_ARN` to the account-specific
ARN ending in `guardrail-profile/eu.guardrail.v1:0`.

## Deployment units

- `BluCostaFrontend` owns the private website bucket, CloudFront distribution, public chat API,
  Bedrock chat Lambda and Guardrail, event-ingestion Lambda, WhatsApp webhook, and asynchronous
  storage worker.
- `BluCostaData` owns the inexpensive shared data plane: an on-demand DynamoDB message journal,
  private retained S3 archive, ingestion queue with DLQ, and a separate CRM delivery queue.
- `BluCostaBackoffice` owns analysis exports and a role that can read the journal/archive and
  consume the CRM queue. It also owns the curator-approved WhatsApp sender Lambda and has no
  public backoffice HTTP route.

The compact source website in `frontend/website` is copied to private S3 and served only
through CloudFront. CDK generates `config.js` during deployment with the emitted `/v1/chat` and
`/v1/conversation-events` URLs. A custom domain and certificate are intentionally not guessed;
attach them after the target Route 53 zone and certificate are selected.

The social conversation bridge is deployed at the `SocialConversationBridgeUrl` output from
`frontend/website`. Campaign links may add `utm_source`, `utm_medium`, `utm_campaign`, and
`utm_content`. The browser creates a pseudonymous `BLU-` journey reference and uses it for both
website events and the prefilled WhatsApp handoff. That reference is correlation, not
authentication, entitlement, or proof of customer identity.

## Conversation and consent flow

The browser creates a random, pseudonymous `conversationId`; it is a session key, not a customer
or email identity. Contact details remain in the visitor's message until a CRM consumer creates a
real contact and returns its own `leadId`. Do not partition S3 by email or phone number.

The operational event contract is:

```text
POST /v1/conversation-events
journeyConsent=true
analyticsConsent=true|false
conversationId
leadId?                 # assigned by CRM/backoffice, never trusted as browser identity
synthetic=true|false
source
message={actor,channel,text}
```

`journeyConsent` allows the conversation to be retained for curator follow-up. The separate
`analyticsConsent` flag determines whether Pedro's analytics should include that event. The
browser can still hold an unsaved conversation when journey consent is absent. Consumers must
exclude `analyticsConsent=false` and must normally exclude `synthetic=true` from business KPIs.

The ingestion Lambda validates the envelope and puts it on SQS. A worker then writes the same
idempotent event key to DynamoDB and S3 under `sessions/{conversationId}/...json`, and publishes a
normalized `conversation.message.recorded` envelope to `BackofficeCrmQueueUrl`. Delivery is
at-least-once; Pedro's consumer must deduplicate with the event `id`. This keeps storage and CRM
failures away from the visitor's chat request while preserving a recoverable raw record.

## Social and WhatsApp channel

`GET|POST /v1/channels/whatsapp` is the Meta WhatsApp Cloud API callback. `GET` performs the
subscription challenge. `POST` validates `X-Hub-Signature-256` against the Meta app secret before
accepting any payload. Inbound messages become the same `conversation.message.recorded` event used
by the website. If the customer includes the `BLU-` reference, both channels share a timeline;
otherwise the sender identifier is HMAC-pseudonymized for the operational conversation key.

WhatsApp does **not** imply analytics consent. Inbound events are retained for the customer-
initiated service conversation with `analyticsConsent=false`. The raw channel identifier is sent
only in the short-lived encrypted session archive and CRM envelope; it is not used as the DynamoDB
partition key. Media is acknowledged by type but is not downloaded, indexed, or sent to Bedrock.

The `WhatsAppOutboundFunctionArn` is directly invokable by the backoffice role. It is not exposed
through the public API. A command requires `conversationId`, stable `requestId`, destination,
`approvedBy`, and either text or a Meta-approved template. A successful provider message is added
to the shared timeline. Pedro's CRM remains responsible for operator authentication, permissions,
customer opt-out/suppression, contact resolution, and retry/idempotency policy.

Channel credentials live in the secret emitted as `WhatsAppChannelSecretArn`. If
`WHATSAPP_SECRET_ARN` is supplied at synth/deploy time, CDK uses that existing secret; otherwise it
creates a secret with a generated `verifyToken` and placeholders. Before registering the callback,
replace the placeholders with server-side values:

```json
{
  "verifyToken": "generated-or-selected-verification-token",
  "appSecret": "meta-app-secret",
  "accessToken": "system-user-access-token",
  "phoneNumberId": "registered-whatsapp-phone-number-id",
  "graphApiVersion": "currently-supported-version"
}
```

Never place these values in `frontend/website`, CloudFormation parameters, GitHub variables, or
browser configuration. [Meta's official examples](https://github.com/fbsamples/whatsapp-api-examples)
cover raw-payload signature validation, and the
[official Postman collection](https://www.postman.com/meta/whatsapp-business-platform/folder/o48mro7/messages)
documents the `/{phone-number-id}/messages` endpoint. AWS recommends
[Secrets Manager-backed retrieval and caching](https://docs.aws.amazon.com/lambda/latest/dg/with-secrets-manager.html)
for Lambda credentials.

## Backoffice, proposals and RAG

The CRM queue is the handoff boundary, not an automatic approval. Pedro's consumer can resolve a
contact, score or match the brief, and open a curator task. Final prices, supplier availability,
proposal publication, and customer delivery remain behind the existing human approval gates.
The model is instructed never to claim live availability, expose supplier costs/margins, or quote
a final price.

For Bedrock Knowledge Bases, use the archive bucket only through a separate `curated/` prefix of
redacted, approved tour and proposal summaries. Never attach raw `sessions/` transcripts directly
as a RAG source: they may contain names, emails, phone numbers, or prompt attacks. DynamoDB is the
small operational journal here, not the knowledge base; it can later be replaced behind the queue
contract without changing the browser.

## Synthetic pipeline check

After deployment, copy `ConversationEventsEndpoint` and optionally `ChatEndpoint` from CDK outputs:

```powershell
$env:CONVERSATION_EVENTS_ENDPOINT = 'https://.../v1/conversation-events'
$env:BLU_CHAT_API = 'https://.../v1/chat'
npm --prefix infra run synthetic:cloud
```

The generator writes three fictional conversations with `synthetic=true`, source
`synthetic-pipeline-validation`, and both consent flags enabled. Verify their event IDs in S3 or
DynamoDB and consume copies from `BackofficeCrmQueueUrl`; keep them out of revenue and conversion
metrics.
