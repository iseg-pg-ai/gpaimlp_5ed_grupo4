import { randomUUID } from 'node:crypto';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

const sqs = new SQSClient({});
const response = (statusCode, body) => ({ statusCode, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }, body: JSON.stringify(body) });
const text = (value, maximum) => String(value || '').trim().slice(0, maximum);

function cleanContext(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const allowed = ['journeyReference', 'socialSource', 'campaign', 'medium', 'content', 'destination', 'timeframe', 'party', 'budget', 'interests', 'pace', 'stage', 'outcome', 'feedback', 'rating', 'reason'];
  const cleaned = Object.fromEntries(allowed.map(key => [key, text(value[key], 120)]).filter(([, item]) => item));
  return Object.keys(cleaned).length ? cleaned : undefined;
}

export async function handler(event) {
  try {
    const body = JSON.parse(event.body || '{}');
    const conversationId = String(body.conversationId || '');
    if (body.journeyConsent !== true || !/^[A-Za-z0-9-]{8,80}$/.test(conversationId) || !body.message || typeof body.message.text !== 'string' || !body.message.text.trim() || body.message.text.length > 4000) {
      return response(400, { error: 'journey consent, a valid conversationId and message are required' });
    }
    const eventType = text(body.eventType || 'conversation.message.recorded', 80);
    if (!/^[a-z][a-z0-9.-]+$/.test(eventType)) return response(400, { error: 'invalid eventType' });
    const record = {
      id: randomUUID(), conversationId, leadId: body.leadId ? String(body.leadId).slice(0, 80) : null,
      occurredAt: new Date().toISOString(), synthetic: body.synthetic === true,
      eventType, source: text(body.source || 'blu-cloud-site', 80), schemaVersion: 2,
      journeyConsent: true, analyticsConsent: body.analyticsConsent === true,
      message: { actor: String(body.message.actor || 'customer').slice(0, 30), channel: String(body.message.channel || 'website').slice(0, 30), text: body.message.text.trim() },
      ...(cleanContext(body.context) ? { context: cleanContext(body.context) } : {}),
    };
    await sqs.send(new SendMessageCommand({ QueueUrl: process.env.QUEUE_URL, MessageBody: JSON.stringify(record) }));
    return response(202, { accepted: true, id: record.id });
  } catch (error) {
    console.error(error);
    return response(500, { error: 'event could not be queued' });
  }
}
