from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple, Union
from zoneinfo import ZoneInfo
from dotenv import load_dotenv
import requests

load_dotenv()

Location = Union[Tuple[float, float], str]

# In-memory cache for geocoded queries
_GEOCODE_CACHE: Dict[str, Tuple[float, float, str]] = {}


@dataclass
class TravelTimeResult:
    origin: Location
    destination: Location
    distance_meters: int
    duration_seconds: int
    duration_in_traffic_seconds: Optional[int]
    duration_text: str
    duration_in_traffic_text: Optional[str]
    raw_status: str
    origin_address: Optional[str] = None
    destination_address: Optional[str] = None


def format_seconds(total_seconds: int) -> tuple[int, int, int]:
    hours, remainder = divmod(total_seconds, 3600)
    minutes, seconds = divmod(remainder, 60)
    return hours, minutes, seconds


def _human_duration(seconds: int) -> str:
    h, m, _ = format_seconds(seconds)
    if h > 0:
        return f"{h} hour{'s' if h > 1 else ''} {m} min{'s' if m != 1 else ''}".strip()
    return f"{m} min{'s' if m != 1 else ''}"


def geocode_location(
    location: Location, timeout_seconds: int = 8
) -> Tuple[float, float, Optional[str]]:
    """Resolves a Location (coordinate tuple or text address) into (latitude, longitude, resolved_address).

    Uses OpenStreetMap Nominatim for address geocoding (free, keyless).
    """
    if isinstance(location, (tuple, list)) and len(location) == 2:
        lat, lng = float(location[0]), float(location[1])
        return lat, lng, None

    if isinstance(location, str):
        cleaned = location.strip()
        if not cleaned:
            raise ValueError("Location string cannot be empty.")

        if cleaned in _GEOCODE_CACHE:
            return _GEOCODE_CACHE[cleaned]

        url = "https://nominatim.openstreetmap.org/search"
        headers = {"User-Agent": "ISEG-PG-AppliedAI-Itinerary/1.0"}
        params = {"q": cleaned, "format": "json", "limit": 1}

        try:
            resp = requests.get(url, params=params, headers=headers, timeout=timeout_seconds)
            resp.raise_for_status()
            data = resp.json()
            if data and len(data) > 0:
                lat = float(data[0]["lat"])
                lng = float(data[0]["lon"])
                display_name = data[0].get("display_name", cleaned)
                _GEOCODE_CACHE[cleaned] = (lat, lng, display_name)
                return lat, lng, display_name
        except Exception as e:
            raise ValueError(f"Failed to geocode address '{cleaned}' via Nominatim: {e}")

        raise ValueError(f"Could not find coordinates for address: '{cleaned}'")

    raise ValueError(f"Invalid location format: {location!r}")


def get_driving_time_osrm(
    origin: Location,
    destination: Location,
    timeout_seconds: int = 15,
) -> TravelTimeResult:
    """Calculates driving distance and travel duration using OSRM (Open Source Routing Machine).

    Works with coordinates (lat, lng) or text addresses (geocoded via Nominatim).
    Requires no API keys.
    """
    lat1, lon1, orig_addr = geocode_location(origin, timeout_seconds=timeout_seconds)
    lat2, lon2, dest_addr = geocode_location(destination, timeout_seconds=timeout_seconds)

    # OSRM coordinate format: {longitude},{latitude}
    url = f"http://router.project-osrm.org/route/v1/driving/{lon1},{lat1};{lon2},{lat2}?overview=false"

    resp = requests.get(url, timeout=timeout_seconds)
    resp.raise_for_status()
    data = resp.json()

    if data.get("code") != "Ok" or not data.get("routes"):
        raise ValueError(f"OSRM routing failed: code={data.get('code')}")

    route = data["routes"][0]
    dist_meters = int(round(route["distance"]))
    dur_seconds = int(round(route["duration"]))

    return TravelTimeResult(
        origin=origin,
        destination=destination,
        distance_meters=dist_meters,
        duration_seconds=dur_seconds,
        duration_in_traffic_seconds=None,
        duration_text=_human_duration(dur_seconds),
        duration_in_traffic_text=None,
        raw_status="OK",
        origin_address=orig_addr or (f"{lat1:.5f}, {lon1:.5f}"),
        destination_address=dest_addr or (f"{lat2:.5f}, {lon2:.5f}"),
    )


def get_travel_time_matrix_osrm(
    locations: List[Location],
    timeout_seconds: int = 25,
) -> Dict[str, Union[List[List[float]], List[Dict]]]:
    """Calculates NxN travel duration and distance matrix for a list of locations in a single API call.

    Returns:
        dict with:
            'durations_seconds': 2D list of seconds
            'distances_meters': 2D list of meters
            'locations': list of resolved locations
    """
    coords = []
    resolved_info = []
    for loc in locations:
        lat, lon, addr = geocode_location(loc, timeout_seconds=timeout_seconds)
        coords.append(f"{lon},{lat}")
        resolved_info.append({"input": loc, "latitude": lat, "longitude": lon, "address": addr})

    coords_str = ";".join(coords)
    url = f"http://router.project-osrm.org/table/v1/driving/{coords_str}?annotations=duration,distance"

    resp = requests.get(url, timeout=timeout_seconds)
    resp.raise_for_status()
    data = resp.json()

    if data.get("code") != "Ok":
        raise ValueError(f"OSRM table request failed: code={data.get('code')}")

    return {
        "durations_seconds": data.get("durations", []),
        "distances_meters": data.get("distances", []),
        "locations": resolved_info,
    }


