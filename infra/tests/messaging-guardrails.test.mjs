import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../lambda/intranet/app.mjs';
import { GUARDRAILS, checkDraft, decide, nextActivity, quietHours, templateReply } from '../lambda/intranet/guardrails.mjs';
import { WHATSAPP_TEST } from '../lambda/intranet/whatsapp-test.mjs';

const S = value => ({ S: String(value) });
const morning = new Date('2026-10-27T10:00:00Z');
const facts = { title: 'Recolha no hotel', place: 'Hotel Avenida, Lisboa', date: '2026-10-28', time: '09:00', people: 2, partner: 'Tuk-tuk Alfama' };

test('only simple questions the booking answers are replied to automatically', () => {
  const base = { enabled: true, facts, autoToday: 0, now: morning };
  assert.equal(decide({ ...base, text: 'What time is the pickup tomorrow?' }).action, 'auto');
  assert.equal(decide({ ...base, text: 'Onde é o ponto de encontro?' }).action, 'auto');
  assert.equal(decide({ ...base, text: 'Perfect, see you then' }).action, 'auto');
  // Dinheiro, alterações, queixas e emergências vão sempre para uma pessoa, mesmo com uma pergunta simples.
  for (const text of ['How much is the tour? What time?', 'Can we change the time to 10?', 'I want to cancel', 'The driver was late, this is terrible', 'Emergency, we lost our passport', 'Can we book another tour?']) {
    assert.equal(decide({ ...base, text }).action, 'person', text);
  }
  assert.equal(decide({ ...base, text: 'Tell me about the history of Lisbon' }).action, 'person');
  assert.equal(decide({ ...base, text: 'STOP' }).action, 'stop');
  assert.equal(decide({ ...base, facts: null, text: 'What time is the pickup?' }).action, 'person');
  assert.equal(decide({ ...base, enabled: false, text: 'What time is the pickup?' }).action, 'person');
  assert.equal(decide({ ...base, autoToday: GUARDRAILS.maxAutoPerDay, text: 'What time is the pickup?' }).action, 'person');
  assert.equal(quietHours(new Date('2026-10-27T23:30:00Z')), true);
  assert.equal(decide({ ...base, now: new Date('2026-10-27T23:30:00Z'), text: 'What time is the pickup?' }).action, 'person');
});

test('a model reply must stay inside the booking facts', () => {
  assert.equal(checkDraft('Your pickup is on 28 October at 09:00 with Tuk-tuk Alfama.', facts).ok, true);
  assert.equal(checkDraft('Your pickup is at 9:30.', facts).ok, false);
  assert.equal(checkDraft('It costs only 40 euros, see you at 09:00.', facts).ok, false);
  assert.equal(checkDraft('Details at https://example.com', facts).ok, false);
  assert.equal(checkDraft('', facts).ok, false);
  assert.match(templateReply('time', facts, 'What time?'), /09:00/);
  assert.match(templateReply('place', facts, 'Onde é?'), /ponto de encontro é Hotel Avenida/);
});

test('the next active activity supplies the facts, never a cancelled or past one', () => {
  const name = id => (id === 'tuk-alfama' ? 'Tuk-tuk Alfama' : '');
  const activities = [
    { title: 'Old', place: 'A', date: '2026-10-20', time: '09:00', status: 'ACTIVE', partnerId: '' },
    { title: 'Cancelled', place: 'B', date: '2026-10-28', time: '08:00', status: 'CANCELLED', partnerId: '' },
    { title: 'Recolha no hotel', place: 'Hotel Avenida, Lisboa', date: '2026-10-28', time: '09:00', people: 2, status: 'ACTIVE', partnerId: 'tuk-alfama' },
  ];
  assert.deepEqual(nextActivity(activities, name, morning), facts);
  assert.equal(nextActivity([], name, morning), null);
});

const partners = [{ id: 'tuk-alfama', name: 'Tuk-tuk Alfama', whatsapp: '351910000000', license: { number: '1-2020' } }, { id: 'guide-porto', name: 'Guia Porto (demo)', whatsapp: '', demo: true }];

