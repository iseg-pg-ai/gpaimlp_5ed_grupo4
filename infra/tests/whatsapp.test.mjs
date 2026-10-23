import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { messageText, normalizeWhatsAppPayload, signatureMatches } from '../lambda/whatsapp-webhook/normalize.mjs';
import { buildWhatsAppPayload } from '../lambda/whatsapp-outbound/payload.mjs';

test('WhatsApp signature validation uses the raw request body', () => {
  const body = JSON.stringify({ object: 'whatsapp_business_account' });
  const signature = `sha256=${createHmac('sha256', 'app-secret').update(body).digest('hex')}`;
  assert.equal(signatureMatches(body, signature, 'app-secret'), true);
  assert.equal(signatureMatches(`${body} `, signature, 'app-secret'), false);
});

test('inbound WhatsApp reference joins the website conversation without analytics consent', () => {
  const payload = { object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: { metadata: { phone_number_id: '1234' }, messages: [{ id: 'wamid.1', from: '351900000000', timestamp: '1792760400', type: 'text', text: { body: 'Continue BLU-A1B2C3D4E5F60708 please' } }] } }] }] };
  const [record] = normalizeWhatsAppPayload(payload, { appSecret: 'secret' });
  assert.equal(record.conversationId, 'BLU-A1B2C3D4E5F60708');
  assert.equal(record.message.channel, 'whatsapp');
  assert.equal(record.analyticsConsent, false);
  assert.equal(record.channelIdentity.externalId, '351900000000');
});

test('WhatsApp identities are pseudonymized when no journey reference exists', () => {
  const payload = { object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: { messages: [{ id: 'wamid.2', from: '351900000000', type: 'image', image: { id: 'media' } }] } }] }] };
  const first = normalizeWhatsAppPayload(payload, { appSecret: 'secret', receivedAt: new Date('2026-10-23T10:00:00Z') })[0];
  const second = normalizeWhatsAppPayload(payload, { appSecret: 'secret', receivedAt: new Date('2026-10-23T10:00:00Z') })[0];
  assert.match(first.conversationId, /^wa-[a-f0-9]{32}$/);
  assert.equal(first.conversationId, second.conversationId);
  assert.equal(first.message.text, '[WhatsApp image received]');
});

test('interactive WhatsApp replies retain human-visible labels', () => {
  assert.equal(messageText({ type: 'interactive', interactive: { button_reply: { title: 'A calm Sintra day' } } }), 'A calm Sintra day');
});

test('outbound messages require curator approval metadata and support templates', () => {
  assert.throws(() => buildWhatsAppPayload({ to: '351900000000', conversationId: 'BLU-A1B2C3D4E5F60708', requestId: 'request-123', text: 'Hello' }), /approvedBy/);
  const built = buildWhatsAppPayload({ to: '351900000000', conversationId: 'BLU-A1B2C3D4E5F60708', requestId: 'request-123', approvedBy: 'adriana', kind: 'template', template: { name: 'curator_follow_up', languageCode: 'en_US' } });
  assert.equal(built.api.type, 'template');
  assert.equal(built.api.template.name, 'curator_follow_up');
});
