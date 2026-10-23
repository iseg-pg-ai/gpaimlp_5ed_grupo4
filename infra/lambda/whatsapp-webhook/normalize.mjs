import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const JOURNEY_REFERENCE = /\bBLU-[A-F0-9]{16}\b/i;

const safeText = (value, maximum = 4000) => String(value || '').trim().slice(0, maximum);

export function signatureMatches(rawBody, signatureHeader, appSecret) {
  if (!appSecret || !signatureHeader?.startsWith('sha256=')) return false;
  const supplied = signatureHeader.slice(7);
  if (!/^[a-f0-9]{64}$/i.test(supplied)) return false;
  const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex');
  return timingSafeEqual(Buffer.from(supplied, 'hex'), Buffer.from(expected, 'hex'));
}

export function messageText(message) {
  if (message?.type === 'text') return safeText(message.text?.body);
  if (message?.type === 'interactive') {
    return safeText(message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || '[WhatsApp interactive reply]');
  }
  if (message?.type === 'button') return safeText(message.button?.text || '[WhatsApp button reply]');
  if (message?.type === 'reaction') return safeText(`[WhatsApp reaction ${message.reaction?.emoji || ''}]`);
  const supportedMedia = new Set(['audio', 'document', 'image', 'location', 'sticker', 'video']);
  if (supportedMedia.has(message?.type)) return `[WhatsApp ${message.type} received]`;
  return '';
}

function occurredAt(timestamp, receivedAt) {
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || seconds <= 0) return receivedAt.toISOString();
  const value = new Date(seconds * 1000);
  return Number.isNaN(value.valueOf()) ? receivedAt.toISOString() : value.toISOString();
}

function fallbackConversationId(externalId, appSecret) {
  return `wa-${createHmac('sha256', appSecret).update(String(externalId || 'unknown')).digest('hex').slice(0, 32)}`;
}

export function normalizeWhatsAppPayload(payload, { appSecret, receivedAt = new Date() }) {
  if (payload?.object !== 'whatsapp_business_account') return [];
  const records = [];
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field !== 'messages') continue;
      const value = change.value || {};
      for (const message of value.messages || []) {
        const text = messageText(message);
        if (!text || !message.from || !message.id) continue;
        const reference = text.match(JOURNEY_REFERENCE)?.[0]?.toUpperCase();
        const messageId = createHash('sha256').update(String(message.id)).digest('hex').slice(0, 32);
        records.push({
          id: `wa-${messageId}`,
          eventType: 'conversation.message.recorded',
          conversationId: reference || fallbackConversationId(message.from, appSecret),
          leadId: null,
          occurredAt: occurredAt(message.timestamp, receivedAt),
          synthetic: false,
          source: 'whatsapp-cloud-api',
          schemaVersion: 2,
          journeyConsent: true,
          analyticsConsent: false,
          retentionBasis: 'customer_initiated_channel',
          channelIdentity: { kind: 'whatsapp', externalId: String(message.from).slice(0, 40) },
          message: { actor: 'customer', channel: 'whatsapp', text },
          context: {
            journeyReference: reference || '',
            whatsappMessageType: safeText(message.type, 30),
            whatsappPhoneNumberId: safeText(value.metadata?.phone_number_id, 40),
          },
        });
      }
    }
  }
  return records;
}
