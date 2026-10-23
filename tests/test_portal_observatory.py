"""Contratos da leitura analítica nativa, com SQLite temporário."""
from contextlib import closing
from datetime import date
import hashlib
from pathlib import Path
import sqlite3
import tempfile
import unittest

from portal.observatory import observatory_snapshot


class PortalObservatoryTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.db = self.root / "blu_etl.sqlite"
        with closing(sqlite3.connect(self.db)) as conn, conn:
            conn.executescript("""
                CREATE TABLE atracoes(id TEXT, nome_da_atracao TEXT, cidade TEXT, categoria TEXT,
                    preco_da_atracao REAL, latitude REAL, longitude REAL, morada TEXT,
                    morada_confirmacao TEXT, morada_verificado_em TEXT, morada_fonte_confirmacao TEXT,
                    morada_valor_confirmado TEXT, morada_valido_desde TEXT, morada_valido_ate TEXT);
                INSERT INTO atracoes VALUES ('A1','Lugar','Lisboa','Museu',0,38.7,-9.1,'Rua 1',
                    'confirmado','2026-01-01','https://fonte.example','Rua 1','2026-01-01','2026-01-31');
                CREATE TABLE restaurantes(id_blu TEXT, estabelecimento TEXT, cidade TEXT);
                INSERT INTO restaurantes VALUES ('A1','Lugar','Lisboa');
                CREATE TABLE experiencias(nome_da_experiencia TEXT, localizacao TEXT, preco REAL);
                INSERT INTO experiencias VALUES ('Sem coordenadas','Por confirmar',NULL);
                CREATE TABLE precos(id TEXT,categoria TEXT,nome_modalidade TEXT,local TEXT,
                    unidade TEXT,preco_referencia_eur REAL,preco_publico_vs_custo TEXT);
                INSERT INTO precos VALUES ('P1','Atração','Gratuito','Lisboa','por pessoa',0,'Público');
                INSERT INTO precos VALUES ('P2','Atração','Pendente','Lisboa',NULL,NULL,'Público');
                CREATE TABLE structured_atividades(id_atracao_base TEXT,id_roteiro TEXT,nome_etapa TEXT,cidade_da_base TEXT);
                INSERT INTO structured_atividades VALUES ('A1','R1','Lugar','Lisboa');
                INSERT INTO structured_atividades VALUES ('A1','R1','Lugar','Lisboa');
                INSERT INTO structured_atividades VALUES (NULL,'R2','Lugar','Lisboa');
                CREATE TABLE structured_roteiros(id_roteiro TEXT,data_explicita TEXT);
                INSERT INTO structured_roteiros VALUES ('R1',NULL),('R2','2026-01-01');
            """)

    def snapshot(self):
        return observatory_snapshot(self.root, today=date(2026, 10, 18))

    def test_snapshot_is_read_only_and_preserves_zero_unknown_and_identity(self):
        before = hashlib.sha256(self.db.read_bytes()).digest()
        data = self.snapshot()
        self.assertEqual(hashlib.sha256(self.db.read_bytes()).digest(), before)
        records = {r['key']: r for r in data['records']}
        self.assertEqual(records['Atração:A1']['details']['Preço'], 0)
        self.assertIsNone(records['Experiência:Sem coordenadas']['latitude'])
        self.assertIn('Restaurante:A1', records)
        self.assertEqual(data['prices'][0]['reference'], 0)
        self.assertIsNone(data['prices'][1]['reference'])
        self.assertIsNone(data['prices'][1]['unit'])
        self.assertIsNone(data['validation'])

    def test_evidence_is_rechecked_at_query_date(self):
        field = next(e for e in self.snapshot()['evidence'] if e['entity_key'] == 'Atração:A1' and e['field'] == 'morada')
        self.assertEqual(field['confirmation'], 'confirmado')
        self.assertEqual(field['temporal_state'], 'expirada')
        self.assertFalse(field['commercially_usable'])

    def test_history_uses_explicit_ids_and_distinct_routes(self):
        records = {r['key']: r for r in self.snapshot()['records']}
        self.assertEqual(records['Atração:A1']['historicalRoutes'], ['R1'])
        self.assertIsNone(records['Restaurante:A1']['historicalRoutes'])
        self.assertEqual(self.snapshot()['history']['datedCount'], 1)
        self.assertIsNone(self.snapshot()['history']['documentCount'])

    def test_published_location_contract_takes_precedence(self):
        with closing(sqlite3.connect(self.db)) as conn, conn:
            conn.execute('CREATE TABLE model_observatory_catalog(entity_key TEXT,destination TEXT,raw_location TEXT,geographic_scope TEXT,location_rule TEXT)')
            conn.execute("INSERT INTO model_observatory_catalog VALUES ('Atração:A1','Destino publicado','Lisboa','localidade','publicada')")
        self.assertEqual(self.snapshot()['records'][0]['destination'], 'Destino publicado')

    def test_missing_or_incomplete_delivery_does_not_create_a_database(self):
        with tempfile.TemporaryDirectory() as empty:
            with self.assertRaises(sqlite3.Error):
                observatory_snapshot(Path(empty))
            self.assertEqual(list(Path(empty).iterdir()), [])
        with closing(sqlite3.connect(self.db)) as conn, conn:
            conn.execute('DROP TABLE precos')
        with self.assertRaises(ValueError):
            self.snapshot()
