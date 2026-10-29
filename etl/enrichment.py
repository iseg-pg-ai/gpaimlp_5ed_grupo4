# Completa campos com evidência verificada e conserva a distinção entre valores desconhecidos
# e confirmados.
"""Preenchimento verificável de lacunas no catálogo existente, sem inferência."""
from __future__ import annotations

import copy
from datetime import datetime, timezone
from urllib.parse import urlsplit

from etl.observatory import CATALOG, evidence, token

EXTRA_FIELDS = {'address': 'morada', 'contacts': 'contactos', 'source': 'site_fonte'}
UNKNOWN = {'', 'a confirmar', 'por confirmar', 'morada por confirmar', 'nao identificada', 'nao identificado',
           'fornecedor a confirmar', 'operador a definir', 'horario a confirmar', 'sob consulta', 'visita a confirmar; compras pelo cliente'}


def unknown(value) -> bool:
    return value is None or isinstance(value, str) and token(value) in UNKNOWN


def field_names(category: str) -> dict:
    specs = CATALOG[category][3]
    return {**EXTRA_FIELDS, 'duration': specs['Duração'], 'hours': specs['Horário'],
            'price': specs['Preço'], 'accessibility': specs['Acessibilidade'],
            'reservations': 'necessidade_de_reserva' if category != 'restaurantes' else 'reservas_condicoes_base', 'latitude': 'latitude', 'longitude': 'longitude'}


def flatten_evidence(row: dict, source_data: dict) -> None:
    """Exportar só metadados reconhecidos, sem permitir alterar IDs ou valores."""
    allowed = {name for _, _, _, specs in CATALOG.values() for name in specs.values()} | {'morada', 'contactos', 'site_fonte', 'latitude', 'longitude', 'necessidade_de_reserva', 'reservas_condicoes_base'}
    for field, entry in source_data.get('fieldEvidence', {}).items():
        if field not in allowed or not isinstance(entry, dict):
            raise ValueError('Campo de evidência desconhecido')
        for suffix in ('confirmacao', 'verificado_em', 'valido_desde', 'valido_ate', 'fonte_confirmacao', 'valor_confirmado'):
            if suffix in entry:
                row[f'{field}_{suffix}'] = entry[suffix]
        evidence(row, field, datetime.now(timezone.utc).date())


def price_references(record: dict, references: list[dict]) -> list[dict]:
    """Referência pública por ID e nome exatos; não criar preços ou relações novas."""
    validated = []
    identifiers = [ref.get('id') for ref in references]
    if len(identifiers) != len(set(identifiers)):
        raise ValueError('Referência de preço repetida')
    for ref in references:
        if record['category'] != 'atracoes' or ref.get('id') != record.get('raw', {}).get('id') or ref.get('name') != record['fields']['name']:
            raise ValueError('Relação de preço sem correspondência exata à atração')
        values = ref.get('values', {})
        if not values or set(values) - {'preco_referencia_eur', 'adulto_eur', 'senior_eur'}:
            raise ValueError('Campos de preço fora do âmbito')
        for field, value in values.items():
            import math
            if type(value) not in (int, float) or not math.isfinite(value) or value < 0:
                raise ValueError('Preço numérico inválido')
            entry = ref.get('evidence', {}).get(field, {})
            parsed = urlsplit(entry.get('fonte_confirmacao', ''))
            if parsed.scheme != 'https' or not parsed.hostname:
                raise ValueError('Preço sem fonte HTTPS')
            proof = evidence({field: value, **{f'{field}_{key}': val for key,val in entry.items()}}, field, datetime.now(timezone.utc).date())
            if proof['confirmation'] != 'confirmado':
                raise ValueError('Preço sem prova do valor exato')
        if not isinstance(ref.get('conditions'), str) or not ref['conditions'].strip():
            raise ValueError('Preço sem condições')
        validated.append(copy.deepcopy(ref))
    return validated


def integrate_price_references(tables: dict, records: list[dict]) -> None:
    """Preencher só lacunas de referências existentes, com prova na revisão aprovada."""
    index = {row['id']: row for row in tables.get('precos', [])}
    audit = []
    for record in records:
        if record['status'] != 'approved':
            continue
        references = price_references(record, record.get('sourceData', {}).get('priceReferences', []))
        for ref in references:
            row = index.get(ref['id'])
            if row is None or row.get('nome_modalidade') != ref['name']:
                raise ValueError('Referência de preço não encontrada pelo ID e nome exatos')
            if any(row.get(field) is not None and row[field] != value for field,value in ref['values'].items()):
                continue  # Não combinar uma tarifa nova com valores divergentes já preenchidos.
            filled = False
            for field, value in ref['values'].items():
                previous = row.get(field)
                if previous is not None:
                    continue  # Preservar qualquer valor da fonte, mesmo se divergir.
                row[field] = value
                filled = True
                entry = ref['evidence'][field]
                for suffix, content in entry.items():
                    row[f'{field}_{suffix}'] = content
                audit.append({'catalog_id':record['id'], 'catalog_revision':record['revision'], 'price_id':ref['id'],
                              'field':field, 'value':value, 'source':entry['fonte_confirmacao'], 'verified_on':entry['verificado_em']})
            if filled and row.get('condicoes_verificadas') is None:
                row['condicoes_verificadas'] = ref['conditions']
    tables['verified_enrichment_changes'] = audit


