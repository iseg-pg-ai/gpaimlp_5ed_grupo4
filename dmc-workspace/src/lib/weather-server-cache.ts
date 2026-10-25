import type { DayWeather, DayWeatherResult, WeatherOptions } from "./weather.ts";

const cache = new Map<string, { expires: number; result: DayWeatherResult }>();

export function weatherCacheKey(options: WeatherOptions) {
  return JSON.stringify(options);
}

export function cachedWeatherResult(options: WeatherOptions): DayWeatherResult | undefined {
  const cached = cache.get(weatherCacheKey(options));
  return cached && cached.expires > Date.now() ? cached.result : undefined;
}

export function cachedServerDayWeather(options: WeatherOptions): DayWeather | undefined {
  const result = cachedWeatherResult(options);
  return result?.status === "available" ? result.weather : undefined;
}

export function storeWeatherResult(options: WeatherOptions, result: DayWeatherResult) {
  if (result.status !== "available") return;
  if (cache.size >= 256) cache.delete(cache.keys().next().value!);
  cache.set(weatherCacheKey(options), { expires: Date.now() + 30 * 60 * 1000, result });
}

export function clearServerWeatherCache() {
  cache.clear();
}
