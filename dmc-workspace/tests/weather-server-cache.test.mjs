import assert from "node:assert/strict";
import test from "node:test";

import {
  cachedServerDayWeather,
  cachedWeatherResult,
  clearServerWeatherCache,
  storeWeatherResult,
} from "../src/lib/weather-server-cache.ts";

const options = { date: "2026-10-25", location: "Porto", items: [] };
const available = {
  status: "available",
  weather: {
    date: options.date,
    weatherCode: 61,
    conditionPt: "Chuva",
    conditionEn: "Rain",
    icon: "rain",
    maxTemp: 18,
    minTemp: 12,
    isRainy: true,
    isHistorical: false,
    latitude: 41.15,
    longitude: -8.61,
    sourceUrl: "https://example.invalid",
  },
};

test("a cache servidor só disponibiliza meteorologia anteriormente consultada", () => {
  clearServerWeatherCache();
  assert.equal(cachedServerDayWeather(options), undefined);
  storeWeatherResult(options, available);
  assert.deepEqual(cachedWeatherResult(options), available);
  assert.deepEqual(cachedServerDayWeather(options), available.weather);
  assert.equal(cachedServerDayWeather({ ...options, location: "Lisboa" }), undefined);
});

test("resultados indisponíveis não entram na cache servidor", () => {
  clearServerWeatherCache();
  storeWeatherResult(options, {
    status: "unavailable",
    messagePt: "Indisponível",
    messageEn: "Unavailable",
  });
  assert.equal(cachedWeatherResult(options), undefined);
});