def apply_verified(store, changes: list[dict]) -> list[dict]:
    """Criar novas revisões numa transação; rejeitar sobrescritas e concorrência."""
    from etl.portal_catalog import CatalogConflict
    results = []
    identities = [change['id'] for change in changes]
    if len(identities) != len(set(identities)):
        raise ValueError('Registo repetido no lote de enriquecimento')
    with store.transaction():
        for change in changes:
            existing = store.db.execute('SELECT snapshot FROM catalog_records WHERE id=?', (change['id'],)).fetchone()
            if not existing:
                raise ValueError('Registo de catálogo inexistente')
            import json
            old = json.loads(existing[0])
            if old['revision'] != change['baseRevision']:
                raise CatalogConflict('Existe uma revisão mais recente; reveja o enriquecimento.')
            if old['status'] != 'approved':
                raise ValueError('O lote só pode preencher registos aprovados explicitamente selecionados')
            record = copy.deepcopy(old)
            names = field_names(record['category'])
            fields = change.get('fields', {})
            operational = change.get('operational', {})
            if not fields and not operational:
                raise ValueError('Enriquecimento sem valores')
            for target, values in (('fields', fields), ('operational', operational)):
                if set(values) - (set(names) - {'reservations', 'latitude', 'longitude'} if target == 'fields' else {'reservations', 'latitude', 'longitude'}):
                    raise ValueError('Campo fora do âmbito de enriquecimento')
                for name, value in values.items():
                    previous = record.get(target, {}).get(name, record.get('raw', {}).get(names[name]) if target == 'operational' else None)
                    if name == 'price' and (record.get('pricing') or {}).get('amount'):
                        raise ValueError('Preço estruturado existente não pode ser substituído')
                    if not unknown(previous) or unknown(value):
                        raise ValueError('O enriquecimento apenas preenche valores desconhecidos')
                    if (target == 'fields' or name == 'reservations') and (not isinstance(value, str) or len(value) > 4000):
                        raise ValueError('Texto de enriquecimento inválido')
                    if name in ('latitude', 'longitude'):
                        limit = 90 if name == 'latitude' else 180
                        if not isinstance(value, (int, float)) or isinstance(value, bool) or not -limit <= value <= limit:
                            raise ValueError('Coordenada inválida')
                    record.setdefault(target, {})[name] = value
            if operational:
                # O contrato operacional exige as chaves, sem presumir valores para as restantes.
                raw = record.get('raw', {})
                defaults = {'latitude': raw.get('latitude'), 'longitude': raw.get('longitude'),
                            'closures': raw.get('dias_de_encerramento') or raw.get('encerramento_base_reconfirmar'),
                            'observations': raw.get('observacoes'), 'reservations': raw.get(names['reservations'])}
                for field, value in defaults.items():
                    record['operational'].setdefault(field, '' if value is None else str(value))
                for field in ('latitude', 'longitude'):
                    record['operational'][field] = str(record['operational'][field])
            metadata = record.setdefault('sourceData', {}).setdefault('fieldEvidence', {})
            for name, value in {**fields, **operational}.items():
                entry = change.get('evidence', {}).get(name)
                if not entry:
                    raise ValueError('Cada valor exige evidência')
                parsed = urlsplit(entry.get('fonte_confirmacao', ''))
                if parsed.scheme != 'https' or not parsed.hostname:
                    raise ValueError('A evidência exige uma URL HTTPS da fonte consultada')
                canonical = names[name]
                checked = {canonical: value, **{f'{canonical}_{key}': val for key, val in entry.items()}}
                proof = evidence(checked, canonical, datetime.now(timezone.utc).date())
                if proof['confirmation'] != 'confirmado':
                    raise ValueError('A evidência não confirma o valor exato')
                metadata[canonical] = copy.deepcopy(entry)
            if change.get('priceReferences'):
                record['sourceData']['priceReferences'] = price_references(record, change['priceReferences'])
            record.update(revision=old['revision'] + 1, updatedAt=store._now(),
                          reason=change.get('reason', 'Preenchimento de lacunas com fonte oficial verificada.'))
            store._write(record)
            results.append(record)
    return results
