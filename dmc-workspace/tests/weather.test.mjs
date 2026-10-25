import test from "node:test";
import assert from "node:assert/strict";
import { fetchDayWeather, clearWeatherCache } from "../src/lib/weather.ts";

const available = { status: "available", weather: { date: "2026-10-10", maxTemp: 24 } };
test("weather browser client uses the local API, preserves coordinates and caches available results", async () => {
  const previousFetch = globalThis.fetch;
  const prefix = process.env.NEXT_PUBLIC_PORTAL_BASE_PATH;
  const calls = [];
  clearWeatherCache();
  process.env.NEXT_PUBLIC_PORTAL_BASE_PATH = "/codeeditor/default/ports/3001";
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return Response.json(available);
  };
  try {
    const options = {
      date: "2026-10-10",
      location: "Lisboa",
      items: [{ latitude: 41.15, longitude: -8.62 }],
    };
    assert.deepEqual(await fetchDayWeather(options), available);
    assert.deepEqual(await fetchDayWeather(options), available);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "/codeeditor/default/ports/3001/api/weather");
    assert.equal(calls[0].init.method, "POST");
    assert.deepEqual(JSON.parse(calls[0].init.body), options);
  } finally {
    globalThis.fetch = previousFetch;
    if (prefix === undefined) delete process.env.NEXT_PUBLIC_PORTAL_BASE_PATH;
    else process.env.NEXT_PUBLIC_PORTAL_BASE_PATH = prefix;
    clearWeatherCache();
  }
});
test("unavailable weather and API failures are not cached", async () => {
  const previous = globalThis.fetch;
  clearWeatherCache();
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return calls === 1
      ? Response.json({ status: "unavailable" })
      : Response.json({ error: "Python indisponível" }, { status: 503 });
  };
  try {
    const options = { date: "2026-10-10" };
    assert.equal((await fetchDayWeather(options)).status, "unavailable");
    await assert.rejects(fetchDayWeather(options), /Python indisponível/);
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = previous;
    clearWeatherCache();
  }
});
