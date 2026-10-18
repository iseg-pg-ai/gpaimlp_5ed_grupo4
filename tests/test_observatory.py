"""Normalização e evidência não podem transformar desconhecidos em certezas."""
import copy
import unittest
from datetime import date

from etl.observatory import build_observatory, evidence, iso_date, location, rules, temporal_state, unit

TODAY = date(2026, 10, 16)


class ObservatoryTest(unittest.TestCase):
    def setUp(self):
        self.rules = rules()

    def test_locality_aliases_and_explicit_segments(self):
        for raw, expected in [('  Evora ', 'Évora'), ('Azóia (Sintra)', 'Sintra'), ('Lisboa — Chiado', 'Lisboa'), ('Rua de Santa Justa, 87, Baixa, Lisboa', 'Lisboa')]:
            self.assertEqual(location(raw, self.rules)['destination'], expected)
        self.assertEqual(location('Ílhavo, região de Aveiro', self.rules)['destination'], 'Ílhavo')

    def test_regions_remain_regions(self):
        result = location('Vale de Gontelho, a 4 km do Pinhão, Douro', self.rules)
        self.assertEqual((result['destination'], result['geographic_scope']), ('Douro', 'região'))
        result = location('Região de Aveiro — local a confirmar', self.rules)
        self.assertEqual((result['destination'], result['geographic_scope']), ('Região de Aveiro', 'região'))

    def test_ambiguous_unknown_and_substrings_do_not_become_destinations(self):
        for raw in ['Lisboa / Porto', 'Por confirmar', None, 'Nova Lisboa', 'Hotel Lisboa', 'Lisboa ou Porto']:
            self.assertIsNone(location(raw, self.rules)['destination'])

    def test_units_preserve_conditions_and_do_not_infer_shared_price(self):
        for raw, expected in [('Por pessoa', 'pessoa'), ('por pessoa; 1h30', 'pessoa'), ('por grupo', 'grupo'), ('por grupo (2 adultos + 2 jovens; máximo 4 pessoas)', 'grupo'), ('por pessoa / atividade', 'pessoa / atividade')]:
            result = unit(raw, self.rules)
            self.assertEqual(result['normalized_unit'], expected)
            self.assertEqual(result['unit_conditions'], raw)
        self.assertIsNone(unit('Compartilhada; até 12 participantes', self.rules)['normalized_unit'])
        self.assertIsNone(unit(None, self.rules)['normalized_unit'])

    def confirmed(self):
        return {'preco': '25 EUR', 'preco_confirmacao': 'confirmado', 'preco_verificado_em': '2026-10-01',
                'preco_valido_desde': '2026-10-01', 'preco_valido_ate': '2026-10-31',
                'preco_fonte_confirmacao': 'https://example.org/tarifa', 'preco_valor_confirmado': '25 EUR'}

    def test_confirmation_requires_source_date_and_same_value(self):
        for missing in ['preco_verificado_em', 'preco_fonte_confirmacao', 'preco_valor_confirmado']:
            row = self.confirmed()
            row.pop(missing)
            result = evidence(row, 'preco', TODAY)
            self.assertEqual(result['confirmation'], 'pendente')
            self.assertFalse(result['commercially_usable'])
        row = self.confirmed()
        row['preco'] = '30 EUR'
        self.assertEqual(evidence(row, 'preco', TODAY)['confirmation'], 'pendente')

    def test_sparse_sqlite_metadata_nulls_remain_pending(self):
        result = evidence({'preco': 25, 'preco_confirmacao': None, 'preco_verificado_em': None}, 'preco', TODAY)
        self.assertEqual(result['confirmation'], 'pendente')
        self.assertFalse(result['commercially_usable'])

    def test_blank_or_explicitly_unknown_values_cannot_be_confirmed(self):
        for value in ('', '  ', 'Por confirmar', None, float('nan')):
            row = self.confirmed()
            row.update(preco=value, preco_valor_confirmado=value)
            self.assertEqual(evidence(row, 'preco', TODAY)['confirmation'], 'pendente')

    def test_excel_and_sqlite_numeric_representation_preserves_confirmation(self):
        row = self.confirmed()
        row.update(preco=5.0, preco_valor_confirmado=5)
        self.assertTrue(evidence(row, 'preco', TODAY)['commercially_usable'])

    def test_known_zero_can_be_explicitly_confirmed(self):
        row = self.confirmed()
        row.update(preco=0, preco_valor_confirmado=0)
        self.assertTrue(evidence(row, 'preco', TODAY)['commercially_usable'])

    def test_unknown_dates_are_not_renewed_by_etl(self):
        row = self.confirmed()
        row.pop('preco_valido_ate')
        result = evidence(row, 'preco', TODAY)
        self.assertEqual(result['confirmation'], 'confirmado')
        self.assertEqual(result['temporal_state'], 'prazo_desconhecido')
        self.assertFalse(result['commercially_usable'])
        self.assertEqual(evidence({'preco': 15, 'data_de_verificacao': '2026-10-01'}, 'preco', TODAY)['confirmation'], 'pendente')

    def test_expiration_and_future_window_are_inclusive_and_reassessed(self):
        row = self.confirmed()
        self.assertTrue(evidence(row, 'preco', date(2026, 10, 31))['commercially_usable'])
        self.assertEqual(evidence(row, 'preco', date(2026, 11, 1))['temporal_state'], 'expirada')
        self.assertEqual(temporal_state(date(2026, 11, 1), date(2026, 12, 1), TODAY), 'não_iniciada')

    def test_invalid_evidence_blocks_delivery(self):
        for change in [{'preco_confirmacao': 'aprovado'}, {'preco_verificado_em': '2027-01-01'}, {'preco_valido_ate': '2026-09-01'}, {'preco_valido_desde': 'ontem'}]:
            with self.assertRaises(ValueError):
                evidence({**self.confirmed(), **change}, 'preco', TODAY)
        with self.assertRaises(ValueError):
            iso_date('2026-10-01 lixo')

    def test_build_keeps_sources_and_identity(self):
        tables = {'atracoes': [{'id': 'A1', '_catalog_id': 'cat-a1', 'nome_da_atracao': 'Jardim', 'cidade': 'Lisboa — Chiado'}],
                  'precos': [{'id': 'P1', 'unidade': 'Compartilhada', 'preco_referencia_eur': 30}]}
        original = copy.deepcopy(tables)
        result = build_observatory(tables, today=TODAY)
        self.assertEqual(tables, original)
        catalog = result['model_observatory_catalog'][0]
        self.assertEqual(catalog['entity_key'], 'Atração:A1')
        self.assertEqual(catalog['catalog_id'], 'cat-a1')
        self.assertEqual(catalog['raw_location'], 'Lisboa — Chiado')
        self.assertEqual(len(result['model_field_evidence']), 8)
        self.assertTrue(all(r['confirmation'] == 'pendente' for r in result['model_field_evidence']))


if __name__ == '__main__':
    unittest.main()
