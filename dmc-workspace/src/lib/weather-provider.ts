import type { DayWeatherResult, WeatherOptions } from "./weather.ts";
import { portalRequest } from "./python-portal.ts";
import type { Snapshot } from "./itinerary-pdf";
const cache = new Map<string, { expires: number; result: DayWeatherResult }>();
export async function readDayWeather(options: WeatherOptions): Promise<DayWeatherResult> {
  const key = JSON.stringify(options),
    previous = cache.get(key);
  if (previous && previous.expires > Date.now()) return previous.result;
  const result = await portalRequest<DayWeatherResult>("weather", "", options);
  if (result.status === "available") {
    if (cache.size >= 256) cache.delete(cache.keys().next().value!);
    cache.set(key, { expires: Date.now() + 1800000, result });
  }
  return result;
}
// Só lê consultas já efetuadas explicitamente na interface; nunca chama o fornecedor.
export function cachedPlanningWeather(snapshot: Snapshot) {
  const results: Record<number, DayWeatherResult> = {};
  for (const day of snapshot.itinerary) {
    const key = JSON.stringify({
      date: day.date,
      location: day.location,
      items: day.items.map((item) => ({ latitude: item.latitude, longitude: item.longitude })),
    });
    const entry = cache.get(key);
    if (entry && entry.expires > Date.now()) results[day.dayNumber] = entry.result;
  }
  return results;
}