function inbox({ replies = true, draft } = {}) {
  const stored = [
    { conversationId: 'BLU-SETTINGS', recordKey: 'SETTING#2026-10-26T00:00:00Z', settingsJson: JSON.stringify({ auto: { replies } }) },
    { conversationId: 'BLU-AAAAAAAA0001', recordKey: 'ACTIVITY#a1', activityId: 'a1', kind: 'pickup', title: 'Recolha no hotel', place: 'Hotel Avenida, Lisboa', date: '2026-10-28', time: '09:00', people: '2', partnerId: 'tuk-alfama', status: 'ACTIVE' },
  ];
  let n = 0;
  const deps = {
    whatsappMode: 'test',
    partners,
    now: () => new Date(+morning + n * 6e4),
    newId: () => `msg-${++n}`,
    putRecords: async (id, list) => { stored.push(...list.map(record => ({ conversationId: id, ...record }))); },
    queryRecords: async (id, prefix) => stored.filter(r => r.conversationId === id && r.recordKey.startsWith(prefix)).map(r => Object.fromEntries(Object.entries(r).filter(([, v]) => v !== '').map(([k, v]) => [k, S(v)]))),
    queryStatus: async () => [],
    queryAgenda: async () => [],
    getRecords: async () => [],
    draftReply: draft,
  };
  const handler = createApp(deps);
  const call = (routeKey, body) => handler({ routeKey, body: body && JSON.stringify(body), requestContext: { authorizer: { jwt: { claims: { email: 'ana@blu.pt', name: 'Ana', 'cognito:groups': '[curators]' } } } } });
  const messages = () => stored.filter(r => r.conversationId === WHATSAPP_TEST.partition);
  return { call, messages };
}

test('a simple question is answered automatically from the booking; a wrong model text falls back to the template', async () => {
  const { call, messages } = inbox({ draft: async () => 'Your pickup is at 9:30, see you!' });
  await call('POST /v1/whatsapp-test', { direction: 'out', to: '351912345678', text: 'Olá, aqui a BLU.', leadId: 'BLU-AAAAAAAA0001' });
  const answered = JSON.parse((await call('POST /v1/whatsapp-test', { direction: 'in', to: '351912345678', text: 'What time is the pickup tomorrow?' })).body);
  assert.equal(answered.decision, 'auto');
  const reply = messages().at(-1);
  assert.equal(reply.author, 'auto-assistant');
  assert.match(reply.text, /09:00/);
  assert.doesNotMatch(reply.text, /9:30/);
  const { threads, autoReplies } = JSON.parse((await call('GET /v1/whatsapp-test')).body);
  assert.equal(autoReplies, true);
  assert.equal(threads[0].waiting, false);
});

test('money questions wait for a person with a suggested reply; STOP blocks further messages', async () => {
  const { call, messages } = inbox({ draft: async () => 'It is 40 euros.' });
  await call('POST /v1/whatsapp-test', { direction: 'in', to: '351912345678', text: 'How much does the Sintra day cost?', leadId: 'BLU-AAAAAAAA0001' });
  assert.equal(messages().length, 1);
  assert.equal(messages()[0].decision, 'person');
  // O lead não tem responsável: a mensagem fica na caixa e na Visão geral, não em «O meu trabalho».
  const { threads } = JSON.parse((await call('GET /v1/whatsapp-test')).body);
  const thread = threads.find(item => item.to === '351912345678');
  assert.equal(thread.waiting, true);
  assert.match(thread.messages.at(-1).reason, /preço ou pagamento/);
  assert.doesNotMatch(thread.messages.at(-1).suggestion, /40/);
  assert.equal(JSON.parse((await call('GET /v1/work')).body).items.some(item => item.kind === 'message'), false);

  await call('POST /v1/whatsapp-test', { direction: 'in', to: '351912345678', text: 'STOP' });
  assert.equal((await call('POST /v1/whatsapp-test', { direction: 'out', to: '351912345678', text: 'Olá de novo' })).statusCode, 409);
});

test('automatic replies stay off until a founder turns them on, and partners can be picked without typing a number', async () => {
  const { call, messages } = inbox({ replies: false });
  const result = JSON.parse((await call('POST /v1/whatsapp-test', { direction: 'in', partnerId: 'guide-porto', text: 'Confirmado, até amanhã', leadId: 'BLU-AAAAAAAA0001' })).body);
  assert.equal(result.decision, 'person');
  assert.match(result.reason, /desligadas/);
  assert.equal(messages().at(-1).partnerId, 'guide-porto');
  const { threads } = JSON.parse((await call('GET /v1/whatsapp-test')).body);
  assert.deepEqual([threads[0].key, threads[0].name, threads[0].audience, threads[0].waiting], ['partner:guide-porto', 'Guia Porto (demo)', 'partner', true]);
  assert.equal((await call('POST /v1/whatsapp-test', { direction: 'out', partnerId: 'nobody', text: 'Olá' })).statusCode, 400);
});

test('a client picked from the list without a phone gets a conversation under the lead reference, like partners', async () => {
  const { call } = inbox({ replies: false });
  assert.equal((await call('POST /v1/whatsapp-test', { direction: 'out', leadId: 'BLU-AAAAAAAA0001', text: 'Olá, aqui a BLU.' })).statusCode, 201);
  const { threads } = JSON.parse((await call('GET /v1/whatsapp-test')).body);
  assert.deepEqual([threads[0].key, threads[0].leadId, threads[0].audience], ['lead:BLU-AAAAAAAA0001', 'BLU-AAAAAAAA0001', 'traveller']);
  assert.equal((await call('POST /v1/whatsapp-test', { direction: 'out', text: 'Sem destino' })).statusCode, 400);
});
