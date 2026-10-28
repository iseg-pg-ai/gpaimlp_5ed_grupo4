# Normaliza dimensões analíticas e proveniência para comparar inventário, referências e
# contexto temporal.
"""Contratos analíticos conservadores; nunca substituem valores das fontes."""
from __future__ import annotations

import json
import math
import re
import unicodedata
from datetime import date, datetime, timezone
from pathlib import Path

CONFIG = Path(__file__).resolve().parents[1] / 'config' / 'observatory.json'
CATALOG = {
    'atracoes': ('id', 'cidade', 'nome_da_atracao', {'Morada': 'morada', 'Contactos': 'contactos', 'Duração': 'tempo_medio_de_visita', 'Horário': 'horario', 'Preço': 'preco_da_atracao', 'Condições': 'necessidade_de_reserva', 'Acessibilidade': 'acessibilidade_nivel_de_confirmacao'}),
    'restaurantes': ('id_blu', 'cidade', 'estabelecimento', {'Morada': 'morada', 'Contactos': 'contactos', 'Duração': 'duracao_blu_estimativa', 'Horário': 'horario_base_reconfirmar', 'Preço': 'preco_nao_cotacao', 'Condições': 'reservas_condicoes_base', 'Acessibilidade': 'acessibilidade_nivel_de_confirmacao'}),
    'experiencias': ('nome_da_experiencia', 'localizacao', 'nome_da_experiencia', {'Morada': 'morada', 'Contactos': 'contactos', 'Duração': 'duracao', 'Horário': 'horario', 'Preço': 'preco', 'Condições': 'modalidade', 'Acessibilidade': 'acessibilidade_nivel_de_confirmacao'}),
}
TYPES = {'atracoes': 'Atração', 'restaurantes': 'Restaurante', 'experiencias': 'Experiência'}


def token(value) -> str:
    text = unicodedata.normalize('NFKD', str(value or ''))
    return re.sub(r'\s+', ' ', ''.join(c for c in text if not unicodedata.combining(c))).strip().casefold()


def rules() -> dict:
    return json.loads(CONFIG.read_text(encoding='utf-8'))


def location(value, contract: dict) -> dict:
    raw = str(value or '').strip()
    key = token(raw)
    known = {token(name): name for name in contract['localities']}
    aliases = {token(name): target for name, target in contract['location_aliases'].items()}
    regions = {token(name): name for name in contract['regions']}
    if key in aliases:
        return {'destination': aliases[key], 'geographic_scope': 'localidade', 'location_rule': 'alias_explícito'}
    if key in known:
        return {'destination': known[key], 'geographic_scope': 'localidade', 'location_rule': 'designação_conhecida'}
    if key in regions:
        return {'destination': regions[key], 'geographic_scope': 'região', 'location_rule': 'região_explícita'}
    # Apenas segmentos completos delimitados; nunca procurar nomes como substrings.
    segments = {token(part) for part in re.split(r'[,;/—–]|\s-\s', raw)}
    candidates = {known[part] for part in segments if part in known}
    if len(candidates) == 1:
        return {'destination': candidates.pop(), 'geographic_scope': 'localidade', 'location_rule': 'segmento_explícito'}
    if not candidates:
        candidates = {regions[part] for part in segments if part in regions}
        if len(candidates) == 1:
            return {'destination': candidates.pop(), 'geographic_scope': 'região', 'location_rule': 'segmento_regional'}
    return {'destination': None, 'geographic_scope': 'por_confirmar', 'location_rule': 'ambígua' if len(candidates) > 1 else 'não_mapeada'}


def unit(value, contract: dict) -> dict:
    key = token(value)
    aliases = {token(name): target for name, target in contract['unit_aliases'].items()}
    base = re.split(r';(?![^()]*\))', key, maxsplit=1)[0].strip()
    matched = base if base in aliases else next((alias for alias in aliases if base.startswith(alias + ' (') and base.endswith(')')), None)
    return {'normalized_unit': aliases.get(matched), 'unit_rule': 'alias_explícito' if matched else 'por_confirmar',
            'unit_conditions': str(value or '').strip()}


