import { fetchDayWeather } from "@/lib/weather";
import { jsonError } from "@/lib/api-response";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const location = searchParams.get("location") || undefined;
  const latStr = searchParams.get("lat");
  const lonStr = searchParams.get("lon");

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return jsonError("Data inválida. Use o formato AAAA-MM-DD.", 400);
  }

  const latitude = latStr ? Number(latStr) : undefined;
  const longitude = lonStr ? Number(lonStr) : undefined;

  try {
    const result = await fetchDayWeather({
      date,
      location,
      latitude,
      longitude,
    });

    return Response.json(result, {
      headers: {
        "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Erro ao consultar a meteorologia.",
      500,
    );
  }
}
