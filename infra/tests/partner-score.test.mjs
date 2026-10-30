import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../lambda/intranet/app.mjs';
import { OUTCOME_STATUS, netPromoter, parseOutcome, scorecards } from '../lambda/intranet/partner-score.mjs';

const now = new Date('2026-10-28T15:00:00Z');
const partners = [
  { id: 'tuk', name: 'Tuk', kind: 'tuk-tuk', license: { type: 'RNAAT', number: '1' } },
  { id: 'tuk2', name: 'Tuk 2', kind: 'tuk-tuk', license: { type: 'RNAAT', number: '2' } },
  { id: 'van', name: 'Van', kind: 'transfer', license: { type: 'RNAAT', number: '3' } },
];
const at = days => new Date(+now - days * 864e5).toISOString();
const outcome = (partnerId, days, result, extra = {}) => ({ partnerId, at: at(days), date: at(days).slice(0, 10), people: 2, result, delayMinutes: 0, rating: null, cost: null, price: null, currency: 'EUR', ...extra });

test('o resultado de um serviço só se regista depois de acontecer, com parceiro e valores válidos', () => {
  const activity = { partnerId: 'tuk', kind: 'pickup', people: 2 };
  const past = new Date(+now - 36e5);
  assert.deepEqual(parseOutcome({ result: 'late', delayMinutes: '15', rating: '4', cost: '60', price: '90,5' }, activity, past, now).outcome,
    { result: 'late', delayMinutes: 15, rating: 4, recommend: null, cost: 60, price: 90.5, currency: 'EUR', comment: '' });
  assert.match(parseOutcome({ result: 'on-time' }, activity, new Date(+now + 36e5), now).error, /ainda não aconteceu/);
  assert.match(parseOutcome({ result: 'late' }, activity, past, now).error, /atraso/);
  assert.match(parseOutcome({ result: 'on-time', rating: '9' }, activity, past, now).error, /1 a 5/);
  assert.equal(parseOutcome({ result: 'on-time', recommend: '0' }, activity, past, now).outcome.recommend, 0);
  assert.match(parseOutcome({ result: 'on-time', recommend: '11' }, activity, past, now).error, /0 a 10/);
  assert.match(parseOutcome({ result: 'on-time', cost: '-3' }, activity, past, now).error, /positivos/);
  assert.match(parseOutcome({ result: 'on-time' }, { partnerId: 'bolt' }, past, now).error, /parceiro/);
  assert.match(parseOutcome({ result: 'great' }, activity, past, now).error, /resultado/);
  // Desconhecido não é zero: sem custo e preço, ficam vazios.
  assert.deepEqual(parseOutcome({ result: 'on-time' }, activity, past, now).outcome.cost, null);
});

test('o NPS é % promotores (9–10) menos % detratores (0–6); sem respostas não há NPS', () => {
  assert.deepEqual(netPromoter([10, 9, 8, 7, 6, 0, null]), { nps: 0, responses: 6, promoters: 2, passives: 2, detractors: 2 });
  assert.equal(netPromoter([10, 10, 9, 7]).nps, 75);
  assert.equal(netPromoter([]).nps, null);
  // Por parceiro: sem estrelas, a recomendação entra na componente do cliente.
  const card = scorecards([partners[0]], [outcome('tuk', 1, 'on-time', { recommend: 10 }), outcome('tuk', 2, 'on-time', { recommend: 9 }), outcome('tuk', 3, 'on-time', { recommend: 3 })], now)[0];
  assert.deepEqual([card.metrics.nps, card.metrics.npsResponses, card.metrics.rating], [33, 3, null]);
  assert.ok(card.score !== null);
});

