import test from "node:test";
import assert from "node:assert/strict";
import {
  getWeatherCondition,
  resolveCoordinatesForDay,
  getHistoricalFallbackDate,
  fetchDayWeather,
  clearWeatherCache,
  PORTUGAL_REGION_COORDINATES,
} from "../src/lib/weather.ts";

test("resolveCoordinatesForDay prioritizes item coordinates when present", () => {
  const coords = resolveCoordinatesForDay("Lisboa", [
    { latitude: 41.1579, longitude: -8.6291 },
  ]);
  assert.equal(coords.lat, 41.1579);
  assert.equal(coords.lon, -8.6291);
});

test("resolveCoordinatesForDay resolves Portuguese regions case-insensitively with accents", () => {
  const douro = resolveCoordinatesForDay("Vale do Douro");
  assert.equal(douro.lat, PORTUGAL_REGION_COORDINATES.douro.lat);
  assert.equal(douro.lon, PORTUGAL_REGION_COORDINATES.douro.lon);

  const sintra = resolveCoordinatesForDay("Sintra histórica");
  assert.equal(sintra.lat, PORTUGAL_REGION_COORDINATES.sintra.lat);

  const unknown = resolveCoordinatesForDay("Lugar Desconhecido");
  assert.equal(unknown.lat, PORTUGAL_REGION_COORDINATES.lisboa.lat);
});

test("getHistoricalFallbackDate computes reference year and preserves month/day", () => {
  const res = getHistoricalFallbackDate("2027-05-18");
  assert.equal(res.targetDate, "2025-05-18");
  assert.equal(res.refYear, 2025);

  const leap = getHistoricalFallbackDate("2028-02-29");
  assert.equal(leap.targetDate, "2025-02-28");
});

test("getWeatherCondition maps WMO codes and detects rain flags accurately", () => {
  const sunny = getWeatherCondition(0);
  assert.equal(sunny.icon, "☀️");
  assert.equal(sunny.isRainy, false);
  assert.equal(sunny.labelPt, "Céu limpo");

  const rain = getWeatherCondition(63);
  assert.equal(rain.icon, "🌧️");
  assert.equal(rain.isRainy, true);

  const thunder = getWeatherCondition(95);
  assert.equal(thunder.icon, "⛈️");
  assert.equal(thunder.isRainy, true);

  const fallback = getWeatherCondition(999);
  assert.equal(fallback.icon, "🌤️");
  assert.equal(fallback.isRainy, false);
});

test("fetchDayWeather handles invalid date formats safely", async () => {
  const res = await fetchDayWeather({ date: "invalid-date" });
  assert.equal(res.status, "unavailable");
});

test("fetchDayWeather caches responses and parses daily forecast payload", async () => {
  clearWeatherCache();
  const originalFetch = globalThis.fetch;
  let callCount = 0;

  globalThis.fetch = async () => {
    callCount++;
    return {
      ok: true,
      json: async () => ({
        daily: {
          time: ["2026-10-10"],
          weather_code: [2],
          temperature_2m_max: [24.4],
          temperature_2m_min: [15.8],
          precipitation_probability_max: [10],
        },
      }),
    };
  };

  try {
    const res1 = await fetchDayWeather({
      date: "2026-10-10",
      location: "Lisboa",
    });
    assert.equal(res1.status, "available");
    if (res1.status === "available") {
      assert.equal(res1.weather.maxTemp, 24);
      assert.equal(res1.weather.minTemp, 16);
      assert.equal(res1.weather.icon, "⛅");
      assert.equal(res1.weather.isRainy, false);
      assert.equal(res1.weather.isHistorical, false);
    }

    // Second call with same parameters should come from memory cache
    const res2 = await fetchDayWeather({
      date: "2026-10-10",
      location: "Lisboa",
    });
    assert.equal(res2.status, "available");
    assert.equal(callCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
    clearWeatherCache();
  }
});

test("fetchDayWeather falls back to historical archive when forecast is out of range", async () => {
  clearWeatherCache();
  const originalFetch = globalThis.fetch;
  const requestedUrls = [];

  globalThis.fetch = async (url) => {
    requestedUrls.push(String(url));
    if (String(url).includes("api.open-meteo.com/v1/forecast")) {
      return {
        ok: false,
        json: async () => ({
          error: true,
          reason: "Parameter 'start_date' is out of allowed range",
        }),
      };
    }

    if (String(url).includes("archive-api.open-meteo.com/v1/archive")) {
      return {
        ok: true,
        json: async () => ({
          daily: {
            time: ["2025-06-15"],
            weather_code: [0],
            temperature_2m_max: [27.3],
            temperature_2m_min: [17.1],
            precipitation_sum: [0.0],
          },
        }),
      };
    }

    throw new Error("Unexpected URL: " + url);
  };

  try {
    const res = await fetchDayWeather({
      date: "2027-06-15",
      location: "Lisboa",
    });
    assert.equal(res.status, "available");
    if (res.status === "available") {
      assert.equal(res.weather.isHistorical, true);
      assert.equal(res.weather.historicalReferenceYear, 2025);
      assert.equal(res.weather.maxTemp, 27);
      assert.equal(res.weather.minTemp, 17);
      assert.equal(res.weather.icon, "☀️");
    }
    assert.equal(requestedUrls.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
    clearWeatherCache();
  }
});
