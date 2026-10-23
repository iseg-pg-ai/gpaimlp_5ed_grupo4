import { createHash } from 'node:crypto';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { buildWhatsAppPayload } from './payload.mjs';

const secrets = new SecretsManagerClient({});
const sqs = new SQSClient({});
let cachedSecret;
let cachedAt = 0;

async function channelSecret() {
  if (cachedSecret && Date.now() - cachedAt < 300_000) return cachedSecret;
  const result = await secrets.send(new GetSecretValueCommand({ SecretId: process.env.WHATSAPP_SECRET_ARN }));
  cachedSecret = JSON.parse(result.SecretString || '{}');
  cachedAt = Date.now();
  return cachedSecret;
}

export async function handler(event) {
  const input = typeof event.body === 'string' ? JSON.parse(event.body) : event;
  const built = buildWhatsAppPayload(input);
  const secret = await channelSecret();
  for (const key of ['accessToken', 'phoneNumberId', 'graphApiVersion']) {
    if (!secret[key] || secret[key] === 'SET_IN_SECRETS_MANAGER') throw new Error(`WhatsApp ${key} is not configured`);
  }
  const graphResponse = await fetch(`https://graph.facebook.com/${encodeURIComponent(secret.graphApiVersion)}/${encodeURIComponent(secret.phoneNumberId)}/messages`, {
    method: 'POST',
    headers: { authorization: `Bearer ${secret.accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify(built.api),
  });
  const graphResult = await graphResponse.json().catch(() => ({}));
  if (!graphResponse.ok) {
    const code = graphResult?.error?.code || graphResponse.status;
    throw new Error(`WhatsApp send failed with provider code ${code}`);
  }
  const providerMessageId = String(graphResult.messages?.[0]?.id || input.requestId);
  const now = new Date().toISOString();
  const record = {
    id: `wa-out-${createHash('sha256').update(providerMessageId).digest('hex').slice(0, 32)}`,
    eventType: 'conversation.message.recorded',
    conversationId: input.conversationId,
    leadId: input.leadId ? String(input.leadId).slice(0, 80) : null,
    occurredAt: now,
    synthetic: false,
    source: 'backoffice-whatsapp',
    schemaVersion: 2,
    journeyConsent: true,
    analyticsConsent: false,
    retentionBasis: 'curator_service_message',
    message: { actor: 'curator', channel: 'whatsapp', text: built.timelineText },
    context: { approvedBy: String(input.approvedBy).slice(0, 120), requestId: String(input.requestId).slice(0, 120), providerMessageId: providerMessageId.slice(0, 180), contentKind: built.contentKind },
  };
  let timelineRecorded = true;
  try {
    await sqs.send(new SendMessageCommand({ QueueUrl: process.env.QUEUE_URL, MessageBody: JSON.stringify(record) }));
  } catch (error) {
    timelineRecorded = false;
    console.error('WhatsApp sent but timeline event failed', error?.name || 'Error');
  }
  return { status: 'sent', requestId: input.requestId, providerMessageId, timelineRecorded };
}
