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

// The PROFILE record is the CRM lead: activity and follow-up for every event, a message
// count for real messages only, and the latest journey snapshot for leads and churn review.
export function profileUpdate(record) {
  const eventType = record.eventType || 'conversation.message.recorded';
  const followUpAt = new Date(Date.parse(record.occurredAt) + 3 * 86400000).toISOString();
  const set = ['lastActivityAt=:at', 'followUpAt=:due', 'followUpStatus=:pending', 'lastChannel=:channel', 'lastEventType=:type', 'analyticsConsent=:analytics', 'synthetic=:synthetic', 'updatedAt=:at'];
  const values = {
    ':at': { S: record.occurredAt }, ':due': { S: followUpAt }, ':pending': { S: 'PENDING' },
    ':channel': { S: record.message.channel }, ':type': { S: eventType },
    ':analytics': { BOOL: record.analyticsConsent === true }, ':synthetic': { BOOL: record.synthetic === true },
  };
  if (eventType === 'journey.details.updated' && record.context) {
    set.push('journeyJson=:journey');
    values[':journey'] = { S: JSON.stringify(record.context) };
    if (record.context.stage) { set.push('journeyStage=:stage'); values[':stage'] = { S: record.context.stage }; }
  }
  if (eventType === 'lead.consent.granted') { set.push('consentAt=:at', 'journeyStage=:consented'); values[':consented'] = { S: 'curator-follow-up' }; }
  const add = eventType === 'conversation.message.recorded' ? ' ADD messageCount :one' : '';
  if (add) values[':one'] = { N: '1' };
  return {
    Key: { conversationId: { S: record.conversationId }, recordKey: { S: 'PROFILE' } },
    UpdateExpression: `SET ${set.join(', ')}${add}`,
    ExpressionAttributeValues: values,
  };
}