def iso_date(value) -> date | None:
    if value is None or str(value).strip() == '':
        return None
    text = str(value).strip()
    # Aceitar datas ISO e timestamps ISO completos, nunca ignorar sufixos inválidos.
    if len(text) == 10:
        return date.fromisoformat(text)
    return datetime.fromisoformat(text.replace('Z', '+00:00')).date()


def temporal_state(start: date | None, end: date | None, today: date) -> str:
    if start and today < start:
        return 'não_iniciada'
    if end and today > end:
        return 'expirada'
    return 'vigente' if start and end else 'prazo_desconhecido'


def evidence(row: dict, field: str, today: date) -> dict:
    declared = row.get(f'{field}_confirmacao')
    if declared is None or declared == '':
        declared = 'pendente'
    if declared not in ('confirmado', 'estimado', 'pendente', 'contestado'):
        raise ValueError(f'Estado de confirmação inválido: {field}')
    checked = iso_date(row.get(f'{field}_verificado_em'))
    start = iso_date(row.get(f'{field}_valido_desde'))
    end = iso_date(row.get(f'{field}_valido_ate'))
    if ((checked and checked > today) or (start and end and start > end)
            or (checked and end and checked > end)):
        raise ValueError(f'Cronologia de evidência inválida: {field}')
    source = str(row.get(f'{field}_fonte_confirmacao') or '').strip()
    bound = row.get(f'{field}_valor_confirmado')
    value = row.get(field)
    known = value is not None and bool(str(value).strip()) and token(value) not in ('por confirmar', 'a confirmar', 'desconhecido', 'nao informado', 'n/a', 'n/d', 'nan')
    if isinstance(value, float) and not math.isfinite(value):
        known = False
    same = bound == value if type(bound) in (int, float) and type(value) in (int, float) else str(bound) == str(value)
    matches = bound is not None and known and same
    complete = bool(source and checked and matches)
    state = declared if declared != 'confirmado' or complete else 'pendente'
    temporal = temporal_state(start, end, today)
    # Uma janela não confirma o valor; a utilização exige ambas as evidências.
    usable = state == 'confirmado' and temporal == 'vigente'
    return {'declared_confirmation': declared, 'confirmation': state, 'verified_on': checked.isoformat() if checked else None,
            'valid_from': start.isoformat() if start else None, 'valid_until': end.isoformat() if end else None,
            'evidence_source': source or None, 'value_matches': matches, 'temporal_state': temporal,
            'commercially_usable': usable}


def build_observatory(tables: dict, *, today: date | None = None) -> dict:
    today = today or datetime.now(timezone.utc).date()
    contract = rules()
    catalog, prices, fields = [], [], []
    for table, (identity, loc, name, specs) in CATALOG.items():
        for row in tables.get(table, []):
            key = f'{TYPES[table]}:{row.get(identity)}'
            common = {'entity_key': key, 'source_table': table, 'record_id': row.get(identity),
                      'catalog_id': row.get('_catalog_id'), 'catalog_revision': row.get('_catalog_revision'), 'name': row.get(name),
                      'source_sheet': row.get('_source_sheet'), 'source_row': row.get('_source_row'),
                      'evaluated_on': today.isoformat(), 'contract_version': contract['version']}
            catalog.append({**common, 'raw_location': row.get(loc), **location(row.get(loc), contract)})
            for label, field in specs.items():
                fields.append({**common, 'field': field, 'field_label': label, **evidence(row, field, today)})
    for row in tables.get('precos', []):
        prices.append({'record_id': row.get('id'), 'raw_location': row.get('local'), **location(row.get('local'), contract),
                       'raw_unit': row.get('unidade'), **unit(row.get('unidade'), contract),
                       'evaluated_on': today.isoformat(), 'contract_version': contract['version']})
        fields.append({'entity_key': f"Preço:{row.get('id')}", 'source_table': 'precos', 'record_id': row.get('id'),
                       'catalog_id': None, 'name': row.get('nome_modalidade'), 'source_sheet': row.get('_source_sheet'),
                       'source_row': row.get('_source_row'), 'evaluated_on': today.isoformat(), 'contract_version': contract['version'],
                       'field': 'preco_referencia_eur', 'field_label': 'Preço', **evidence(row, 'preco_referencia_eur', today)})
    return {'model_observatory_catalog': catalog, 'model_observatory_prices': prices, 'model_field_evidence': fields}
