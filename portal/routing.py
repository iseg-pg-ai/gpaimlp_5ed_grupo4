"""Cálculo rodoviário determinístico usado pelo portal através da fronteira JSON."""
from __future__ import annotations

import json
import math
import os
from decimal import Decimal, ROUND_HALF_UP
from urllib.parse import quote
from urllib.request import urlopen

MODES = {"chauffeur", "walk", "boat", "train", "funicular"}


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
