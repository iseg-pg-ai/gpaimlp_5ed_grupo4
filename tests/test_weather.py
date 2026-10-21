"""Meteorologia com fornecedor simulado; não faz pedidos de rede."""
from datetime import date
import unittest
from portal.weather import coordinates, get_weather_condition, historical_date, fetch_day_weather


def forecast(day="2026-10-10", code=2, high=24.4, low=15.8, **extra):
    return {"daily": {"time": [day], "weather_code": [code], "temperature_2m_max": [high],
                      "temperature_2m_min": [low], **{key: [value] for key, value in extra.items()}}}


class WeatherTest(unittest.TestCase):
    def test_coordinates_prioritize_explicit_and_item_coordinates(self):
        self.assertEqual(coordinates({"location": "Lisboa", "items": [{"latitude": 41.1579, "longitude": -8.6291}]}),
                         {"lat": 41.1579, "lon": -8.6291})
        self.assertEqual(coordinates({"latitude": 0, "longitude": 0, "location": "Porto"}), {"lat": 0, "lon": 0})
        self.assertEqual(coordinates({"latitude": 999, "longitude": 0, "location": "Porto"}), coordinates({"location": "Porto"}))
        self.assertEqual(coordinates({"items": [{"latitude": True, "longitude": 0}]}), coordinates({}))

    def test_regions_are_case_and_accent_insensitive(self):
        self.assertEqual(coordinates({"location": "Vale do Douro"})["lat"], 41.1621)
        self.assertEqual(coordinates({"location": "SINTRA histórica"})["lat"], 38.8029)
        self.assertEqual(coordinates({"location": "Évora"})["lon"], -7.9077)
        self.assertEqual(coordinates({"location": "Lugar Desconhecido"}), coordinates({}))

    def test_reference_year_and_leap_day(self):
        self.assertEqual(historical_date("2027-05-18", 2026), {"targetDate": "2025-05-18", "refYear": 2025})
        self.assertEqual(historical_date("2028-02-29", 2026)["targetDate"], "2025-02-28")
        self.assertEqual(historical_date("2030-06-15", 2028)["targetDate"], "2027-06-15")

    def test_wmo_conditions_and_unknown_codes(self):
        self.assertEqual(get_weather_condition(0)["labelPt"], "Céu limpo")
        self.assertEqual(get_weather_condition(63)["icon"], "🌧️")
        self.assertTrue(get_weather_condition(95)["isRainy"])
        self.assertFalse(get_weather_condition(999)["isRainy"])

    def test_invalid_dates_do_not_contact_provider(self):
        def forbidden(*args):
            self.fail("Não deve chamar o fornecedor")
        for value in ("invalid-date", "2026-02-30", "20261010", None):
            self.assertEqual(fetch_day_weather({"date": value}, forbidden)["status"], "unavailable")

    def test_forecast_parsing_rounding_and_rain(self):
        calls = []
        def provider(url, timeout):
            calls.append((url, timeout))
            return forecast(precipitation_probability_max=50)
        result = fetch_day_weather({"date": "2026-10-10", "location": "Lisboa"}, provider)
        weather = result["weather"]
        self.assertEqual((weather["maxTemp"], weather["minTemp"], weather["icon"]), (24, 16, "⛅"))
        self.assertTrue(weather["isRainy"])
        self.assertFalse(weather["isHistorical"])
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0][1], 4)
        self.assertIn("start_date=2026-10-10", weather["sourceUrl"])
        self.assertNotIn("precipitationSum", weather)
        negative = fetch_day_weather({"date": "2026-10-10"}, lambda *_: forecast(high=-1.5, low=-2.5))
        self.assertEqual(negative["weather"]["maxTemp"], -1)

    def test_out_of_range_forecast_uses_historical_source(self):
        calls = []
        def provider(url, timeout):
            calls.append(url)
            if "archive-api" not in url:
                raise OSError("Out of range")
            return forecast("2025-06-15", 0, 27.3, 17.1, precipitation_sum=2)
        weather = fetch_day_weather({"date": "2027-06-15"}, provider, year=2026)["weather"]
        self.assertTrue(weather["isHistorical"])
        self.assertTrue(weather["isRainy"])
        self.assertEqual(weather["historicalReferenceYear"], 2025)
        self.assertEqual(len(calls), 2)
        self.assertIn("archive-api.open-meteo.com", weather["sourceUrl"])
        self.assertNotIn("precipitationProbability", weather)

    def test_missing_malformed_or_wrong_date_data_is_not_a_forecast(self):
        for payload in ({}, [], {"daily": None}, forecast(high=None), forecast(day="2020-01-01")):
            self.assertEqual(fetch_day_weather({"date": "2026-10-10"}, lambda *_, p=payload: p)["status"], "unavailable")
        result = fetch_day_weather({"date": "2026-10-10"}, lambda *_: (_ for _ in ()).throw(TimeoutError()))
        self.assertEqual(result["status"], "unavailable")
