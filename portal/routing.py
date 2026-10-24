"""Cálculo rodoviário determinístico usado pelo portal através da fronteira JSON."""
from __future__ import annotations

import json
import itertools
import math
import os
import re
import unicodedata
from decimal import Decimal, ROUND_HALF_UP
from urllib.parse import quote
from urllib.request import urlopen

MODES = {"chauffeur", "walk", "boat", "train", "funicular"}


def _norm_key(value) -> str:
    text = unicodedata.normalize("NFD", str(value or ""))
    return "".join(char for char in text if unicodedata.category(char) != "Mn").lower().strip()


def _coordinate(value):
    if isinstance(value, bool):
        return None
    try:
        number = float(value)
        return number if math.isfinite(number) else None
    except (TypeError, ValueError):
        return None


def _coordinate_map(records: list[dict] | None) -> dict[str, tuple[float, float]]:
    result = {}
    for record in records or []:
        latitude, longitude = _coordinate(record.get("latitude")), _coordinate(record.get("longitude"))
        if latitude is None or longitude is None:
            continue
        keys = []
        for field in ("id", "id_blu", "_catalog_id"):
            if record.get(field) is not None:
                identifier = str(record[field])
                keys.extend((identifier, _norm_key(identifier)))
                categories = ("restaurantes",) if field == "id_blu" else ("atracoes", "experiencias")
                if field == "_catalog_id":
                    categories = ("atracoes", "experiencias", "restaurantes")
                keys.extend(f"{category}:{identifier}" for category in categories)
        for field in ("nome_da_atracao", "estabelecimento", "nome_da_experiencia"):
            if isinstance(record.get(field), str) and record[field].strip():
                keys.extend((record[field].strip(), _norm_key(record[field])))
        for key in keys:
            result[key] = (latitude, longitude)
    return result


def _item_coordinates(item: dict, coordinates: dict[str, tuple[float, float]]):
    direct = (_coordinate(item.get("latitude")), _coordinate(item.get("longitude")))
    if None not in direct:
        return direct
    identifier = str(item.get("id") or "")
    raw_identifier = re.sub(r"^[a-z_]+:", "", identifier, flags=re.I)
    for key in (identifier, _norm_key(identifier), raw_identifier, _norm_key(raw_identifier),
                str(item.get("title") or ""), _norm_key(item.get("title"))):
        if key in coordinates:
            return coordinates[key]
    return None


def _distance(first: dict, second: dict, coordinates: dict[str, tuple[float, float]]) -> float:
    start, end = _item_coordinates(first, coordinates), _item_coordinates(second, coordinates)
    if not start or not end:
        return 5000
    lat_delta, lon_delta = math.radians(end[0] - start[0]), math.radians(end[1] - start[1])
    value = (math.sin(lat_delta / 2) ** 2 + math.cos(math.radians(start[0]))
             * math.cos(math.radians(end[0])) * math.sin(lon_delta / 2) ** 2)
    return 6371000 * 2 * math.asin(math.sqrt(min(1, value)))


def _best_permutation(segment: list[dict], previous, following, coordinates):
    if len(segment) <= 1:
        return segment
    if len(segment) > 7:
        remaining, result, current = list(segment), [], previous
        while remaining:
            index = min(range(len(remaining)), key=lambda position:
                        _distance(current, remaining[position], coordinates) if current else 0)
            current = remaining.pop(index)
            result.append(current)
        return result
    best, minimum = segment, math.inf
    for candidate in itertools.permutations(segment):
        cost = _distance(previous, candidate[0], coordinates) if previous else 0
        cost += sum(_distance(candidate[index], candidate[index + 1], coordinates)
                    for index in range(len(candidate) - 1))
        cost += _distance(candidate[-1], following, coordinates) if following else 0
        if cost < minimum:
            best, minimum = list(candidate), cost
    return best


def _start_minutes(value) -> int:
    match = re.match(r"^(\d{1,2}):(\d{2})", value or "")
    return int(match[1]) * 60 + int(match[2]) if match else 570


