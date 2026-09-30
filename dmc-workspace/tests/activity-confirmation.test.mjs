import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initialConfirmation, validateConfirmation, applyConfirmation, outstandingChecks } from '../src/lib/activity-confirmation.ts';
import { applyCommand } from '../src/lib/curation.ts';
import { renderPdf } from '../src/lib/itinerary-pdf.ts';
import { VersionStore } from '../src/lib/version-store.ts';
const item = { id: 'a', title: 'Visit', time: 'Por agendar', category: 'activity', pendingChecks: ['Disponibilidade', 'Acessibilidade'] };
const confirmed = () => ({ ...initialConfirmation(item), status: 'confirmed', time: '10:30', location: 'Entrada principal', price: '20 EUR por pessoa', notes: 'Fornecedor confirmou por email', reference: 'BLU-123', confirmedAt: '2026-09-30T12:00:00Z', checks: item.pendingChecks.map(label => ({ label, resolved: true, details: 'Validado com fornecedor' })) });
test('partial progress preserves unresolved checks and confirmation requires evidence', () => {
 const partial = initialConfirmation(item);
 partial.checks[0] = { ...partial.checks[0], resolved: true, details: 'Disponível' };
 assert.deepEqual(outstandingChecks(applyConfirmation(item, partial)), ['Acessibilidade']);
 assert.throws(() => validateConfirmation(item, { ...partial, status: 'confirmed' }));
 assert.throws(() => validateConfirmation(item, { ...confirmed(), checks: [] }));
 assert.doesNotThrow(() => validateConfirmation(item, { ...confirmed(), notes: '' }));
 assert.throws(() => validateConfirmation({ ...item, pendingChecks: [] }, { ...confirmed(), checks: [], notes: '' }));
 assert.throws(() => validateConfirmation(item, { ...confirmed(), time: '25:90' }));
 assert.throws(() => applyConfirmation({ ...item, isLocked: true }, confirmed()));
 assert.equal(applyConfirmation(item, confirmed()).time, '10:30');
 assert.equal(applyCommand([{ dayNumber: 1, items: [applyConfirmation(item, confirmed())] }], 'remover ultima atividade do dia 1').itinerary[0].items.length, 1);
});
test('catalog data prefill fields without treating opening hours or prices as confirmed bookings', () => {
 const enriched = { ...item, priceNote: 'Referência, confirmar: 20 EUR', catalogDetails: { location: 'Rua A, Lisboa', price: '20 EUR por pessoa', supplier: 'Operador', contact: 'contact@example.com', hours: '09:00–18:00', accessibility: 'Entrada acessível', dietary: '', verification: 'Fonte consultada' } };
 const initial = initialConfirmation(enriched);
 assert.equal(initial.location, 'Rua A, Lisboa'); assert.equal(initial.supplier, 'Operador');
 assert.equal(initial.contact, 'contact@example.com'); assert.equal(initial.price, '20 EUR por pessoa');
 assert.equal(initial.time, ''); assert.equal(initial.status, 'pending');
 assert.equal(initial.checks.find(c => c.label === 'Acessibilidade').details, 'Entrada acessível');
 assert.ok(initial.checks.every(c => !c.resolved));
 const manual = { ...initial, price: '15 EUR', contact: '' };
 assert.deepEqual(initialConfirmation({ ...enriched, confirmation: manual }), manual);
 assert.equal(initialConfirmation({ ...item, priceNote: 'Referência, confirmar: sem preço' }).price, '');
 assert.equal(initialConfirmation({ ...item, priceNote: 'Referência, confirmar: 0 EUR' }).price, '0 EUR');
});
test('confirmation versions persist, reopen as pending and appear in PDF without unresolved labels', async () => {
 const root = mkdtempSync(path.join(tmpdir(), 'blu-confirm-')); const store = new VersionStore(root);
 try {
  const snapshot = JSON.parse(readFileSync(new URL('./browser/fixture.json', import.meta.url), 'utf8'));
  snapshot.itinerary[0].items = [item];
  store.save('confirmation-test', snapshot, 'generated', null);
  snapshot.itinerary[0].items = [applyConfirmation(item, confirmed())];
  const meta = store.save('confirmation-test', snapshot, 'edited', 1);
  const capture = []; await renderPdf(snapshot, meta, { capture });
  assert.ok(capture.includes('Confirmada pelo curador'));
  assert.ok(capture.includes('Referência da reserva: BLU-123'));
  assert.ok(!capture.some(s => s.startsWith('Por confirmar:')));
  snapshot.itinerary[0].items = [applyConfirmation(snapshot.itinerary[0].items[0], { ...confirmed(), status: 'pending', confirmedAt: null })];
  store.save('confirmation-test', snapshot, 'edited', 2);
  assert.equal(JSON.parse(store.get('confirmation-test', 2).snapshot).itinerary[0].items[0].confirmation.status, 'confirmed');
  assert.equal(JSON.parse(store.get('confirmation-test', 3).snapshot).itinerary[0].items[0].confirmation.status, 'pending');
 } finally { store.close(); rmSync(root, { recursive: true, force: true }); }
});
