import test from 'node:test';
import assert from 'node:assert/strict';
import { RECO, partySize, recommend } from '../lambda/intranet/recommend.mjs';

const partners = [
  { id: 'tuk-alfama', name: 'Tuk-tuk Alfama', kind: 'tuk-tuk', area: 'Lisboa: Alfama, Baixa, Graça', seats: 6 },
  { id: 'tuk-belem', name: 'Tuk-tuk Belém', kind: 'tuk-tuk', area: 'Lisboa: Belém, Ajuda', seats: 6 },
  { id: 'transfer-sintra', name: 'Transfer Sintra', kind: 'transfer', area: 'Sintra, Cascais, aeroporto', seats: 8 },
  { id: 'guide-porto', name: 'Guia Porto', kind: 'guide', area: 'Porto, Vale do Douro', seats: 12 },
];
const lead = (destination, party = '2 adults') => ({ journey: { destination, party } });

test('party size adds every number in the description', () => {
  assert.equal(partySize('2 adults, 1 child'), 3);
  assert.equal(partySize(''), 0);
});

test('only partners that serve the trip area are recommended, best first, at most two', () => {
  const result = recommend(lead('Lisboa and Sintra'), partners, [{ id: 'transfer-sintra', score: 90 }, { id: 'tuk-alfama', score: 60 }, { id: 'tuk-belem', score: 40 }]);
  assert.deepEqual(result.items.map(item => item.partnerId), ['transfer-sintra', 'tuk-alfama']);
  assert.equal(result.basis, 'heuristic');
  assert.ok(result.items.every(item => item.reasons.length >= 3));
  assert.deepEqual(recommend(lead('Algarve'), partners, []).items, []);
  assert.deepEqual(recommend(lead('Porto'), partners, []).items.map(item => item.partnerId), ['guide-porto']);
});

test('accents are ignored and a group larger than the seats is flagged', () => {
  const result = recommend(lead('belem', '5 adults, 3 children'), partners, []);
  assert.equal(result.items[0].partnerId, 'tuk-belem');
  assert.match(result.items[0].reasons.join(' '), /Só 6 lugares para 8 pessoas/);
});

test('with enough outcomes the order learns from what customers accepted', () => {
  const history = [
    ...Array.from({ length: 8 }, () => ({ partnerId: 'tuk-belem', outcome: 'sent' })),
    ...Array.from({ length: 4 }, () => ({ partnerId: 'tuk-alfama', outcome: 'sent' })),
    ...Array.from({ length: 4 }, () => ({ partnerId: 'tuk-alfama', outcome: 'accepted' })),
  ];
  assert.ok(history.length >= RECO.minLearned);
  const result = recommend(lead('Lisboa'), partners, [], history);
  assert.equal(result.basis, 'learned');
  assert.equal(result.items[0].partnerId, 'tuk-alfama');
  assert.match(result.items[0].reasons.join(' '), /Aceite em 4 de 8|Aceite em 4 de 4/);
});
