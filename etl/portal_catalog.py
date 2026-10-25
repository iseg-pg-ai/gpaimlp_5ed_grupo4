"""Catálogo operacional e integração ETL, que lê a fonte sem a modificar."""
import hashlib
import json
import re
import sqlite3
from contextlib import closing, contextmanager
from pathlib import Path
from datetime import datetime, timezone
from uuid import uuid4

CATEGORIES = ('atracoes', 'restaurantes', 'experiencias')


_MISSING = object()


def _source_string(value):
    if value is _MISSING:
        return 'undefined'
    if value is None:
        return 'null'
    if isinstance(value, bool):
        return str(value).lower()
    if isinstance(value, dict):
        return '[object Object]'
    if isinstance(value, list):
        return ','.join('' if item is None else _source_string(item) for item in value)
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


def legacy_id(category, row):
    # Preservar a seleção nullish e a representação dos IDs do portal existente.
    key = next((row[name] for name in ('id', 'id_blu', 'nome_da_experiencia')
                if row.get(name) is not None), _MISSING)
    if key is _MISSING:
        key = f"{_source_string(row.get('_source_sheet', _MISSING))}:{_source_string(row.get('_source_row', _MISSING))}"
    return 'cat-' + hashlib.sha256(f'{category}:{_source_string(key)}'.encode()).hexdigest()[:32]


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
            f = dict(record['fields'])
            pricing = record.get('pricing')
            if pricing:
                units = {'person': 'Por pessoa', 'group': 'Por grupo', 'hour': 'Por hora', 'service': 'Por serviço'}
                states = {'confirmed': 'Confirmado', 'estimated': 'Estimado', 'pending': 'Por confirmar'}
                amount = pricing['amount'].replace(',', '.')
                value = f"{amount} {pricing['currency']}" if amount else 'Valor por confirmar'
                f['price'] = f"{value} · {units[pricing['unit']]} · {states[pricing['status']]}"
                if record['fields']['price']:
                    f['price'] += ' — ' + record['fields']['price']
            row = {**record['raw'], '_catalog_id': record['id'], '_catalog_status': record['status'],
                   '_catalog_revision': record['revision'], '_catalog_source': 'portal/catalog.sqlite',
                   '_source_sheet': record['raw'].get('_source_sheet', 'PORTAL'),
                   '_source_row': record['raw'].get('_source_row', record['revision']),
                   'morada': f['address'], 'contactos': f['contacts'],
                   'acessibilidade_nivel_de_confirmacao': f['accessibility'], 'site_fonte': f['source'],
                   'esforco_fisico': f['effort'], 'horario': f['hours']}
            if record.get('operational') is not None:
                op = record['operational']
                row.update(latitude=float(op['latitude'].replace(',', '.')) if op['latitude'] else None,
                           longitude=float(op['longitude'].replace(',', '.')) if op['longitude'] else None,
                           dias_de_encerramento=op['closures'], encerramento_base_reconfirmar=op['closures'],
                           observacoes=op['observations'], necessidade_de_reserva=op['reservations'],
                           reservas_condicoes_base=op['reservations'])
            if record.get('subcategory'):
                row['subcategoria'] = record['subcategory']
            if pricing:
                row['_pricing'] = pricing
            # Keep the structured questionnaire profile intact, including explicit unknowns.
            if record.get('matching') is not None:
                row['_matching'] = dict(record['matching'])
                if pricing:
                    row['_matching']['pricePerPerson'] = float(pricing['amount'].replace(',', '.')) if pricing['currency'] == 'EUR' and pricing['unit'] == 'person' and pricing['amount'] and pricing['status'] != 'pending' else None
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
            if record.get('sourceData'):
                from etl.enrichment import flatten_evidence
                flatten_evidence(row, record['sourceData'])
            base[record['id']] = row
        tables[category] = list(base.values())
    from etl.enrichment import integrate_price_references
    integrate_price_references(tables, managed)
    # Record the exact revisions consumed rather than hashing a changing live SQLite file.
    return {'key': 'portal/catalog.sqlite', 'role': 'portal_catalog', 'records': len(managed),
            'snapshot_sha256': hashlib.sha256(json.dumps(managed, sort_keys=True, ensure_ascii=False).encode()).hexdigest()}