def _duration_minutes(item: dict) -> int:
    value = item.get("duration") or ""
    hours = re.search(r"(\d+(?:[.,]\d+)?)\s*h", value, re.I)
    minutes = re.search(r"(\d+)\s*min", value, re.I)
    if hours or minutes:
        total = round(float(hours[1].replace(",", ".")) * 60) if hours else 0
        total += int(minutes[1]) if minutes else 0
        if total > 0:
            return total
    match = re.match(r"^(\d{1,2}):(\d{2})[–-](\d{1,2}):(\d{2})", item.get("time") or "")
    if match:
        start, end = int(match[1]) * 60 + int(match[2]), int(match[3]) * 60 + int(match[4])
        if end > start:
            return end - start
    return 90 if item.get("category") == "restaurant" else 75


def _clock(minutes: int) -> str:
    return f"{minutes // 60 % 24:02d}:{minutes % 60:02d}"


def realign_time_slots(items: list[dict], catalog_records: list[dict] | None = None) -> list[dict]:
    """Realinhar horários sem alterar os restantes campos das atividades."""
    if not items:
        return items
    coordinates, cursor, result = _coordinate_map(catalog_records), _start_minutes(items[0].get("time")), []
    for index, original in enumerate(items):
        item = dict(original)
        duration = _duration_minutes(item)
        scheduled = bool(item.get("time")) and "por agendar" not in item["time"].lower()
        if scheduled or index == 0:
            item["time"] = f"{_clock(cursor)}–{_clock(cursor + duration)} (proposto)"
            cursor += duration
        if index < len(items) - 1:
            leg = item.get("transitToNext") or {}
            match = re.match(r"(\d+)", str(leg.get("duration") or ""))
            if match:
                travel = int(match[1]) or 15
                buffer = leg.get("bufferMinutes") if isinstance(leg.get("bufferMinutes"), (int, float)) else (5 if leg.get("mode") == "walk" else 10)
            else:
                distance = _distance(item, items[index + 1], coordinates)
                travel, buffer = max(5, math.ceil(distance / 1000 / 30 * 60)), 5 if distance <= 1000 else 10
            cursor += travel + buffer
        result.append(item)
    return result


def optimize_route_sequence(items: list[dict], catalog_records: list[dict] | None = None) -> list[dict]:
    """Ordenar o percurso preservando refeições e atividades bloqueadas/confirmadas."""
    if len(items) <= 2:
        return items
    coordinates = _coordinate_map(catalog_records)
    free = [item for item in items if item.get("category") == "free_time"]
    if free:
        active = [item for item in items if item.get("category") != "free_time"]
        if len(active) <= 2:
            return items
        morning = [item for index, item in enumerate(items) if item.get("category") == "free_time" and index == 0]
        afternoon = [item for index, item in enumerate(items) if item.get("category") == "free_time" and index > 0]
        return morning + optimize_route_sequence(active, catalog_records) + afternoon

    def locked(item):
        return bool(item.get("isLocked")) or (item.get("confirmation") or {}).get("status") == "confirmed"

    restaurants = [item for item in items if item.get("category") == "restaurant"]
    if len(restaurants) == 1 and len(items) <= 8:
        restaurant, restaurant_index = restaurants[0], items.index(restaurants[0])
        others = [item for item in items if item is not restaurant]
        locked_morning = [item for item in items[:restaurant_index] if locked(item)]
        locked_afternoon = [item for item in items[restaurant_index + 1:] if locked(item)]
        best, minimum = items, math.inf
        for morning_tuple in itertools.combinations(others, restaurant_index):
            morning = list(morning_tuple)
            if any(item not in morning for item in locked_morning):
                continue
            afternoon = [item for item in others if item not in morning]
            if any(item not in afternoon for item in locked_afternoon):
                continue
            first = _best_permutation(morning, None, restaurant, coordinates)
            second = _best_permutation(afternoon, restaurant, None, coordinates)
            route = first + [restaurant] + second
            cost = sum(_distance(route[index], route[index + 1], coordinates)
                       for index in range(len(route) - 1))
            if cost < minimum:
                best, minimum = route, cost
        return realign_time_slots(best, catalog_records)

    def anchor(item):
        return locked(item) or item.get("category") == "restaurant"

    if sum(not anchor(item) for item in items) <= 1:
        return items
    result, segment, previous = [], [], None
    for item in items:
        if anchor(item):
            result.extend(_best_permutation(segment, previous, item, coordinates))
            segment = []
            result.append(item)
            previous = item
        else:
            segment.append(item)
    result.extend(_best_permutation(segment, previous, None, coordinates))
    return realign_time_slots(result, catalog_records)