test('a pontuação junta pontualidade, clientes, fiabilidade e margem, por tipo e só com dados suficientes', () => {
  const cards = scorecards(partners, [
    outcome('tuk', 1, 'on-time', { rating: 5, cost: 60, price: 90 }), outcome('tuk', 5, 'on-time', { rating: 5, cost: 60, price: 90 }), outcome('tuk', 9, 'late', { delayMinutes: 10, rating: 4 }),
    outcome('tuk2', 2, 'no-show', { cost: 0, price: 0 }), outcome('tuk2', 3, 'late', { delayMinutes: 40, rating: 2, cost: 70, price: 80 }), outcome('tuk2', 4, 'on-time', { rating: 3, cost: 70, price: 80 }),
    outcome('van', 1, 'on-time', { rating: 5 }), outcome('van', 200, 'no-show'),
  ], now);
  const card = id => cards.find(item => item.id === id);
  assert.equal(card('tuk').rank, 1);
  assert.equal(card('tuk2').rank, 2);
  assert.ok(card('tuk').score > card('tuk2').score);
  assert.deepEqual([card('tuk').metrics.punctuality, card('tuk').metrics.averageDelay, card('tuk').metrics.rating, card('tuk').metrics.margin, card('tuk').metrics.roi], [0.67, 10, 4.7, 0.33, 0.5]);
  // A falta cobrada a 0 € conta na fiabilidade, não no preço por pessoa nem na margem.
  assert.deepEqual([card('tuk2').metrics.noShows, card('tuk2').metrics.reliability, card('tuk2').metrics.pricePerPerson], [1, 0.67, 40]);
  // Só 1 serviço nos últimos 90 dias (o outro é antigo): sem pontuação nem posição.
  assert.deepEqual([card('van').score, card('van').rank, card('van').metrics.services], [null, undefined, 1]);
  // Moedas diferentes nunca se somam.
  const mixed = scorecards([partners[0]], [outcome('tuk', 1, 'on-time', { cost: 10, price: 20 }), outcome('tuk', 2, 'on-time', { cost: 10, price: 20, currency: 'USD' })], now)[0].metrics;
  assert.deepEqual(Object.keys(mixed.byCurrency).sort(), ['EUR', 'USD']);
  assert.equal(mixed.pricePerPerson, null);
});

test('a Agenda regista o resultado e a página de parceiros devolve a avaliação', async () => {
  const records = [];
  const activity = { recordKey: { S: 'ACTIVITY#act-00000001' }, activityId: { S: 'act-00000001' }, kind: { S: 'pickup' }, title: { S: 'Recolha' }, date: { S: '2026-10-27' }, time: { S: '09:30' }, repeatUntil: { S: '2026-10-29' }, people: { S: '2' }, partnerId: { S: 'tuk' } };
  const handler = createApp({
    now: () => now, partners,
    queryRecords: async (id, prefix) => (prefix === 'ACTIVITY#' ? [activity] : []),
    putRecords: async (id, list) => records.push(...list.map(record => ({ conversationId: id, ...record }))),
    queryAgenda: async status => records.filter(record => record.followUpStatus === status).map(record => Object.fromEntries(Object.entries(record).map(([key, value]) => [key, { S: String(value) }]))),
  });
  const post = (date, body, groups = '[curators]') => handler({ routeKey: 'POST /v1/leads/{id}/activities/{activityId}/outcome', pathParameters: { id: 'BLU-AAAAAAAA0001', activityId: 'act-00000001' }, body: JSON.stringify({ date, ...body }), requestContext: { authorizer: { jwt: { claims: { email: 'ana@blu.pt', 'cognito:groups': groups } } } } });
  assert.equal((await post('2026-10-27', { result: 'on-time', rating: '5', cost: '50', price: '80' })).statusCode, 201);
  assert.equal((await post('2026-10-29', { result: 'on-time' })).statusCode, 400);
  assert.equal((await post('2026-10-20', { result: 'on-time' })).statusCode, 400);
  assert.equal((await post('2026-10-27', { result: 'on-time' }, '[marketing]')).statusCode, 403);
  assert.deepEqual([records[0].recordKey, records[0].followUpStatus, records[0].partnerId, records[0].followUpAt], ['OUTCOME#act-00000001#2026-10-27', OUTCOME_STATUS, 'tuk', '2026-10-27T09:30:00.000Z']);
  const response = await handler({ routeKey: 'GET /v1/partners', requestContext: { authorizer: { jwt: { claims: { email: 'ana@blu.pt', 'cognito:groups': '[curators]' } } } } });
  const { scorecards: cards } = JSON.parse(response.body);
  assert.deepEqual(cards.find(card => card.id === 'tuk').metrics.services, 1);
  assert.equal(cards.find(card => card.id === 'tuk').recent[0].rating, 5);
});
