export const env = {
  MESSAGE_TABLE_NAME: 'messages-test',
  INTELLIGENCE_TABLE_NAME: 'intelligence-test',
  KNOWLEDGE_BUCKET: 'approved-test',
  MODEL_ID: 'test-model',
};
export const conversationId = 'conversation-test-1';
export const question = 'surf wine';
const number = value => String(value).padStart(2, '0');

export function messageRows(count = 35) {
  return Array.from({ length: count }, (_, index) => ({
    conversationId: { S: conversationId },
    occurredAtId: { S: `2026-10-26T00:${number(index + 1)}:00Z#message-${number(index + 1)}` },
    actor: { S: index % 2 ? 'assistant' : 'user' },
    channel: { S: index % 3 ? 'web' : 'email' },
    text: { S: `Mensagem sintética ${number(index + 1)}` },
  }));
}

export function intelligenceRows(count = 25) {
  return [
    ...Array.from({ length: count }, (_, index) => ({
      conversationId: { S: conversationId },
      recordKey: { S: `EVENT#2026-10-26T01:${number(index + 1)}:00Z#event-${number(index + 1)}` },
      sourceId: { S: `event-${number(index + 1)}` },
      occurredAt: { S: `2026-10-26T01:${number(index + 1)}:00Z` },
      eventType: { S: 'conversation.preference.updated' },
      summary: { S: `Preferência sintética ${number(index + 1)}` },
      contextJson: { S: '{"availability":"unknown"}' },
    })),
    { conversationId: { S: conversationId }, recordKey: { S: 'PROFILE' }, lastChannel: { S: 'email' }, messageCount: { N: '35' } },
  ];
}

// Simula apenas as operações externas e a ordenação/limitação documentada de Query.
export function createFixture({ messages = messageRows(), intelligence = intelligenceRows(), knowledge = new Map() } = {}) {
  const calls = [];
  const modelRequests = [];
  const deps = {
    async query(input) {
      calls.push({ operation: 'query', input });
      const isMessages = input.TableName === env.MESSAGE_TABLE_NAME;
      if (!isMessages && input.TableName !== env.INTELLIGENCE_TABLE_NAME) throw new Error('Tabela inesperada');
      const key = isMessages ? 'occurredAtId' : 'recordKey';
      const source = isMessages ? messages : intelligence;
      let items = source.filter(item => item.conversationId.S === input.ExpressionAttributeValues[':id'].S);
      if (input.KeyConditionExpression.includes('begins_with')) items = items.filter(item => item[key].S.startsWith(input.ExpressionAttributeValues[':prefix'].S));
      items = [...items].sort((a, b) => a[key].S.localeCompare(b[key].S));
      if (input.ScanIndexForward === false) items.reverse();
      const selected = items.slice(0, input.Limit);
      return { Items: selected, ...(items.length > selected.length ? { LastEvaluatedKey: { conversationId: selected.at(-1).conversationId, [key]: selected.at(-1)[key] } } : {}) };
    },
    async getItem(input) {
      calls.push({ operation: 'getItem', input });
      return { Item: intelligence.find(item => item.conversationId.S === input.Key.conversationId.S && item.recordKey.S === input.Key.recordKey.S) };
    },
    async listObjects(input) {
      calls.push({ operation: 'listObjects', input });
      const keys = [...knowledge.keys()].filter(key => key.startsWith(input.Prefix)).sort();
      return { Contents: keys.slice(0, input.MaxKeys).map(Key => ({ Key })), IsTruncated: keys.length > input.MaxKeys };
    },
    async getObject(input) {
      calls.push({ operation: 'getObject', input });
      if (!knowledge.has(input.Key)) throw new Error('Objeto inexistente');
      return { Body: { transformToString: async () => knowledge.get(input.Key) } };
    },
    async converse(input) {
      calls.push({ operation: 'converse', input });
      modelRequests.push(input);
      return { output: { message: { content: [{ text: 'Disponibilidade e preço por confirmar.' }] } } };
    },
  };
  return { deps, calls, modelRequests, messages, intelligence, knowledge };
}

export function retrievedFacts(fixture) {
  const marker = 'RETRIEVED CUSTOMER INTELLIGENCE:\n';
  const block = fixture.modelRequests.at(-1).messages[0].content.find(part => part.text?.includes(marker)).text;
  return JSON.parse(block.slice(block.indexOf(marker) + marker.length));
}