def route_summary(items: list[dict]):
    """Resumir apenas troços efetivamente presentes no itinerário."""
    legs = [item.get("transitToNext") for item in items if item.get("transitToNext")]
    if not legs:
        return None
    total_minutes = total_km = walking_meters = 0
    for leg in legs:
        duration = re.match(r"(\d+)", str(leg.get("duration") or ""))
        total_minutes += int(duration[1]) if duration else 0
        distance = re.match(r"^([\d.]+)\s*(km|m)", str(leg.get("distance") or ""), re.I)
        if distance:
            meters = float(distance[1]) * (1000 if distance[2].lower() == "km" else 1)
            total_km += meters / 1000
            walking_meters += meters if leg.get("mode") == "walk" else 0
    walking = f"{_fixed(walking_meters / 1000)} km" if walking_meters >= 1000 else f"{walking_meters:g} m"
    return {"totalTransitTime": f"{total_minutes} min", "totalDistance": f"{_fixed(total_km)} km",
            "legsCount": len(legs), "walkingDistance": walking,
            "routePath": [items[0].get("title"), *[leg.get("toLocation") for leg in legs]],
            "algorithmStatus": "Viável e Otimizado"}


def _number(value):
    return float(value) if isinstance(value, (int, float)) and not isinstance(value, bool) \
        and math.isfinite(value) else None


def _rounded(value: float) -> int:
    """Reproduzir Math.round para os valores positivos de distância e duração."""
    return math.floor(value + 0.5)


def _fixed(value: float, places: int = 1) -> str:
    """Reproduzir toFixed para valores positivos, incluindo os meios."""
    quantum = Decimal(1).scaleb(-places)
    return format(Decimal(str(value)).quantize(quantum, rounding=ROUND_HALF_UP), f".{places}f")


def _identity(start: str, end: str) -> str:
    safe = "~()*!.'-_"
    return f"transit-{quote(start, safe=safe)}-{quote(end, safe=safe)}"


def _leg(start, end, mode, duration, distance, note, buffer_minutes,
         optimized, algorithm_note):
    return {"id": _identity(start, end), "fromLocation": start, "toLocation": end,
            "mode": mode, "duration": f"{duration} min", "distance": distance,
            "routeNote": note, "bufferMinutes": buffer_minutes,
            "isAlgorithmOptimized": optimized, "algorithmNote": algorithm_note}


def _request_json(url: str, timeout: float):
    with urlopen(url, timeout=timeout) as response:  # noqa: S310 - origem configurada pelo operador
        if response.status != 200:
            raise OSError(f"OSRM respondeu {response.status}")
        return json.loads(response.read(2_000_000))


