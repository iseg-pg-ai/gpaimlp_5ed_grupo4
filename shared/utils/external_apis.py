from dataclasses import dataclass
import httpx
from shared.config import settings


@dataclass
class ExternalApiClients:
    """HTTP clients; credentials are optional so local/test execution stays deterministic."""

    async def route(self, origin: str, destination: str) -> dict:
        if not settings.google_maps_api_key:
            return {"duration_minutes": 20, "provider": "fallback"}
        async with httpx.AsyncClient() as c:
            response = await c.get(
                "https://maps.googleapis.com/maps/api/directions/json",
                params={
                    "origin": origin,
                    "destination": destination,
                    "key": settings.google_maps_api_key,
                },
            )
            response.raise_for_status()
            data = response.json()
            seconds = data["routes"][0]["legs"][0]["duration"]["value"]
            return {"duration_minutes": round(seconds / 60), "provider": "google_maps"}

    async def weather(self, city: str) -> dict:
        if not settings.openweather_api_key:
            return {"summary": "unavailable", "provider": "fallback"}
        async with httpx.AsyncClient() as c:
            r = await c.get(
                "https://api.openweathermap.org/data/2.5/weather",
                params={"q": city, "appid": settings.openweather_api_key, "units": "metric"},
            )
            r.raise_for_status()
            return {"summary": r.json()["weather"][0]["description"], "provider": "openweather"}

    async def places(self, query: str) -> list[dict]:
        # Provider selection permits Google Places, Geoapify and TripAdvisor adapters.
        if not settings.geoapify_api_key:
            return []
        async with httpx.AsyncClient() as c:
            r = await c.get(
                "https://api.geoapify.com/v2/places",
                params={"categories": query, "apiKey": settings.geoapify_api_key},
            )
            r.raise_for_status()
            return r.json().get("features", [])

    async def ride_estimate(self, provider: str, origin: str, destination: str) -> dict:
        if provider not in {"uber", "bolt"}:
            raise ValueError("provider must be uber or bolt")
        return {
            "provider": provider,
            "origin": origin,
            "destination": destination,
            "status": "configure-provider-adapter",
        }
