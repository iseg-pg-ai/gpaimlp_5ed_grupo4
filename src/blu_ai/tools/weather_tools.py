"""Ferramenta do agente que reutiliza a meteorologia Python do portal."""
from typing import Any
from langchain_core.tools import tool
from pydantic import BaseModel, Field
from portal.weather import fetch_day_weather


class WeatherParams(BaseModel):
    city: str = Field(description="Nome da cidade portuguesa (ex: 'Lisboa', 'Porto', 'Sintra')")
    date: str = Field(description="Data da previsão ou consulta no formato YYYY-MM-DD")


@tool("get_weather_forecast", args_schema=WeatherParams)
def get_weather_forecast(city: str, date: str) -> dict[str, Any]:
    """Consulta previsão ou referência histórica; indisponibilidade não comprova bom tempo."""
    result = fetch_day_weather({"date": date, "location": city})
    if result["status"] == "unavailable":
        return {"city": city, "date": date, **result,
                "recommendation": "Meteorologia indisponível; confirmar as condições antes de propor atividades ao ar livre."}
    weather = result["weather"]
    recommendation = (
        "Referência histórica, não previsão para a viagem; confirmar condições antes de propor atividades ao ar livre."
        if weather["isHistorical"] else
        "Previsão indica chuva; considerar alternativas cobertas e confirmar condições."
        if weather["isRainy"] else
        "Consultar a previsão e confirmar as condições antes de propor atividades ao ar livre."
    )
    return {"status": "available", "city": city, "date": date,
            "temp_max_c": weather["maxTemp"], "temp_min_c": weather["minTemp"],
            **({"precipitation_probability": weather["precipitationProbability"]}
               if "precipitationProbability" in weather else {}),
            "is_rainy": weather["isRainy"], "is_historical": weather["isHistorical"],
            "source_url": weather["sourceUrl"], "recommendation": recommendation}