def calculate_road_leg(start: dict, end: dict, options: dict | None = None,
                       provider=_request_json) -> dict:
    """Calcular um troço via OSRM, com fallback local e sem dados inventados."""
    if not isinstance(start, dict) or not isinstance(end, dict):
        raise ValueError("Origem e destino inválidos.")
    start_title, end_title = start.get("title"), end.get("title")
    if not isinstance(start_title, str) or not isinstance(end_title, str):
        raise ValueError("Origem e destino precisam de título.")
    options = options if isinstance(options, dict) else {}
    preferred = options.get("preferredMode")
    if preferred is not None and preferred not in MODES:
        raise ValueError("Modo de deslocação inválido.")
    custom_buffer = options.get("bufferMinutes")
    if custom_buffer is not None and (not isinstance(custom_buffer, (int, float))
                                      or isinstance(custom_buffer, bool)
                                      or not math.isfinite(custom_buffer)):
        raise ValueError("Margem de deslocação inválida.")
    timeout_ms = options.get("timeoutMs", 3000)
    if not isinstance(timeout_ms, (int, float)) or isinstance(timeout_ms, bool) \
            or not math.isfinite(timeout_ms) or timeout_ms <= 0:
        raise ValueError("Timeout de deslocação inválido.")

    lat1, lon1 = _number(start.get("latitude")), _number(start.get("longitude"))
    lat2, lon2 = _number(end.get("latitude")), _number(end.get("longitude"))
    if None in (lat1, lon1, lat2, lon2):
        mode = preferred or "chauffeur"
        duration = 20 if mode == "walk" else 15
        return _leg(start_title, end_title, mode, duration, "Por confirmar",
                    "Coordenadas incompletas; estimativa padrão de deslocação",
                    custom_buffer if custom_buffer is not None else (5 if mode == "walk" else 15),
                    False, "Sem coordenadas precisas no catálogo; tempo de reserva atribuído.")

    profile = "walking" if preferred == "walk" else "driving"
    base = os.environ.get("OSRM_ROUTER_URL", "http://router.project-osrm.org").rstrip("/")
    url = f"{base}/route/v1/{profile}/{lon1},{lat1};{lon2},{lat2}?overview=false"
    try:
        payload = provider(url, timeout_ms / 1000)
        routes = payload.get("routes") if isinstance(payload, dict) else None
        if payload.get("code") == "Ok" and isinstance(routes, list) and routes:
            route = routes[0]
            meters = _rounded(float(route["distance"]))
            distance = f"{meters} m" if meters < 1000 else f"{_fixed(meters / 1000)} km"
            mode = preferred or ("walk" if meters <= 1000 else "chauffeur")
            if mode == "walk":
                minutes = max(2, _rounded(meters / 75))
                note = f"Percurso pedonal de {distance} (~{minutes} min)"
            elif mode == "boat":
                minutes = max(10, _rounded(meters / 250 + 5))
                note = f"Travessia cénica fluvial de {distance} (~{minutes} min)"
            elif mode == "train":
                minutes = max(8, _rounded(meters / 400 + 5))
                note = f"Ligação ferroviária cénica de {distance} (~{minutes} min)"
            elif mode == "funicular":
                minutes = max(8, _rounded(meters / 400 + 5))
                note = f"Subida/descida em transporte histórico/funicular (~{minutes} min)"
            else:
                minutes = max(1, _rounded(float(route["duration"]) / 60))
                note = f"Trajeto de {distance} via estrada (~{minutes} min)"
            buffer_minutes = custom_buffer if custom_buffer is not None else (5 if mode == "walk" else 10)
            return _leg(start_title, end_title, mode, minutes, distance, note,
                        buffer_minutes, True,
                        f"Percurso calculado pela malha viária real via OSRM ({profile}).")
    except (OSError, TimeoutError, ValueError, TypeError, KeyError, json.JSONDecodeError):
        pass

    lat_delta, lon_delta = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    value = (math.sin(lat_delta / 2) ** 2 + math.cos(math.radians(lat1))
             * math.cos(math.radians(lat2)) * math.sin(lon_delta / 2) ** 2)
    straight_km = 6371 * 2 * math.asin(math.sqrt(min(1, value)))
    mode = preferred or ("walk" if straight_km <= 0.8 else "chauffeur")
    minutes = (max(5, math.ceil(straight_km * 1.3 / 4.5 * 60)) if mode == "walk"
               else max(10, math.ceil(straight_km * 1.5 / 25 * 60 + 10)))
    distance = f"{_fixed(straight_km)} km (estimado)"
    return _leg(start_title, end_title, mode, minutes, distance,
                f"Margem estimada: ~{minutes} min ({_fixed(straight_km)} km em linha reta)",
                custom_buffer if custom_buffer is not None else (5 if mode == "walk" else 10),
                False, "Estimativa geométrica (fator urbano 1,5 a 25 km/h + tolerância).")
