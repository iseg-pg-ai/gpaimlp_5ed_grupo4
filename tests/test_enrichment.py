"""Enriquecimento real não pode apagar valores, rever histórico ou perder provas."""
import copy
import tempfile
import unittest
from pathlib import Path

from etl.enrichment import apply_verified, flatten_evidence, integrate_price_references, price_references, unknown
from etl.portal_catalog import CatalogStore, CatalogConflict, integrate_portal


class EnrichmentTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.store = CatalogStore(self.root / 'portal')
        self.addCleanup(self.store.close)
        fields = dict.fromkeys(['name','location','address','description','duration','price','contacts','accessibility','source','effort','kind','hours','cuisine','dietary','provider','modality'], '')
        fields.update(name='Museu',location='Lisboa',source='Fonte anterior',price='Por confirmar',effort='Por confirmar')
        self.original = {'id': 'cat-1234567890123456','category':'atracoes','status':'approved','revision':1,'fields':fields,
                         'raw':{'id':'A1','latitude':38.7,'longitude':-9.1,'dias_de_encerramento':'Segunda-feira'},
                         'updatedAt':'2026-10-01','reason':'Original'}
        with self.store.transaction():self.store._write(self.original)

    def change(self, identity=None):
        return {'id':identity or self.original['id'],'baseRevision':1,'fields':{'address':'Rua do Museu, 1'},
                'evidence':{'address':{'confirmacao':'confirmado','verificado_em':'2026-10-01',
                                     'fonte_confirmacao':'https://example.org/museu','valor_confirmado':'Rua do Museu, 1'}}}

    def test_revision_and_source_data_survive_regular_save_and_etl(self):
        saved = apply_verified(self.store,[self.change()])[0]
        self.assertEqual(saved['revision'],2)
        self.assertEqual(self.store.history(saved['id'])[1], self.original)
        updated = self.store.save_validated({'id':saved['id'],'baseRevision':2,'category':'atracoes','status':'approved',
                                            'fields':saved['fields'],'reason':'Revisão posterior'})
        self.assertEqual(updated['sourceData'], saved['sourceData'])
        tables = {'atracoes':[]}
        integrate_portal(self.root,tables)
        row = tables['atracoes'][0]
        self.assertEqual(row['morada'],'Rua do Museu, 1')
        self.assertEqual(row['morada_valor_confirmado'], 'Rua do Museu, 1')
        self.assertEqual(row['latitude'],38.7)

    def test_batch_is_atomic_on_conflict(self):
        other = copy.deepcopy(self.original);other['id']='cat-abcdefghijklmnop'
        with self.store.transaction():self.store._write(other)
        second=self.change(other['id']);second['baseRevision']=9
        with self.assertRaises(CatalogConflict):apply_verified(self.store,[self.change(),second])
        self.assertTrue(all(row['revision']==1 for row in self.store.list()))

    def test_known_fields_are_not_overwritten(self):
        change = self.change();change['fields']={'source':'https://example.org'}
        with self.assertRaisesRegex(ValueError,'desconhecidos'):apply_verified(self.store,[change])
        self.assertEqual(len(self.store.history(self.original['id'])),1)

    def test_each_field_requires_matching_evidence(self):
        for proof in ({}, {'address':{'confirmacao':'confirmado','verificado_em':'2026-10-01',
                                     'fonte_confirmacao':'https://example.org','valor_confirmado':'Outro'}}):
            change = self.change();change['evidence']=proof
            with self.assertRaises(ValueError):apply_verified(self.store,[change])
        self.assertEqual(self.store.list()[0]['revision'],1)

    def test_operational_enrichment_keeps_existing_coordinates_and_closures(self):
        change = self.change();change['operational']={'reservations':'Reserva pelo site'}
        change['evidence']['reservations']={'confirmacao':'confirmado','verificado_em':'2026-10-01',
                                            'fonte_confirmacao':'https://example.org','valor_confirmado':'Reserva pelo site'}
        apply_verified(self.store,[change])
        tables={'atracoes':[]};integrate_portal(self.root,tables)
        row=tables['atracoes'][0]
        self.assertEqual((row['latitude'],row['longitude'],row['dias_de_encerramento']),(38.7,-9.1,'Segunda-feira'))

    def test_metadata_cannot_override_identity(self):
        with self.assertRaises(ValueError):flatten_evidence({}, {'fieldEvidence':{'id':{'valor_confirmado':'evil'}}})

    def reference(self):
        return {'id':'A1','name':'Museu','values':{'preco_referencia_eur':5},'conditions':'Bilhete público por pessoa; não é custo BLU.',
                'evidence':{'preco_referencia_eur':{'confirmacao':'confirmado','verificado_em':'2026-10-01',
                                                 'fonte_confirmacao':'https://example.org/tarifa','valor_confirmado':5}}}

    def test_price_reference_requires_exact_identity_and_fills_only_missing(self):
        record=copy.deepcopy(self.original);record['sourceData']={'priceReferences':[self.reference()]}
        tables={'precos':[{'id':'A1','nome_modalidade':'Museu','preco_referencia_eur':None}]}
        integrate_price_references(tables,[record])
        self.assertEqual(tables['precos'][0]['preco_referencia_eur'],5)
        self.assertEqual(tables['verified_enrichment_changes'][0]['catalog_revision'],1)
        tables['precos'][0]['preco_referencia_eur']=7
        integrate_price_references(tables,[record])
        self.assertEqual(tables['precos'][0]['preco_referencia_eur'],7)
        self.assertFalse(tables['verified_enrichment_changes'])
        bad=self.reference();bad['id']='A2'
        with self.assertRaises(ValueError):price_references(record,[bad])

    def test_divergent_known_price_does_not_receive_new_values_or_conditions(self):
        record=copy.deepcopy(self.original);record['sourceData']={'priceReferences':[self.reference()]}
        tables={'precos':[{'id':'A1','nome_modalidade':'Museu','preco_referencia_eur':7}]}
        integrate_price_references(tables,[record])
        self.assertEqual(tables['precos'][0], {'id':'A1','nome_modalidade':'Museu','preco_referencia_eur':7})
        self.assertFalse(tables['verified_enrichment_changes'])

    def test_draft_price_reference_is_not_published(self):
        record=copy.deepcopy(self.original);record['status']='draft';record['sourceData']={'priceReferences':[self.reference()]}
        tables={'precos':[{'id':'A1','nome_modalidade':'Museu','preco_referencia_eur':None}]}
        integrate_price_references(tables,[record])
        self.assertIsNone(tables['precos'][0]['preco_referencia_eur'])

    def test_known_zero_is_not_treated_as_a_missing_value(self):
        self.assertFalse(unknown(0))
        self.assertFalse(unknown(0.0))
        self.assertFalse(unknown('0'))
        self.assertTrue(unknown(None))

    def test_structured_price_is_preserved(self):
        original=copy.deepcopy(self.original);original.update(id='cat-abcdefghijklmnop',pricing={'amount':'30','status':'confirmed'})
        with self.store.transaction():self.store._write(original)
        change=self.change(original['id']);change['fields']={'price':'20 EUR'}
        with self.assertRaisesRegex(ValueError,'estruturado'):apply_verified(self.store,[change])


if __name__=='__main__':unittest.main()
