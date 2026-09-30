import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyMatching, validateMatching } from '../src/lib/catalog-matching.ts';
import { generateItinerary } from '../src/lib/curation.ts';

const brief = { customerName: 'Test', destination: 'Lisboa', startDate: '2026-10-10', endDate: '2026-10-10', arrivalLocation: 'Lisboa', departureLocation: 'Lisboa', adults: 2, children: 0, childrenAges: '', budget: 200, currency: 'EUR', interests: ['Culture & Heritage'], pace: 'Relaxed', accommodation: 'Boutique', proposalTier: 'Soft', physicalEffort: 'Baixo (Low)', mobilityRestrictions: [], dietaryRestrictions: [], diningPace: 'Relaxed Dining (~90m)', morningPreference: 'Late Start (10:30+)', exclusions: [], specialOccasion: '', notes: '' };
const row = (id, matching = {}) => ({ id, cidade: 'Lisboa', nome_da_atracao: id, descricao_curada: 'Oferta', esforco_fisico: 'Baixo', _catalog_status: 'approved', _source_row: 1, _matching: { ...emptyMatching(), food: 'no', children: 'allowed', ...matching } });
function generate(rows, changes = {}, restaurants = []) {
  return generateItinerary({ ...brief, ...changes }, { atracoes: rows, restaurantes: restaurants, experiencias: [], curation_rules: ['R01', 'R03', 'R04', 'R05', 'R09', 'R15', 'R16', 'R33', 'R40', 'R41', 'R43'].map(id => ({ id })) }).itinerary.flatMap(d => d.items);
}
test('explicit interests rank an opaque title ahead of generic records and explain the match', () => {
  const result = generate([row('Generic'), row('Tagged', { interests: ['Culture & Heritage'] })]);
  assert.equal(result[0].title, 'Tagged');
  assert.ok(result[0].appliedRules.some(r => r.includes('Interesses associados')));
});
test('tier, pace, morning, dates and explicit exclusions constrain eligibility', () => {
  for (const profile of [{ tiers: ['Signature'] }, { paces: ['Active'] }, { mornings: ['Early (08:30)'] }, { validFrom: '2026-10-11' }, { validUntil: '2026-10-09' }, { excludedBy: ['No Open Boats (Sea Sickness)'] }]) {
    assert.equal(generate([row('Opaque', profile)], { exclusions: ['No Open Boats (Sea Sickness)'] }).length, 0);
  }
  assert.equal(generate([row('Inclusive', { validFrom: '2026-10-10', validUntil: '2026-10-10' })]).length, 1);
});
test('all mobility restrictions need documented matches', () => {
  const restrictions = ['Wheelchair Accessible Routes', 'Limited Walking Distance (< 1km)'];
  const changes = { mobilityRestrictions: restrictions };
  assert.equal(generate([row('Unknown')], changes).length, 0);
  assert.equal(generate([row('Partial', { mobilitySupported: restrictions.slice(0, 1), verificationNotes: 'Supplier' })], changes).length, 0);
  assert.equal(generate([row('Matched', { mobilitySupported: restrictions, verificationNotes: 'Supplier, reviewed 2026-09-30' })], changes).length, 1);
});
test('food restrictions require all verified options, including food experiences; meal pace is respected', () => {
  const dietary = ['Vegan', 'Nut Allergy'];
  const changes = { dietaryRestrictions: dietary };
  const matched = row('Restaurant', { food: 'yes', dietarySupported: dietary, verificationNotes: 'Supplier: menu and cross-contact reviewed' });
  assert.equal(generate([], changes, [matched]).length, 1);
  assert.equal(generate([], changes, [row('Unknown')]).length, 0);
  assert.equal(generate([row('Food tour', { food: 'yes' })], changes).length, 0);
  assert.equal(generate([row('Unknown experience', { food: 'unknown' })], changes).length, 0);
  assert.equal(generate([row('No food')], changes).length, 1);
  assert.equal(generate([], changes, [{ ...matched, _matching: { ...matched._matching, diningPaces: ['Quick Lunch (~40m)'] } }]).length, 0);
});
test('family eligibility, minimum ages and whole-group capacity are checked', () => {
  const family = { children: 2, childrenAges: '5, 9' };
  for (const profile of [{ children: 'unknown' }, { children: 'adults_only' }, { minAge: 6 }, { maxGroup: 3 }]) assert.equal(generate([row('Restricted', profile)], family).length, 0);
  assert.equal(generate([row('Suitable', { minAge: 5, maxGroup: 4 })], family).length, 1);
  assert.equal(generate([row('Age required', { minAge: 5 })], { ...family, childrenAges: '' }).length, 0);
  assert.equal(generate([row('Adults 21+', { minAge: 21 })]).length, 0);
});
test('known per-person costs share the trip budget across days, with children included', () => {
  const priced = [row('One', { pricePerPerson: 30 }), row('Two', { pricePerPerson: 30 }), row('Three', { pricePerPerson: 30 })];
  assert.equal(generate(priced, { children: 1, endDate: '2026-10-11', budget: 180 }).length, 2);
  assert.equal(generate([row('Free', { pricePerPerson: 0 })], { budget: 1 }).length, 1);
});
test('bad profile values and undocumented compatibility cannot be saved or generated', () => {
  assert.equal(generate([{ ...row('Unknown effort'), esforco_fisico: 'Por confirmar' }]).length, 0);
  for (const profile of [{ interests: ['invented'] }, { maxGroup: -1 }, { pricePerPerson: '20' }, { validFrom: '2026-02-30' }, { dietarySupported: ['Vegan'] }]) {
    assert.throws(() => validateMatching({ ...emptyMatching(), ...profile }));
    assert.equal(generate([row('Invalid', profile)]).length, 0);
  }
});
