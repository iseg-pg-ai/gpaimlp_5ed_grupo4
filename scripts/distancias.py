from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional, Tuple, Union
from zoneinfo import ZoneInfo
from dotenv import load_dotenv
import requests

load_dotenv()

Location = Union[Tuple[float, float], str]


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

    Supports both text addresses (e.g. "Lisboa, Portugal") and coordinate tuples (lat, lng).
    """
    key = api_key or os.getenv("GOOGLE_MAPS_API_KEY")
    if not key:
        raise ValueError(
            "API key must be provided or set in the GOOGLE_MAPS_API_KEY environment variable."
        )

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


def best_duration(result: TravelTimeResult) -> int:
    if result.duration_in_traffic_seconds is not None:
        return result.duration_in_traffic_seconds
    return result.duration_seconds


def format_seconds(total_seconds: int) -> tuple[int, int, int]:
    hours, remainder = divmod(total_seconds, 3600)
    minutes, seconds = divmod(remainder, 60)
    return hours, minutes, seconds


if __name__ == "__main__":
    # ---------------------------------------------
    # Example 1: Using text addresses
    # ---------------------------------------------
    dt_local = datetime(2026, 9, 19, 14, 0, 0, tzinfo=ZoneInfo("Europe/Lisbon"))

    print("Example usage with text addresses:")
    try:
        result = get_driving_time_google_distance_matrix(
            origin="Praça do Comércio, Lisboa",
            destination="Avenida dos Aliados, Porto",
            departure_time=dt_local,
            api_key=os.getenv("GOOGLE_MAPS_API_KEY", "111111111"),
        )
        secs = best_duration(result)
        h, m, s = format_seconds(secs)
        print(f"From: {result.origin_address or result.origin}")
        print(f"To: {result.destination_address or result.destination}")
        print(f"Distance: {result.distance_meters / 1000:.1f} km ({result.distance_meters} m)")
        print(f"Duration: {h}h {m}m {s}s ({result.duration_text})")
        if result.duration_in_traffic_text:
            print(f"Duration in traffic: {result.duration_in_traffic_text}")
    except Exception as e:
        print(f"API Call Example Output: {e}")

    # ---------------------------------------------
    # Example 2: Coordinates still work seamlessly!
    # ---------------------------------------------
    # result_coords = get_driving_time_google_distance_matrix(
    #     origin=(38.7223, -9.1393),
    #     destination=(41.1579, -8.6291),
    #     departure_time=dt_local,
    #     api_key=os.getenv("GOOGLE_MAPS_API_KEY", "111111111"),
    # )

