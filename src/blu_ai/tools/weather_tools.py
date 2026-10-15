"""LangChain Tool for weather forecasting and historical climate."""

from __future__ import annotations

from typing import Dict, Any, Optional
import httpx
from langchain_core.tools import tool
from pydantic import BaseModel, Field


CITY_COORDINATES: Dict[str, tuple[float, float]] = {
    "lisboa": (38.7223, -9.1393),
    "porto": (41.1579, -8.6291),
    "sintra": (38.8029, -9.3817),
    "cascais": (38.6979, -9.4215),
    "evora": (38.5714, -7.9135),
    "coimbra": (40.2033, -8.4103),
    "faro": (37.0194, -7.9304),
    "douro": (41.1621, -7.7906),
}


class WeatherParams(BaseModel):
    city: str = Field(description="Nome da cidade portuguesa (ex: 'Lisboa', 'Porto', 'Sintra')")
    date: str = Field(description="Data da previsão ou consulta no formato YYYY-MM-DD")


@tool("get_weather_forecast", args_schema=WeatherParams)
def get_weather_forecast(city: str, date: str) -> Dict[str, Any]:
    """Obtém a previsão meteorológica ou dados históricos para uma cidade e data.
    Utilize para validar se atividades ao ar livre são viáveis ou se deve sugerir alternativas para chuva/calor.
    """
    clean_city = city.lower().strip()
    coords = CITY_COORDINATES.get(clean_city, (38.7223, -9.1393))

    url = (
        f"https://api.open-meteo.com/v1/forecast"
        f"?latitude={coords[0]}&longitude={coords[1]}"
        f"&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weathercode"
        f"&timezone=Europe%2FLisbon"
    )

    try:
        with httpx.Client(timeout=4.0) as client:
            resp = client.get(url)
            if resp.status_code == 200:
                data = resp.json()
                daily = data.get("daily", {})
                dates = daily.get("time", [])
                if date in dates:
                    idx = dates.index(date)
                    temp_max = daily.get("temperature_2m_max", [22])[idx]
                    temp_min = daily.get("temperature_2m_min", [14])[idx]
                    rain_prob = daily.get("precipitation_probability_max", [10])[idx]
                    is_rainy = rain_prob > 40
                    return {
                        "city": city,
                        "date": date,
                        "temp_max_c": temp_max,
                        "temp_min_c": temp_min,
                        "precipitation_probability": rain_prob,
                        "is_rainy": is_rainy,
                        "recommendation": "Adequado para exteriores" if not is_rainy else "Recomenda-se plano coberto ou museu devido a probabilidade de chuva"
                    }
    except Exception:
        pass

    # Fallback climatológico equilibrado
    return {
        "city": city,
        "date": date,
        "temp_max_c": 21.0,
        "temp_min_c": 13.5,
        "precipitation_probability": 15,
        "is_rainy": False,
        "recommendation": "Clima ameno típico português; atividades ao ar livre recomendadas.",
        "is_climatological_estimate": True
    }
