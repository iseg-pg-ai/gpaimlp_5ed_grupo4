// Endpoint: fornece contexto meteorológico com cache e estados explícitos de
// indisponibilidade.
import type { DayWeatherResult, WeatherOptions } from "@/lib/weather";
import { portalRequest } from "@/lib/python-portal";
import { jsonError, noStoreHeaders } from "@/lib/server-http";
import { cachedWeatherResult, storeWeatherResult } from "@/lib/weather-server-cache";
export const runtime = "nodejs";

async function respond(options: WeatherOptions) {
  if (typeof options.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(options.date))
    return jsonError("Data inválida. Use o formato AAAA-MM-DD.", 400);
  if (
    (options.location !== undefined &&
      (typeof options.location !== "string" || options.location.length > 500)) ||
    (options.items !== undefined &&
      (!Array.isArray(options.items) ||
        options.items.length > 250 ||
        options.items.some((item) => !item || typeof item !== "object")))
  )
    return jsonError("Localização inválida.", 400);
  try {
    const cached = cachedWeatherResult(options);
    const result = cached ?? (await portalRequest<DayWeatherResult>("weather", "", options));
    if (!cached) storeWeatherResult(options, result);
    return Response.json(result, {
      headers:
        result.status === "available"
          ? { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=86400" }
          : noStoreHeaders,
    });
  } catch {
    return jsonError("Meteorologia temporariamente indisponível.", 503, noStoreHeaders);
  }
}
export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  return respond({
    date: p.get("date") ?? "",
    location: p.get("location") || undefined,
    latitude: p.get("lat") ? Number(p.get("lat")) : undefined,
    longitude: p.get("lon") ? Number(p.get("lon")) : undefined,
  });
}
export async function POST(request: Request) {
  try {
    const body = await request.text();
    if (body.length > 64000) return jsonError("Pedido demasiado grande.", 413);
    const options = JSON.parse(body);
    if (!options || typeof options !== "object" || Array.isArray(options))
      return jsonError("Pedido inválido.", 400);
    return await respond(options);
  } catch {
    return jsonError("Pedido inválido.", 400);
  }
}
