import { validateSnapshot } from "@/lib/snapshot-validation";
import { loadPublishedCatalog } from "@/lib/published-catalog";
import { jsonError } from "@/lib/api-response";
import { updateDayTransitLeg, optimizeDayRouteOrder } from "@/lib/road-routing";
import type { TransitMode, ItineraryDay } from "@/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body;
  try {
    body = await request.json();
    validateSnapshot(body.snapshot);
    if (typeof body.dayNumber !== "number") {
      throw new Error("Número do dia inválido.");
    }
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Pedido inválido.", 400);
  }

  try {
    const catalog = await loadPublishedCatalog();
    const allRecords = [
      ...catalog.atracoes,
      ...catalog.experiencias,
      ...catalog.restaurantes,
    ];

    const currentDay = body.snapshot.itinerary.find(
      (d: ItineraryDay) => d.dayNumber === body.dayNumber,
    );
    if (!currentDay) {
      return jsonError("Dia não encontrado no roteiro.", 404);
    }

    let updatedDay: ItineraryDay = currentDay;

    if (body.action === "update_leg") {
      if (typeof body.activityId !== "string" || !body.newMode) {
        return jsonError("Dados de deslocação incompletos.", 400);
      }
      updatedDay = await updateDayTransitLeg(
        currentDay,
        body.activityId,
        body.newMode as TransitMode,
        body.bufferMinutes,
        allRecords,
      );
    } else if (body.action === "optimize_day") {
      updatedDay = await optimizeDayRouteOrder(currentDay, allRecords);
    } else {
      return jsonError("Ação de roteamento desconhecida.", 400);
    }

    const updatedItinerary = body.snapshot.itinerary.map((d: ItineraryDay) =>
      d.dayNumber === body.dayNumber ? updatedDay : d,
    );

    return Response.json({ itinerary: updatedItinerary });
  } catch (err) {
    return jsonError(
      err instanceof Error ? err.message : "Falha ao processar o cálculo rodoviário OSRM.",
      422,
    );
  }
}
