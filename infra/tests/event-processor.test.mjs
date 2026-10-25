import test from 'node:test';
import assert from 'node:assert/strict';
import { messageItem, profileUpdate } from '../lambda/event-processor/item.mjs';

const record = (extra = {}) => ({
  conversationId: 'BLU-AC2EE15506850505', source: 'blu-cloud-site', schemaVersion: 2, analyticsConsent: false,
  message: { actor: 'customer', channel: 'website', text: 'Lisbon in May' }, ...extra,
});

test('messages without a lead omit leadId so the LeadIndex key is never empty', () => {
  for (const leadId of [undefined, null, '']) {
    const item = messageItem(record({ leadId }), '2026-10-25T14:00:00Z#1');
    assert.equal('leadId' in item, false, String(leadId));
    for (const [name, value] of Object.entries(item)) if ('S' in value) assert.notEqual(value.S, '', name);
  }
});

test('known leads, consent events and context are kept', () => {
  const item = messageItem(record({ leadId: 'lead-42', eventType: 'lead.consent.granted', context: { journeyReference: 'BLU-AC2EE15506850505' } }), '2026-10-25T14:00:00Z#2');
  assert.deepEqual(item.leadId, { S: 'lead-42' });
  assert.deepEqual(item.eventType, { S: 'lead.consent.granted' });
  assert.equal(JSON.parse(item.contextJson.S).journeyReference, 'BLU-AC2EE15506850505');
  assert.deepEqual(item.journeyConsent, { BOOL: true });
});

test('profile updates count only real messages and keep the latest journey snapshot', () => {
  const message = profileUpdate(record({ occurredAt: '2026-10-25T14:00:00.000Z' }));
  assert.match(message.UpdateExpression, /ADD messageCount :one$/);
  assert.equal(message.ExpressionAttributeValues[':due'].S, '2026-10-28T14:00:00.000Z');
  const journey = profileUpdate(record({ occurredAt: '2026-10-25T14:00:00.000Z', eventType: 'journey.details.updated', context: { destination: 'Lisbon', stage: 'qualifying' } }));
  assert.doesNotMatch(journey.UpdateExpression, /messageCount/);
  assert.equal(JSON.parse(journey.ExpressionAttributeValues[':journey'].S).destination, 'Lisbon');
  assert.equal(journey.ExpressionAttributeValues[':stage'].S, 'qualifying');
  const consent = profileUpdate(record({ occurredAt: '2026-10-25T14:00:00.000Z', eventType: 'lead.consent.granted' }));
  assert.match(consent.UpdateExpression, /consentAt=:at, journeyStage=:consented/);
  for (const update of [message, journey, consent]) {
    const used = new Set(update.UpdateExpression.match(/:[a-z]+/g));
    assert.deepEqual([...used].sort(), Object.keys(update.ExpressionAttributeValues).sort());
  }
});
