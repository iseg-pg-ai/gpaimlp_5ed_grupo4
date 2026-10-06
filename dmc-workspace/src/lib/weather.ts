export interface WeatherCondition {
  code: number;
  labelPt: string;
  labelEn: string;
  icon: string;
  isRainy: boolean;
}

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

export const WMO_WEATHER_MAP: Record<number, WeatherCondition> = {
  0: { code: 0, labelPt: "Céu limpo", labelEn: "Clear sky", icon: "☀️", isRainy: false },
  1: { code: 1, labelPt: "Predominantemente limpo", labelEn: "Mainly clear", icon: "🌤️", isRainy: false },
  2: { code: 2, labelPt: "Parcialmente nublado", labelEn: "Partly cloudy", icon: "⛅", isRainy: false },
  3: { code: 3, labelPt: "Encoberto", labelEn: "Overcast", icon: "☁️", isRainy: false },
  45: { code: 45, labelPt: "Nevoeiro", labelEn: "Fog", icon: "🌫️", isRainy: false },
  48: { code: 48, labelPt: "Nevoeiro com geada", labelEn: "Depositing rime fog", icon: "🌫️", isRainy: false },
  51: { code: 51, labelPt: "Chuvisco ligeiro", labelEn: "Light drizzle", icon: "🌦️", isRainy: true },
  53: { code: 53, labelPt: "Chuvisco moderado", labelEn: "Moderate drizzle", icon: "🌦️", isRainy: true },
  55: { code: 55, labelPt: "Chuvisco denso", labelEn: "Dense drizzle", icon: "🌧️", isRainy: true },
  56: { code: 56, labelPt: "Chuvisco gelado ligeiro", labelEn: "Light freezing drizzle", icon: "🌧️", isRainy: true },
  57: { code: 57, labelPt: "Chuvisco gelado denso", labelEn: "Dense freezing drizzle", icon: "🌧️", isRainy: true },
  61: { code: 61, labelPt: "Chuva fraca", labelEn: "Slight rain", icon: "🌧️", isRainy: true },
  63: { code: 63, labelPt: "Chuva moderada", labelEn: "Moderate rain", icon: "🌧️", isRainy: true },
  65: { code: 65, labelPt: "Chuva forte", labelEn: "Heavy rain", icon: "🌧️", isRainy: true },
  66: { code: 66, labelPt: "Chuva gelada fraca", labelEn: "Light freezing rain", icon: "🌧️", isRainy: true },
  67: { code: 67, labelPt: "Chuva gelada forte", labelEn: "Heavy freezing rain", icon: "🌧️", isRainy: true },
  71: { code: 71, labelPt: "Queda de neve fraca", labelEn: "Slight snow", icon: "🌨️", isRainy: false },
  73: { code: 73, labelPt: "Queda de neve moderada", labelEn: "Moderate snow", icon: "🌨️", isRainy: false },
  75: { code: 75, labelPt: "Queda de neve forte", labelEn: "Heavy snow", icon: "🌨️", isRainy: false },
  77: { code: 77, labelPt: "Grãos de neve", labelEn: "Snow grains", icon: "🌨️", isRainy: false },
  80: { code: 80, labelPt: "Aguaceiros fracos", labelEn: "Slight rain showers", icon: "🌦️", isRainy: true },
  81: { code: 81, labelPt: "Aguaceiros moderados", labelEn: "Moderate rain showers", icon: "🌧️", isRainy: true },
  82: { code: 82, labelPt: "Aguaceiros violentos", labelEn: "Violent rain showers", icon: "⛈️", isRainy: true },
  85: { code: 85, labelPt: "Aguaceiros de neve fracos", labelEn: "Slight snow showers", icon: "🌨️", isRainy: false },
  86: { code: 86, labelPt: "Aguaceiros de neve fortes", labelEn: "Heavy snow showers", icon: "🌨️", isRainy: false },
  95: { code: 95, labelPt: "Trovoada", labelEn: "Thunderstorm", icon: "⛈️", isRainy: true },
  96: { code: 96, labelPt: "Trovoada com granizo", labelEn: "Thunderstorm with slight hail", icon: "⛈️", isRainy: true },
  99: { code: 99, labelPt: "Trovoada com granizo forte", labelEn: "Thunderstorm with heavy hail", icon: "⛈️", isRainy: true },
};

