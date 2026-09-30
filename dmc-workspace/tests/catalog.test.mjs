import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CatalogStore, CatalogConflict, legacyId } from '../src/lib/catalog-store.ts';
import { emptyFields } from '../src/lib/catalog-schema.ts';

const input = () => ({ category: 'atracoes', status: 'draft', baseRevision: null, reason: 'Teste', fields: { ...emptyFields(), name: 'Jardim', location: 'Lisboa', description: 'Visita ao jardim', duration: '60 min', price: '10 EUR por pessoa', accessibility: 'Entrada sem degraus', source: 'Fornecedor', effort: 'Baixo' } });
test('catalog revisions survive reopen, reject stale edits and immediately revoke published records', () => {
 const root = mkdtempSync(path.join(tmpdir(), 'blu-catalog-'));
 let store = new CatalogStore(root);
 try {
  const first = store.save(input());
  const approved = store.save({ ...input(), id: first.id, baseRevision: 1, status: 'approved' });
  const warehouse = { _catalog_id: first.id, _catalog_revision: 2, _catalog_status: 'approved' };
  assert.ok(store.isPublished(warehouse));
  assert.throws(() => store.save({ ...input(), id: first.id, baseRevision: 1 }), CatalogConflict);
  const inactive = store.save({ ...input(), id: first.id, baseRevision: 2, status: 'inactive' });
  assert.equal(inactive.id, approved.id);
  assert.ok(!store.isPublished(warehouse));
  assert.equal(store.history(first.id).length, 3);
  assert.equal(store.history(first.id)[2].status, 'draft');
  store.close(); store = new CatalogStore(root);
  assert.equal(store.list()[0].revision, 3);
  assert.throws(() => store.save({ ...input(), fields: { ...emptyFields(), name: 'Incomplete' }, status: 'approved' }));
  assert.throws(() => store.save({ ...input(), id: first.id, category: 'experiencias', baseRevision: 3 }));
  const legacy = { ...input(), fields: { ...input().fields, effort: 'Moderado (estimativa; confirmar mobilidade)' } };
  assert.equal(store.save({ ...legacy, status: 'inactive' }).status, 'inactive');
  assert.throws(() => store.save({ ...legacy, status: 'approved' }));
 } finally { store.close(); rmSync(root, { recursive: true, force: true }); }
});
test('warehouse import is idempotent and does not overwrite edits or approve legacy rows', () => {
 const root = mkdtempSync(path.join(tmpdir(), 'blu-catalog-'));
 const store = new CatalogStore(root);
 try {
  store.importWarehouse(path.resolve('../warehouse'));
  const initial = store.list();
  assert.ok(initial.length > 0); assert.ok(initial.every(r => r.status === 'review'));
  const first = initial[0];
  store.save({ ...first, baseRevision: first.revision, fields: { ...first.fields, name: 'Nome alterado' }, reason: 'Correção' });
  store.importWarehouse(path.resolve('../warehouse'));
  assert.equal(store.list().length, initial.length);
  assert.equal(store.history(first.id).length, 2);
  assert.equal(store.history(first.id)[0].fields.name, 'Nome alterado');
  assert.equal(legacyId('atracoes', { id: 'LIS-001' }), 'cat-6b1b41b232f37c32ae029219552d3716');
 } finally { store.close(); rmSync(root, { recursive: true, force: true }); }
});
