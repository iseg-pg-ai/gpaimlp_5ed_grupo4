"""Merge the editable portal source into ETL output, never mutate the source."""
import hashlib
import json
import sqlite3
from contextlib import closing
from pathlib import Path

CATEGORIES = ('atracoes', 'restaurantes', 'experiencias')


def legacy_id(category, row):
    key = row.get('id', row.get('id_blu', row.get('nome_da_experiencia', f"{row.get('_source_sheet')}:{row.get('_source_row')}")))
    return 'cat-' + hashlib.sha256(f'{category}:{key}'.encode()).hexdigest()[:32]


def integrate_portal(data_dir: Path, tables: dict):
    database = data_dir / 'portal' / 'catalog.sqlite'
    managed = []
    if database.exists():
        if not database.resolve().is_relative_to(data_dir.resolve()):
            raise ValueError('Portal catalog source escapes data directory')
        with closing(sqlite3.connect(database.as_uri() + '?mode=ro', uri=True)) as conn:
            # A single read yields a consistent snapshot across concurrent edits.
            managed = [json.loads(row[0]) for row in conn.execute('SELECT snapshot FROM catalog_records ORDER BY id')]
    for category in CATEGORIES:
        base = {}
        for row in tables.get(category, []):
            identity = legacy_id(category, row)
            if identity in base:
                raise ValueError(f'Duplicate source catalog identifier: {category}/{identity}')
            base[identity] = {**row, '_catalog_id': identity, '_catalog_status': 'review', '_catalog_revision': 0}
        for record in managed:
            if record['category'] != category:
                continue
            if record['status'] not in ('draft', 'review', 'approved', 'inactive'):
                raise ValueError('Invalid portal catalog status')
            f = record['fields']
            row = {**record['raw'], '_catalog_id': record['id'], '_catalog_status': record['status'],
                   '_catalog_revision': record['revision'], '_catalog_source': 'portal/catalog.sqlite',
                   '_source_sheet': record['raw'].get('_source_sheet', 'PORTAL'),
                   '_source_row': record['raw'].get('_source_row', record['revision']),
                   'morada': f['address'], 'contactos': f['contacts'],
                   'acessibilidade_nivel_de_confirmacao': f['accessibility'], 'site_fonte': f['source'],
                   'esforco_fisico': f['effort'], 'horario': f['hours']}
            if category == 'atracoes':
                row.update(id=record['raw'].get('id', record['id']), nome_da_atracao=f['name'], cidade=f['location'],
                           descricao_curada=f['description'], tempo_medio_de_visita=f['duration'], preco_da_atracao=f['price'], categoria=f['kind'])
            elif category == 'restaurantes':
                row.update(id_blu=record['raw'].get('id_blu', record['id']), estabelecimento=f['name'], cidade=f['location'],
                           proposta_de_curadoria_blu_nao_aprovada=f['description'], duracao_blu_estimativa=f['duration'],
                           preco_nao_cotacao=f['price'], tipo_gastronomia_base=f['cuisine'], opcoes_alimentares_alergenios=f['dietary'])
            else:
                row.update(nome_da_experiencia=f['name'], localizacao=f['location'], descricao=f['description'],
                           duracao=f['duration'], preco=f['price'], fornecedor=f['provider'], modalidade=f['modality'], categoria=f['kind'])
            base[record['id']] = row
        tables[category] = list(base.values())
    # Record the exact revisions consumed rather than hashing a changing live SQLite file.
    return {'key': 'portal/catalog.sqlite', 'role': 'portal_catalog', 'records': len(managed),
            'snapshot_sha256': hashlib.sha256(json.dumps(managed, sort_keys=True, ensure_ascii=False).encode()).hexdigest()}