export const PORTUGAL_REGION_COORDINATES: Record<string, { lat: number; lon: number }> = {
  lisboa: { lat: 38.7223, lon: -9.1393 },
  lisbon: { lat: 38.7223, lon: -9.1393 },
  porto: { lat: 41.1579, lon: -8.6291 },
  douro: { lat: 41.1621, lon: -7.7909 },
  "peso da regua": { lat: 41.1621, lon: -7.7909 },
  pinhao: { lat: 41.1903, lon: -7.5458 },
  sintra: { lat: 38.8029, lon: -9.3817 },
  cascais: { lat: 38.6979, lon: -9.4215 },
  evora: { lat: 38.5714, lon: -7.9077 },
  coimbra: { lat: 40.2056, lon: -8.4195 },
  braga: { lat: 41.5454, lon: -8.4265 },
  guimaraes: { lat: 41.4425, lon: -8.2918 },
  faro: { lat: 37.0194, lon: -7.9304 },
  algarve: { lat: 37.0194, lon: -7.9304 },
  lagos: { lat: 37.1028, lon: -8.673 },
  alentejo: { lat: 38.5714, lon: -7.9077 },
  aveiro: { lat: 40.6405, lon: -8.6538 },
  madeira: { lat: 32.6669, lon: -16.9241 },
  funchal: { lat: 32.6669, lon: -16.9241 },
  azores: { lat: 37.7412, lon: -25.6756 },
  acores: { lat: 37.7412, lon: -25.6756 },
};

export function getWeatherCondition(code: number): WeatherCondition {
  return (
    WMO_WEATHER_MAP[code] ?? {
      code,
      labelPt: "Tempo variável",
      labelEn: "Variable weather",
      icon: "🌤️",
      isRainy: false,
    }
  );
}

export function resolveCoordinatesForDay(
  location?: string,
  items?: Array<{ latitude?: number | null; longitude?: number | null }>,
): { lat: number; lon: number } {
  if (items && items.length > 0) {
    for (const it of items) {
      if (
        typeof it.latitude === "number" &&
        typeof it.longitude === "number" &&
        Number.isFinite(it.latitude) &&
        Number.isFinite(it.longitude)
      ) {
        return { lat: it.latitude, lon: it.longitude };
      }
    }
  }

  if (location) {
    const normLoc = location
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
    for (const [key, coords] of Object.entries(PORTUGAL_REGION_COORDINATES)) {
      if (normLoc.includes(key) || key.includes(normLoc)) {
        return coords;
      }
    }
  }

  return PORTUGAL_REGION_COORDINATES.lisboa;
}

export function getHistoricalFallbackDate(dateStr: string): { targetDate: string; refYear: number } {
  const parts = dateStr.split("-");
  const month = parts[1] || "10";
  const day = parts[2] || "01";
  const monthDay = month === "02" && day === "29" ? "02-28" : `${month}-${day}`;

  const currentYear = new Date().getFullYear();
  const refYear = currentYear > 2025 ? currentYear - 1 : 2025;
  return {
    targetDate: `${refYear}-${monthDay}`,
    refYear,
  };
}

interface CacheEntry {
  expiresAt: number;
  result: DayWeatherResult;
}

const memoryCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

export function clearWeatherCache(): void {
  memoryCache.clear();
}

