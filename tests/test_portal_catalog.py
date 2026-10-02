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


if __name__ == '__main__':
    unittest.main()
