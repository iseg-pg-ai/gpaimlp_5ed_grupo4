"""Meteorologia do portal: coordenadas, previsão e histórico Open-Meteo."""
from datetime import date
import json
import math
import unicodedata
from urllib.parse import urlencode
from urllib.request import urlopen

WMO_WEATHER_MAP = {0: {'code': 0, 'labelPt': 'Céu limpo', 'labelEn': 'Clear sky', 'icon': '☀️', 'isRainy': False},
 1: {'code': 1,
     'labelPt': 'Predominantemente limpo',
     'labelEn': 'Mainly clear',
     'icon': '🌤️',
     'isRainy': False},
 2: {'code': 2,
     'labelPt': 'Parcialmente nublado',
     'labelEn': 'Partly cloudy',
     'icon': '⛅',
     'isRainy': False},
 3: {'code': 3, 'labelPt': 'Encoberto', 'labelEn': 'Overcast', 'icon': '☁️', 'isRainy': False},
 45: {'code': 45, 'labelPt': 'Nevoeiro', 'labelEn': 'Fog', 'icon': '🌫️', 'isRainy': False},
 48: {'code': 48,
      'labelPt': 'Nevoeiro com geada',
      'labelEn': 'Depositing rime fog',
      'icon': '🌫️',
      'isRainy': False},
 51: {'code': 51,
      'labelPt': 'Chuvisco ligeiro',
      'labelEn': 'Light drizzle',
      'icon': '🌦️',
      'isRainy': True},
 53: {'code': 53,
      'labelPt': 'Chuvisco moderado',
      'labelEn': 'Moderate drizzle',
      'icon': '🌦️',
      'isRainy': True},
 55: {'code': 55,
      'labelPt': 'Chuvisco denso',
      'labelEn': 'Dense drizzle',
      'icon': '🌧️',
      'isRainy': True},
 56: {'code': 56,
      'labelPt': 'Chuvisco gelado ligeiro',
      'labelEn': 'Light freezing drizzle',
      'icon': '🌧️',
      'isRainy': True},
 57: {'code': 57,
      'labelPt': 'Chuvisco gelado denso',
      'labelEn': 'Dense freezing drizzle',
      'icon': '🌧️',
      'isRainy': True},
 61: {'code': 61,
      'labelPt': 'Chuva fraca',
      'labelEn': 'Slight rain',
      'icon': '🌧️',
      'isRainy': True},
 63: {'code': 63,
      'labelPt': 'Chuva moderada',
      'labelEn': 'Moderate rain',
      'icon': '🌧️',
      'isRainy': True},
 65: {'code': 65, 'labelPt': 'Chuva forte', 'labelEn': 'Heavy rain', 'icon': '🌧️', 'isRainy': True},
 66: {'code': 66,
      'labelPt': 'Chuva gelada fraca',
      'labelEn': 'Light freezing rain',
      'icon': '🌧️',
      'isRainy': True},
 67: {'code': 67,
      'labelPt': 'Chuva gelada forte',
      'labelEn': 'Heavy freezing rain',
      'icon': '🌧️',
      'isRainy': True},
 71: {'code': 71,
      'labelPt': 'Queda de neve fraca',
      'labelEn': 'Slight snow',
      'icon': '🌨️',
      'isRainy': False},
 73: {'code': 73,
      'labelPt': 'Queda de neve moderada',
      'labelEn': 'Moderate snow',
      'icon': '🌨️',
      'isRainy': False},
 75: {'code': 75,
      'labelPt': 'Queda de neve forte',
      'labelEn': 'Heavy snow',
      'icon': '🌨️',
      'isRainy': False},
 77: {'code': 77,
      'labelPt': 'Grãos de neve',
      'labelEn': 'Snow grains',
      'icon': '🌨️',
      'isRainy': False},
 80: {'code': 80,
      'labelPt': 'Aguaceiros fracos',
      'labelEn': 'Slight rain showers',
      'icon': '🌦️',
      'isRainy': True},
 81: {'code': 81,
      'labelPt': 'Aguaceiros moderados',
      'labelEn': 'Moderate rain showers',
      'icon': '🌧️',
      'isRainy': True},
 82: {'code': 82,
      'labelPt': 'Aguaceiros violentos',
      'labelEn': 'Violent rain showers',
      'icon': '⛈️',
      'isRainy': True},
 85: {'code': 85,
      'labelPt': 'Aguaceiros de neve fracos',
      'labelEn': 'Slight snow showers',
      'icon': '🌨️',
      'isRainy': False},
 86: {'code': 86,
      'labelPt': 'Aguaceiros de neve fortes',
      'labelEn': 'Heavy snow showers',
      'icon': '🌨️',
      'isRainy': False},
 95: {'code': 95, 'labelPt': 'Trovoada', 'labelEn': 'Thunderstorm', 'icon': '⛈️', 'isRainy': True},
 96: {'code': 96,
      'labelPt': 'Trovoada com granizo',
      'labelEn': 'Thunderstorm with slight hail',
      'icon': '⛈️',
      'isRainy': True},
 99: {'code': 99,
      'labelPt': 'Trovoada com granizo forte',
      'labelEn': 'Thunderstorm with heavy hail',
      'icon': '⛈️',
      'isRainy': True}}