def _format_location(location: Location) -> str:
    """Format a location (coordinate tuple or text address) for the Google Distance Matrix API."""
    if isinstance(location, str):
        cleaned = location.strip()
        if not cleaned:
            raise ValueError("Address string cannot be empty.")
        return cleaned

    if isinstance(location, (tuple, list)) and len(location) == 2:
        lat, lng = location
        if isinstance(lat, (int, float)) and isinstance(lng, (int, float)):
            return f"{lat},{lng}"

    raise ValueError(
        f"Invalid location: {location!r}. Must be a (lat, lng) tuple of floats or a non-empty address string."
    )


def get_driving_time_google_distance_matrix(
    origin: Location,
    destination: Location,
    departure_time: Union[datetime, str] = "now",
    api_key: Optional[str] = None,
    traffic_model: str = "best_guess",
    timeout_seconds: int = 15,
) -> TravelTimeResult:
    """Calculate driving distance and duration using Google Maps Distance Matrix API.

    Falls back automatically to free OSRM if no valid Google Maps API key is configured.
    """
    key = api_key or os.getenv("GOOGLE_MAPS_API_KEY")

    # If no key or placeholder key, seamlessly fall back to OSRM
    if not key or key in {"111111111", "YOUR_API_KEY", ""}:
        return get_driving_time_osrm(origin, destination, timeout_seconds=timeout_seconds)

    formatted_origin = _format_location(origin)
    formatted_destination = _format_location(destination)

    if isinstance(departure_time, str):
        if departure_time != "now":
            raise ValueError("If departure_time is a string, it must be exactly 'now'.")
        dep_param = "now"
    elif isinstance(departure_time, datetime):
        dt = departure_time
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        dep_param = str(int(dt.timestamp()))
    else:
        raise ValueError("departure_time must be a datetime or the string 'now'.")

    if traffic_model not in {"best_guess", "pessimistic", "optimistic"}:
        raise ValueError(
            "traffic_model must be one of: best_guess, pessimistic, optimistic."
        )

    url = "https://maps.googleapis.com/maps/api/distancematrix/json"
    params = {
        "origins": formatted_origin,
        "destinations": formatted_destination,
        "mode": "driving",
        "departure_time": dep_param,
        "traffic_model": traffic_model,
        "key": key,
    }

    resp = requests.get(url, params=params, timeout=timeout_seconds)
    resp.raise_for_status()
    data = resp.json()

    if data.get("status") != "OK":
        raise ValueError(
            f"Distance Matrix API error: status={data.get('status')} error_message={data.get('error_message')}"
        )

    rows = data.get("rows") or []
    if not rows or not rows[0].get("elements"):
        raise ValueError("Unexpected API response structure (missing rows/elements).")

    el = rows[0]["elements"][0]
    el_status = el.get("status", "UNKNOWN")
    if el_status != "OK":
        if el_status == "NOT_FOUND":
            raise ValueError(
                f"Route not found: one or both locations could not be geocoded ({origin} -> {destination})."
            )
        if el_status == "ZERO_RESULTS":
            raise ValueError(
                f"No driving route found between {origin} and {destination}."
            )
        raise ValueError(f"Route not available: element status={el_status}")

    origin_addresses = data.get("origin_addresses", [])
    destination_addresses = data.get("destination_addresses", [])
    resolved_origin = origin_addresses[0] if origin_addresses else None
    resolved_destination = destination_addresses[0] if destination_addresses else None

    return TravelTimeResult(
        origin=origin,
        destination=destination,
        distance_meters=el["distance"]["value"],
        duration_seconds=el["duration"]["value"],
        duration_in_traffic_seconds=el.get("duration_in_traffic", {}).get("value"),
        duration_text=el["duration"]["text"],
        duration_in_traffic_text=el.get("duration_in_traffic", {}).get("text"),
        raw_status=el_status,
        origin_address=resolved_origin,
        destination_address=resolved_destination,
    )


# General alias
get_driving_time = get_driving_time_osrm


def best_duration(result: TravelTimeResult) -> int:
    if result.duration_in_traffic_seconds is not None:
        return result.duration_in_traffic_seconds
    return result.duration_seconds


if __name__ == "__main__":
    print("=" * 70)
    print("📍 TESTANDO CÁLCULO DE DISTÂNCIA E TEMPO COM OSRM (OPEN SOURCE)")
    print("=" * 70)

    # Example 1: Text addresses
    print("\n1. Teste com Moradas de Texto (Geocodificação Automática):")
    res1 = get_driving_time_osrm(
        origin="Praça do Comércio, Lisboa",
        destination="Avenida dos Aliados, Porto",
    )
    h, m, s = format_seconds(res1.duration_seconds)
    print(f"  • Origem:     {res1.origin_address}")
    print(f"  • Destino:    {res1.destination_address}")
    print(f"  • Distância:  {res1.distance_meters / 1000:.1f} km")
    print(f"  • Duração:    {h}h {m}m ({res1.duration_text})")

    # Example 2: GPS coordinates
    print("\n2. Teste com Coordenadas GPS (Castelo de São Jorge -> Belém):")
    res2 = get_driving_time_osrm(
        origin=(38.7139, -9.1335),
        destination=(38.6916, -9.2160),
    )
    print(f"  • Distância:  {res2.distance_meters / 1000:.2f} km")
    print(f"  • Duração:    {res2.duration_text}")

    # Example 3: Matriz NxN em 1 única chamada
    print("\n3. Teste de Matriz NxN (3 locais em 1 chamada de rede):")
    locs = [
        (38.7139, -9.1335),  # Castelo
        (38.7224, -9.1352),  # Ramiro
        (38.6916, -9.2160),  # Belém
    ]
    matrix = get_travel_time_matrix_osrm(locs)
    durations_min = [[round(sec / 60, 1) for sec in row] for row in matrix["durations_seconds"]]
    print("  • Matriz de tempos (em minutos):", durations_min)
