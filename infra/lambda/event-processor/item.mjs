// Converte eventos em registos e atualizações do perfil, separados do conteúdo de
// apresentação.
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

// Frases com que o cliente diz que vai desistir (inglês e português, sem acentos).
// Deteção simples e explicável: falsos positivos só pedem um contacto humano mais cedo.
const CHURN_PHRASES = [
  /\b(quit|quitting|give up|giving up|forget it|never ?mind|not interested|no longer interested|lost interest|waste of time|too expensive|going elsewhere|book(ing)? elsewhere|another agency|i'?m done|stop messaging|cancel (my|the|our) (trip|booking|plans?))\b/,
  /\b(desisto|desistir|vou desistir|esquece|deixa estar|nao tenho interesse|ja nao (estou|tenho) interess\w*|perda de tempo|muito caro|outra agencia|reservar noutro|cancelar a viagem)\b/,
];

/** Devolve a frase de desistência encontrada numa mensagem do cliente, ou ''. */
export function churnSignal(text) {
  const plain = String(text ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’`]/g, "'");
  for (const pattern of CHURN_PHRASES) {
    const match = plain.match(pattern);
    if (match) return match[0];
  }
  return '';
}

// The PROFILE record is the CRM lead: activity and follow-up for every event, a message
// count for real messages only, and the latest journey snapshot for leads and churn review.
// Um sinal de desistência do cliente fica em churnSignalAt até um curador o contactar.
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
  const signal = eventType === 'conversation.message.recorded' && record.message.actor === 'customer' ? churnSignal(record.message.text) : '';
  if (signal) { set.push('churnSignalAt=:at', 'churnSignal=:signal'); values[':signal'] = { S: signal }; }
  const add = eventType === 'conversation.message.recorded' ? ' ADD messageCount :one' : '';
  if (add) values[':one'] = { N: '1' };
  return {
    Key: { conversationId: { S: record.conversationId }, recordKey: { S: 'PROFILE' } },
    UpdateExpression: `SET ${set.join(', ')}${add}`,
    ExpressionAttributeValues: values,
  };
}