PORTUGAL_REGION_COORDINATES = {'lisboa': {'lat': 38.7223, 'lon': -9.1393},
 'lisbon': {'lat': 38.7223, 'lon': -9.1393},
 'porto': {'lat': 41.1579, 'lon': -8.6291},
 'douro': {'lat': 41.1621, 'lon': -7.7909},
 'peso da regua': {'lat': 41.1621, 'lon': -7.7909},
 'pinhao': {'lat': 41.1903, 'lon': -7.5458},
 'sintra': {'lat': 38.8029, 'lon': -9.3817},
 'cascais': {'lat': 38.6979, 'lon': -9.4215},
 'evora': {'lat': 38.5714, 'lon': -7.9077},
 'coimbra': {'lat': 40.2056, 'lon': -8.4195},
 'braga': {'lat': 41.5454, 'lon': -8.4265},
 'guimaraes': {'lat': 41.4425, 'lon': -8.2918},
 'faro': {'lat': 37.0194, 'lon': -7.9304},
 'algarve': {'lat': 37.0194, 'lon': -7.9304},
 'lagos': {'lat': 37.1028, 'lon': -8.673},
 'alentejo': {'lat': 38.5714, 'lon': -7.9077},
 'aveiro': {'lat': 40.6405, 'lon': -8.6538},
 'madeira': {'lat': 32.6669, 'lon': -16.9241},
 'funchal': {'lat': 32.6669, 'lon': -16.9241},
 'azores': {'lat': 37.7412, 'lon': -25.6756},
 'acores': {'lat': 37.7412, 'lon': -25.6756}}

def get_weather_condition(code):
    return WMO_WEATHER_MAP.get(code, {"code": code, "labelPt": "Tempo variável",
                                    "labelEn": "Variable weather", "icon": "🌤️", "isRainy": False})


def valid_number(value):
    return type(value) in (int, float) and math.isfinite(value)


def coordinates(options):
    def pair(lat, lon):
        return valid_number(lat) and valid_number(lon) and -90 <= lat <= 90 and -180 <= lon <= 180
    if pair(options.get("latitude"), options.get("longitude")):
        return {"lat": options["latitude"], "lon": options["longitude"]}
    for item in options.get("items") or []:
        if pair(item.get("latitude"), item.get("longitude")):
            return {"lat": item["latitude"], "lon": item["longitude"]}
    location = options.get("location") or ""
    normalized = "".join(c for c in unicodedata.normalize("NFD", location) if not "\u0300" <= c <= "\u036f").lower().strip()
    if normalized:
        for key, coords in PORTUGAL_REGION_COORDINATES.items():
            if normalized in key or key in normalized:
                return coords.copy()
    return PORTUGAL_REGION_COORDINATES["lisboa"].copy()


def historical_date(value, year=None):
    reference = max(2025, (year if year is not None else date.today().year) - 1)
    month_day = "02-28" if value[5:] == "02-29" else value[5:]
    return {"targetDate": f"{reference}-{month_day}", "refYear": reference}


def read_json(url, timeout):
    with urlopen(url, timeout=timeout) as response:
        contents = response.read(1024 * 1024 + 1)
        if len(contents) > 1024 * 1024:
            raise ValueError("Resposta meteorológica demasiado grande.")
        return json.loads(contents)


def unavailable(invalid=False):
    return {"status": "unavailable",
            "messagePt": "Data inválida" if invalid else "Meteorologia temporariamente indisponível",
            "messageEn": "Invalid date" if invalid else "Weather temporarily unavailable"}


def fetch_day_weather(options, fetch_json=None, year=None):
    fetch_json = fetch_json or read_json
    value = options.get("date", "")
    try:
        if date.fromisoformat(value).isoformat() != value:
            return unavailable(True)
    except (ValueError, TypeError):
        return unavailable(True)
    coords = coordinates(options)
    timeout_ms = options.get("timeoutMs", 4000)
    timeout = min(4, max(0.1, timeout_ms / 1000)) if valid_number(timeout_ms) else 4
    reference = historical_date(value, year)
    for historical in (False, True):
        requested_date = reference["targetDate"] if historical else value
        daily = "weather_code,temperature_2m_max,temperature_2m_min,"
        daily += "precipitation_sum" if historical else "precipitation_probability_max,precipitation_sum"
        host = "https://archive-api.open-meteo.com/v1/archive" if historical else "https://api.open-meteo.com/v1/forecast"
        url = host + "?" + urlencode({"latitude": coords["lat"], "longitude": coords["lon"],
                                     "daily": daily, "timezone": "Europe/Lisbon",
                                     "start_date": requested_date, "end_date": requested_date})
        try:
            response = fetch_json(url, timeout)
            if not isinstance(response, dict) or not isinstance(response.get("daily"), dict):
                continue
            data = response["daily"]
            def first(key):
                values = data.get(key) or []
                return values[0] if isinstance(values, list) and values else None
            code, high, low = first("weather_code"), first("temperature_2m_max"), first("temperature_2m_min")
            # Não transformar dados ausentes em temperaturas ou condições inventadas.
            if response.get("error") or not all(valid_number(v) for v in (code, high, low)):
                continue
            if first("time") != requested_date:
                continue
            condition = get_weather_condition(code)
            probability, rain = first("precipitation_probability_max"), first("precipitation_sum")
            weather = {"date": value, "weatherCode": code, "conditionPt": condition["labelPt"],
                       "conditionEn": condition["labelEn"], "icon": condition["icon"],
                       "maxTemp": math.floor(high + 0.5), "minTemp": math.floor(low + 0.5),
                       "isRainy": condition["isRainy"] or (rain > 1 if historical and valid_number(rain) else
                                                          probability >= 50 if not historical and valid_number(probability) else False),
                       "isHistorical": historical, "latitude": coords["lat"], "longitude": coords["lon"], "sourceUrl": url}
            if valid_number(rain):
                weather["precipitationSum"] = rain
            if not historical and valid_number(probability):
                weather["precipitationProbability"] = probability
            if historical:
                weather["historicalReferenceYear"] = reference["refYear"]
            return {"status": "available", "weather": weather}
        except (OSError, ValueError, KeyError, TypeError, IndexError):
            continue
    return unavailable()
