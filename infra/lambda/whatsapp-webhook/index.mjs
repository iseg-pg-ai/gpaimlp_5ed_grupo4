// Valida o webhook e a assinatura sobre o corpo original antes de aceitar eventos do canal.
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { normalizeWhatsAppPayload, signatureMatches } from './normalize.mjs';

const secrets = new SecretsManagerClient({});
const sqs = new SQSClient({});
let cachedSecret;
let cachedAt = 0;

const response = (statusCode, body, contentType = 'application/json') => ({
  statusCode,
  headers: { 'content-type': contentType, 'cache-control': 'no-store' },
  body: contentType === 'application/json' ? JSON.stringify(body) : String(body),
});

async function channelSecret() {
  if (cachedSecret && Date.now() - cachedAt < 300_000) return cachedSecret;
  const result = await secrets.send(new GetSecretValueCommand({ SecretId: process.env.WHATSAPP_SECRET_ARN }));
  cachedSecret = JSON.parse(result.SecretString || '{}');
  cachedAt = Date.now();
  return cachedSecret;
}

// Conservar o corpo original, necessário para verificar a assinatura enviada pelo canal.
function rawBody(event) {
  const body = event.body || '';
  return event.isBase64Encoded ? Buffer.from(body, 'base64').toString('utf8') : body;
}

function header(event, name) {
  const match = Object.entries(event.headers || {}).find(([key]) => key.toLowerCase() === name.toLowerCase());
  return match?.[1];
}

export async function handler(event) {
  try {
    const method = event.requestContext?.http?.method || event.httpMethod;
    const secret = await channelSecret();
    if (method === 'GET') {
      const query = event.queryStringParameters || {};
      if (query['hub.mode'] !== 'subscribe' || query['hub.verify_token'] !== secret.verifyToken || !query['hub.challenge']) {
        return response(403, { error: 'webhook verification rejected' });
      }
      return response(200, query['hub.challenge'], 'text/plain; charset=utf-8');
    }
    if (method !== 'POST') return response(405, { error: 'method not allowed' });
    if (!secret.appSecret || secret.appSecret === 'SET_IN_SECRETS_MANAGER') return response(503, { error: 'WhatsApp channel is not configured' });
    const body = rawBody(event);
    if (!signatureMatches(body, header(event, 'x-hub-signature-256'), secret.appSecret)) {
      return response(401, { error: 'invalid webhook signature' });
    }
    const records = normalizeWhatsAppPayload(JSON.parse(body), { appSecret: secret.appSecret });
    await Promise.all(records.map(record => sqs.send(new SendMessageCommand({
      QueueUrl: process.env.QUEUE_URL,
      MessageBody: JSON.stringify(record),
    }))));
    return response(200, { accepted: records.length });
  } catch (error) {
    console.error('WhatsApp webhook failed', error?.name || 'Error');
    return response(500, { error: 'webhook could not be processed' });
  }
}
