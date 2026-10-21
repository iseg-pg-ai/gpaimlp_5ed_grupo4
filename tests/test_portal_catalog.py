import json
import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path
from etl.portal_catalog import integrate_portal, legacy_id


class PortalCatalogTest(unittest.TestCase):
    def test_merge_preserves_identity_and_read_only_history(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / 'portal').mkdir()
            database = root / 'portal/catalog.sqlite'
            old = {'id': 'LIS-001', 'nome_da_atracao': 'Original', '_source_sheet': 'ATRACOES', '_source_row': 7}
            identity = legacy_id('atracoes', old)
            self.assertEqual(identity, 'cat-6b1b41b232f37c32ae029219552d3716')
            fields = dict.fromkeys(['name', 'location', 'address', 'description', 'duration', 'price', 'contacts', 'accessibility', 'source', 'effort', 'kind', 'hours', 'cuisine', 'dietary', 'provider', 'modality'], '')
            fields.update(name='Nome revisto', location='Lisboa', duration='60 min', price='10 EUR', source='Fornecedor')
            records = [dict(id=identity, category='atracoes', status='approved', revision=2, fields=fields, raw=old),
                       dict(id='cat-new-experience', category='experiencias', status='inactive', revision=3, fields=fields, raw={}),
                       dict(id='cat-new-restaurant', category='restaurantes', status='draft', revision=1, fields=fields, raw={})]
            with closing(sqlite3.connect(database)) as db:
                db.execute('CREATE TABLE catalog_records (id TEXT PRIMARY KEY, snapshot TEXT NOT NULL)')
                db.executemany('INSERT INTO catalog_records VALUES (?,?)', [(r['id'], json.dumps(r)) for r in records])
                db.commit()
            before = database.read_bytes()
            tables = {'atracoes': [old, {'id': 'LIS-002'}], 'experiencias': [], 'restaurantes': []}
            manifest = integrate_portal(root, tables)
            self.assertEqual(len(tables['atracoes']), 2)
            self.assertEqual(tables['atracoes'][0]['nome_da_atracao'], 'Nome revisto')
            self.assertEqual(tables['atracoes'][0]['_catalog_revision'], 2)
            self.assertEqual(tables['atracoes'][1]['_catalog_status'], 'review')
            self.assertEqual(tables['restaurantes'][0]['_catalog_status'], 'draft')
            self.assertEqual(tables['experiencias'][0]['_catalog_status'], 'inactive')
            self.assertEqual(database.read_bytes(), before)
            self.assertEqual(manifest['records'], 3)

    def test_no_portal_source_means_no_implicit_approval(self):
        with tempfile.TemporaryDirectory() as temporary:
            tables = {'atracoes': [{'id': 'LIS-001'}]}
            integrate_portal(Path(temporary), tables)
            self.assertEqual(tables['atracoes'][0]['_catalog_status'], 'review')

    def test_duplicate_source_ids_are_rejected_not_silently_merged(self):
        with tempfile.TemporaryDirectory() as temporary:
            with self.assertRaisesRegex(ValueError, 'Duplicate source'):
                integrate_portal(Path(temporary), {'atracoes': [{'id': 'LIS-001'}, {'id': 'LIS-001'}]})


class CatalogStoreTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        from etl.portal_catalog import CatalogStore
        self.store = CatalogStore(self.root / 'portal')
        self.addCleanup(self.store.close)

    def value(self, **changes):
        return {'category': 'atracoes', 'status': 'draft', 'baseRevision': None,
                'fields': {'name': 'Jardim'}, 'reason': 'Teste', **changes}

    def test_revisions_history_inheritance_and_rollback(self):
        from etl.portal_catalog import CatalogConflict
        first = self.store.save_validated(self.value(pricing={'amount': '12,50'}, matching={'food': 'no'}))
        approved = self.store.save_validated(self.value(id=first['id'], baseRevision=1, status='approved'))
        self.assertEqual(approved['revision'], 2)
        self.assertEqual(approved['pricing'], first['pricing'])
        with self.assertRaises(CatalogConflict):
            self.store.save_validated(self.value(id=first['id'], baseRevision=1))
        with self.assertRaisesRegex(ValueError, 'categoria'):
            self.store.save_validated(self.value(id=first['id'], baseRevision=2, category='experiencias'))
        self.assertEqual([row['revision'] for row in self.store.history(first['id'])], [2, 1])
        self.assertEqual(self.store.list()[0]['status'], 'approved')

    def test_existing_database_is_read_without_schema_or_history_rewrite(self):
        before = (self.root / 'portal/catalog.sqlite').read_bytes()
        from etl.portal_catalog import CatalogStore
        second = CatalogStore(self.root / 'portal')
        try:
            self.assertEqual(second.list(), [])
        finally:
            second.close()
        self.assertEqual((self.root / 'portal/catalog.sqlite').read_bytes(), before)

    def test_concurrent_edits_allow_only_one_revision(self):
        from concurrent.futures import ThreadPoolExecutor
        from threading import Barrier
        from etl.portal_catalog import CatalogStore, CatalogConflict
        first = self.store.save_validated(self.value())
        barrier = Barrier(2)
        def edit(name):
            store = CatalogStore(self.root / 'portal')
            try:
                barrier.wait(timeout=5)
                return store.save_validated(self.value(id=first['id'], baseRevision=1, fields={'name': name}))
            except CatalogConflict:
                return 'conflict'
            finally:
                store.close()
        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(edit, ['A', 'B']))
        self.assertEqual(results.count('conflict'), 1)
        self.assertEqual(len(self.store.history(first['id'])), 2)

    def test_import_is_idempotent_and_preserves_edits(self):
        warehouse = self.root / 'warehouse'
        warehouse.mkdir()
        for category in ('atracoes', 'restaurantes', 'experiencias'):
            (warehouse / f'{category}.jsonl').write_text(json.dumps({'id': category, 'nome_da_atracao': 'Original'}), encoding='utf-8')
        self.store.import_warehouse(warehouse)
        records = self.store.list()
        self.assertEqual(len(records), 3)
        self.assertTrue(all(row['status'] == 'review' for row in records))
        first = records[0]
        self.store.save_validated(self.value(id=first['id'], category=first['category'], baseRevision=1, fields={'name': 'Editado'}))
        self.store.import_warehouse(warehouse)
        self.assertEqual(len(self.store.list()), 3)
        self.assertEqual(self.store.history(first['id'])[0]['fields']['name'], 'Editado')

    def test_inactivation_revokes_publication_and_old_history_is_preserved(self):
        first = self.store.save_validated(self.value(status='approved'))
        row = {'_catalog_id': first['id'], '_catalog_status': 'approved', '_catalog_revision': 1}
        self.assertEqual(self.store.published_flags([row]), [True])
        self.store.save_validated(self.value(id=first['id'], baseRevision=1, status='inactive'))
        self.assertEqual(self.store.published_flags([{**row, '_catalog_revision': 5}]), [False])
        self.assertEqual(len(self.store.history(first['id'])), 2)
        self.assertEqual(self.store.list()[0]['revision'], 2)

    def test_published_catalog_applies_revision_gate_and_rule_overrides(self):
        from etl.portal_catalog import load_published_catalog
        record = self.store.save_validated(self.value(status='approved'))
        warehouse = self.root / 'warehouse'
        warehouse.mkdir()
        row = {'_catalog_id': record['id'], '_catalog_status': 'approved', '_catalog_revision': 1}
        for category in ('atracoes', 'restaurantes', 'experiencias'):
            (warehouse / f'{category}.jsonl').write_text(json.dumps(row) if category == 'atracoes' else '', encoding='utf-8')
        (warehouse / 'curation_rules.jsonl').write_text(json.dumps({'id': 'R01', 'state': 'old', 'other': 1}), encoding='utf-8')
        overrides = self.root / 'overrides.json'
        overrides.write_text(json.dumps({'R01': {'state': 'new'}}), encoding='utf-8')
        catalog = load_published_catalog(self.store, warehouse, overrides)
        self.assertEqual(catalog['atracoes'], [row])
        self.assertEqual(catalog['curation_rules'], [{'id': 'R01', 'state': 'new', 'other': 1}])
        self.store.save_validated(self.value(id=record['id'], baseRevision=1, status='inactive'))
        self.assertEqual(load_published_catalog(self.store, warehouse, overrides)['atracoes'], [])

    def test_transaction_rolls_back_both_tables_when_second_write_fails(self):
        self.store.db.execute("CREATE TRIGGER fail_record BEFORE INSERT ON catalog_records BEGIN SELECT RAISE(ABORT, 'forced'); END")
        with self.assertRaises(sqlite3.IntegrityError):
            self.store.save_validated(self.value())
        self.assertEqual(self.store.db.execute('SELECT COUNT(*) FROM catalog_history').fetchone()[0], 0)
        self.assertEqual(self.store.list(), [])


if __name__ == '__main__':
    unittest.main()
