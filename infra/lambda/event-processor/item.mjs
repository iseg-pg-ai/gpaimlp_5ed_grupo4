// leadId is the LeadIndex key: DynamoDB rejects empty strings in index keys, so the
// attribute is omitted (a sparse index) until a lead is known.
export function messageItem(record, occurredAtId) {
  return {
    conversationId: { S: record.conversationId }, occurredAtId: { S: occurredAtId },
    ...(record.leadId ? { leadId: { S: String(record.leadId) } } : {}),
    actor: { S: record.message.actor }, channel: { S: record.message.channel },
    text: { S: record.message.text }, source: { S: record.source }, synthetic: { BOOL: record.synthetic === true },
    journeyConsent: { BOOL: true }, analyticsConsent: { BOOL: record.analyticsConsent === true },
    schemaVersion: { N: String(record.schemaVersion || 1) },
    eventType: { S: record.eventType || 'conversation.message.recorded' },
    ...(record.context ? { contextJson: { S: JSON.stringify(record.context) } } : {}),
  };
}