export async function fetchDayWeather(options: {
  date: string;
  latitude?: number;
  longitude?: number;
  location?: string;
  items?: Array<{ latitude?: number | null; longitude?: number | null }>;
  timeoutMs?: number;
}): Promise<DayWeatherResult> {
  const { date, location, items, timeoutMs = 4000 } = options;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return {
      status: "unavailable",
      messagePt: "Data inválida",
      messageEn: "Invalid date",
    };
  }

  const coords =
    typeof options.latitude === "number" &&
    typeof options.longitude === "number" &&
    Number.isFinite(options.latitude) &&
    Number.isFinite(options.longitude)
      ? { lat: options.latitude, lon: options.longitude }
      : resolveCoordinatesForDay(location, items);

  const cacheKey = `${coords.lat.toFixed(3)},${coords.lon.toFixed(3)},${date}`;
  const now = Date.now();
  const cached = memoryCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.result;
  }

  // 1. Try real-time / short-range forecast API first
  const forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum&timezone=Europe/Lisbon&start_date=${date}&end_date=${date}`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(forecastUrl, { signal: controller.signal });
    clearTimeout(timer);

    if (response.ok) {
      const data = await response.json();
      if (!data?.error && data.daily?.weather_code && data.daily.weather_code.length > 0) {
        const weatherCode = data.daily.weather_code[0] ?? 0;
        const maxTemp = Math.round(data.daily.temperature_2m_max?.[0] ?? 20);
        const minTemp = Math.round(data.daily.temperature_2m_min?.[0] ?? 14);
        const precipitationProbability = data.daily.precipitation_probability_max?.[0] ?? 0;
        const precipitationSum = data.daily.precipitation_sum?.[0] ?? 0;
        const condition = getWeatherCondition(weatherCode);

        const result: DayWeatherResult = {
          status: "available",
          weather: {
            date,
            weatherCode,
            conditionPt: condition.labelPt,
            conditionEn: condition.labelEn,
            icon: condition.icon,
            maxTemp,
            minTemp,
            precipitationProbability,
            precipitationSum,
            isRainy: condition.isRainy || precipitationProbability >= 50,
            isHistorical: false,
            latitude: coords.lat,
            longitude: coords.lon,
            sourceUrl: forecastUrl,
          },
        };

        memoryCache.set(cacheKey, { expiresAt: now + CACHE_TTL_MS, result });
        return result;
      }
    }
  } catch {
    // Forecast call timed out or network error; attempt historical fallback below
  }

  // 2. Fallback to Open-Meteo Historical Archive API for out-of-range dates
  try {
    const { targetDate: histDate, refYear } = getHistoricalFallbackDate(date);
    const archiveUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=${coords.lat}&longitude=${coords.lon}&start_date=${histDate}&end_date=${histDate}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=Europe/Lisbon`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(archiveUrl, { signal: controller.signal });
    clearTimeout(timer);

    if (response.ok) {
      const data = await response.json();
      if (!data?.error && data.daily?.weather_code && data.daily.weather_code.length > 0) {
        const weatherCode = data.daily.weather_code[0] ?? 0;
        const maxTemp = Math.round(data.daily.temperature_2m_max?.[0] ?? 20);
        const minTemp = Math.round(data.daily.temperature_2m_min?.[0] ?? 14);
        const precipitationSum = data.daily.precipitation_sum?.[0] ?? 0;
        const condition = getWeatherCondition(weatherCode);

        const result: DayWeatherResult = {
          status: "available",
          weather: {
            date,
            weatherCode,
            conditionPt: condition.labelPt,
            conditionEn: condition.labelEn,
            icon: condition.icon,
            maxTemp,
            minTemp,
            precipitationSum,
            isRainy: condition.isRainy || precipitationSum > 1.0,
            isHistorical: true,
            historicalReferenceYear: refYear,
            latitude: coords.lat,
            longitude: coords.lon,
            sourceUrl: archiveUrl,
          },
        };

        memoryCache.set(cacheKey, { expiresAt: now + CACHE_TTL_MS, result });
        return result;
      }
    }
  } catch {
    // Both failed or offline
  }

  const result: DayWeatherResult = {
    status: "unavailable",
    messagePt: "Meteorologia temporariamente indisponível",
    messageEn: "Weather temporarily unavailable",
  };
  return result;
}