class CatalogConflict(ValueError):
    """A revisão recebida já não é a revisão atual."""


class CatalogStore:
    """Mesmo ficheiro e esquema SQLite; uma ligação por operação do portal."""
    def __init__(self, root):
        root = Path(root)
        root.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(root / 'catalog.sqlite', timeout=5, isolation_level=None)
        self.db.executescript('''CREATE TABLE IF NOT EXISTS catalog_records (id TEXT PRIMARY KEY, snapshot TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS catalog_history (id TEXT NOT NULL, revision INTEGER NOT NULL,
            snapshot TEXT NOT NULL, PRIMARY KEY(id,revision));
            CREATE TABLE IF NOT EXISTS portal_operations (id TEXT PRIMARY KEY,
            kind TEXT NOT NULL, result TEXT NOT NULL, created_at TEXT NOT NULL);''')

    def close(self):
        self.db.close()

    @contextmanager
    def transaction(self):
        self.db.execute('BEGIN IMMEDIATE')
        try:
            yield
            self.db.execute('COMMIT')
        except BaseException:
            self.db.execute('ROLLBACK')
            raise

    def list(self):
        return [json.loads(row[0]) for row in self.db.execute('SELECT snapshot FROM catalog_records ORDER BY id')]

    def history(self, identity):
        return [json.loads(row[0]) for row in self.db.execute(
            'SELECT snapshot FROM catalog_history WHERE id=? ORDER BY revision DESC', (identity,))]

    def _write(self, record):
        snapshot = json.dumps(record, ensure_ascii=False, separators=(',', ':'))
        self.db.execute('INSERT INTO catalog_history VALUES (?,?,?)', (record['id'], record['revision'], snapshot))
        self.db.execute('INSERT OR REPLACE INTO catalog_records VALUES (?,?)', (record['id'], snapshot))

    def import_warehouse(self, root):
        inputs = []
        for category in CATEGORIES:
            with (Path(root) / f'{category}.jsonl').open(encoding='utf-8') as stream:
                inputs.extend((category, json.loads(line)) for line in stream if line.strip())
        fields_map = {
            'name': ('nome_da_atracao', 'estabelecimento', 'nome_da_experiencia'),
            'location': ('cidade', 'localizacao'), 'address': ('morada', 'zona_bairro', 'zona_localidade'),
            'description': ('descricao_curada', 'descricao', 'proposta_de_curadoria_blu_nao_aprovada'),
            'duration': ('tempo_medio_de_visita', 'duracao', 'duracao_blu_estimativa'),
            'price': ('preco_da_atracao', 'preco', 'preco_nao_cotacao'), 'contacts': ('contactos',),
            'accessibility': ('acessibilidade_nivel_de_confirmacao',),
            'source': ('site_fonte', 'fonte_indicada_na_base'), 'effort': ('esforco_fisico',),
            'kind': ('categoria',), 'hours': ('horario', 'horario_base_reconfirmar'),
            'cuisine': ('tipo_gastronomia_base',), 'dietary': ('opcoes_alimentares_alergenios',),
            'provider': ('fornecedor',), 'modality': ('modalidade',)}
        with self.transaction():
            for category, row in inputs:
                identity = row.get('_catalog_id') if row.get('_catalog_id') is not None else legacy_id(category, row)
                if self.db.execute('SELECT id FROM catalog_records WHERE id=?', (identity,)).fetchone():
                    continue
                fields = {name: _source_string(next((row[key] for key in keys
                          if row.get(key) is not None and row[key] != ''), '')) for name, keys in fields_map.items()}
                fields['source'] = fields['source'] or f"{_source_string(row.get('_source_sheet', _MISSING))}, linha {_source_string(row.get('_source_row', _MISSING))}"
                fields['effort'] = fields['effort'] or 'Por confirmar'
                self._write({'id': identity, 'category': category, 'status': 'review', 'revision': 1,
                             'fields': fields, 'raw': row, 'updatedAt': self._now(),
                             'reason': 'Importação da base existente; requer revisão.'})

    @staticmethod
    def _now():
        return datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')

    def save_validated(self, value, operation_id=None):
        """Recebe dados validados e normalizados pelo contrato partilhado do editor/API."""
        if operation_id is not None and not re.fullmatch(r'[a-f0-9]{64}', operation_id):
            raise ValueError('Identificador da operação inválido.')
        with self.transaction():
            if operation_id:
                completed = self.db.execute(
                    "SELECT result FROM portal_operations WHERE id=? AND kind='catalog.save'",
                    (operation_id,)).fetchone()
                if completed:
                    return json.loads(completed[0])
            saved = self.db.execute('SELECT snapshot FROM catalog_records WHERE id=?', (value['id'],)).fetchone() if value.get('id') else None
            previous = json.loads(saved[0]) if saved else None
            if value.get('id') and (previous is None or previous['revision'] != value['baseRevision']):
                raise CatalogConflict('Existe uma revisão mais recente. Reabra o registo antes de guardar.')
            if previous and previous['category'] != value['category']:
                raise ValueError('A categoria de um registo existente não pode ser alterada.')
            record = {'id': previous['id'] if previous else f'cat-{uuid4()}',
                      'category': value['category'], 'status': value['status'],
                      'revision': previous['revision'] + 1 if previous else 1, 'fields': value['fields']}
            for key in ('operational', 'subcategory', 'pricing', 'matching', 'sourceData'):
                source = value if value.get(key) is not None else previous or {}
                if key in source:
                    record[key] = source[key]
            if value.get('matching') is not None and value['category'] == 'restaurantes':
                record['matching'] = {**value['matching'], 'food': 'yes'}
            record.update(raw=(previous or {}).get('raw') or {}, updatedAt=self._now(), reason=value['reason'])
            self._write(record)
            if operation_id:
                self.db.execute("INSERT INTO portal_operations VALUES (?, 'catalog.save', ?, ?)",
                                (operation_id, json.dumps(record, ensure_ascii=False,
                                                          separators=(',', ':')), self._now()))
            return record

    def published_flags(self, rows):
        result = []
        with self.transaction():
            for row in rows:
                saved = self.db.execute('SELECT snapshot FROM catalog_records WHERE id=?',
                                        (str(row['_catalog_id']),)).fetchone() if row.get('_catalog_status') == 'approved' and row.get('_catalog_id') else None
                if not saved:
                    result.append(False)
                    continue
                record = json.loads(saved[0])
                revision = row.get('_catalog_revision')
                try:
                    number = float(revision) if revision is not None else 0
                except (ValueError, TypeError):
                    number = 0
                if record['status'] != 'inactive' and record['revision'] < number:
                    record.update(revision=int(number), status='approved')
                    self.db.execute('INSERT OR REPLACE INTO catalog_records VALUES (?,?)',
                                    (record['id'], json.dumps(record, ensure_ascii=False, separators=(',', ':'))))
                    result.append(True)
                else:
                    result.append(record['status'] == 'approved' and type(revision) in (int, float) and record['revision'] == revision)
        return result


def load_published_catalog(store, warehouse, overrides_file):
    """Aplicar a mesma barreira de revisão numa transação para todo o catálogo."""
    catalog = {}
    for name in (*CATEGORIES, 'curation_rules'):
        with (Path(warehouse) / f'{name}.jsonl').open(encoding='utf-8') as stream:
            catalog[name] = [json.loads(line) for line in stream if line.strip()]
    rows = [row for category in CATEGORIES for row in catalog[category]]
    flags = iter(store.published_flags(rows))
    for category in CATEGORIES:
        catalog[category] = [row for row in catalog[category] if next(flags)]
    with Path(overrides_file).open(encoding='utf-8') as stream:
        overrides = json.load(stream)
    catalog['curation_rules'] = [{**rule, **overrides.get(_source_string(rule.get('id', _MISSING)), {})}
                                for rule in catalog['curation_rules']]
    return catalog
