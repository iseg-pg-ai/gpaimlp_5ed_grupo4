import test from 'node:test';
import assert from 'node:assert/strict';
import { messageItem } from '../lambda/event-processor/item.mjs';

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
