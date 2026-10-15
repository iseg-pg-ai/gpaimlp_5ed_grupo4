import { portalFetch, responseJson } from "./http-client.ts";

export interface DayWeather {
  date: string;
  weatherCode: number;
  conditionPt: string;
  conditionEn: string;
  icon: string;
  maxTemp: number;
  minTemp: number;
  precipitationProbability?: number;
  precipitationSum?: number;
  isRainy: boolean;
  isHistorical: boolean;
  historicalReferenceYear?: number;
  latitude: number;
  longitude: number;
  sourceUrl: string;
}

export type DayWeatherResult =
  | {
      status: "available";
      weather: DayWeather;
    }
  | {
      status: "unavailable";
      messagePt: string;
      messageEn: string;
    };

export type WeatherOptions = {
  date: string;
  location?: string;
  latitude?: number;
  longitude?: number;
  items?: Array<{ latitude?: number | null; longitude?: number | null }>;
};
const cache = new Map<string, { expires: number; result: DayWeatherResult }>();
export function clearWeatherCache() {
  cache.clear();
}

export async function fetchDayWeather(options: WeatherOptions): Promise<DayWeatherResult> {
  const key = JSON.stringify(options);
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.result;
  const result = await responseJson<DayWeatherResult>(
    await portalFetch("/api/weather", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: key,
    }),
  );
  if (result.status === "available")
    cache.set(key, { expires: Date.now() + 30 * 60 * 1000, result });
  return result;
}
