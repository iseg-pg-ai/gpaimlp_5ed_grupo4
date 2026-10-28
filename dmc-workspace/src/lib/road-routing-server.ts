// Liga o itinerário ao cálculo rodoviário no servidor e atualiza os trajetos sujeitos às
// regras de edição.
import type { ItineraryDay, TransitLeg, TransitMode } from "../types/index";
import { portalRequest } from "./python-portal.ts";
import { buildCoordMap, extractCoords, type LocationCoords } from "./road-routing.ts";

const optimizeRouteSequence = (
  items: ItineraryDay["items"],
  catalogRecords?: Array<Record<string, unknown>>,
) => portalRequest<ItineraryDay["items"]>("routing-optimize", ".", { items, catalogRecords });

const realignTimeSlots = (
  items: ItineraryDay["items"],
  catalogRecords?: Array<Record<string, unknown>>,
) => portalRequest<ItineraryDay["items"]>("routing-realign", ".", { items, catalogRecords });

const recomputeDailyRouteSummary = (items: ItineraryDay["items"]) =>
  portalRequest<ItineraryDay["routeSummary"] | null>("routing-summary", ".", { items }).then(
    (summary) => summary ?? undefined,
  );

export async function calculateRoadLeg(
  from: LocationCoords,
  to: LocationCoords,
  optionsOrTimeout?:
    | number
    | { preferredMode?: TransitMode; bufferMinutes?: number; timeoutMs?: number },
  legacyTimeoutMs = 3000,
): Promise<TransitLeg> {
  const timeoutMs =
    typeof optionsOrTimeout === "number"
      ? optionsOrTimeout
      : (optionsOrTimeout?.timeoutMs ?? legacyTimeoutMs);
  return portalRequest<TransitLeg>("routing-leg", ".", {
    from,
    to,
    options: {
      preferredMode:
        typeof optionsOrTimeout === "object" ? optionsOrTimeout.preferredMode : undefined,
      bufferMinutes:
        typeof optionsOrTimeout === "object" ? optionsOrTimeout.bufferMinutes : undefined,
      timeoutMs,
    },
  });
}

// Adicionar contexto rodoviário ao itinerário sem tornar a indisponibilidade do fornecedor
// um dado confirmado.
export async function enrichItineraryWithRoadRouting(
  days: ItineraryDay[],
  catalogRecords?: Array<Record<string, unknown>>,
  options?: { optimizeSequence?: boolean },
): Promise<ItineraryDay[]> {
  const coordMap = buildCoordMap(catalogRecords);
  const enrichedDays: ItineraryDay[] = [];
  for (const day of days) {
    let items = [...day.items];
    if (options?.optimizeSequence && items.length > 2)
      items = await optimizeRouteSequence(items, catalogRecords);
    for (let index = 0; index < items.length - 1; index++) {
      const current = items[index];
      const next = items[index + 1];
      if (current.category === "free_time" || next.category === "free_time") continue;
      const leg = await calculateRoadLeg(
        extractCoords(current, coordMap),
        extractCoords(next, coordMap),
        {
          preferredMode: current.transitToNext?.mode,
          bufferMinutes: current.transitToNext?.bufferMinutes,
        },
      );
      items[index] = { ...current, transitToNext: leg };
    }
    enrichedDays.push({ ...day, items, routeSummary: await recomputeDailyRouteSummary(items) });
  }
  return enrichedDays;
}

export async function updateDayTransitLeg(
  day: ItineraryDay,
  activityId: string,
  newMode: TransitMode,
  customBufferMinutes?: number,
  catalogRecords?: Array<Record<string, unknown>>,
): Promise<ItineraryDay> {
  const coordMap = buildCoordMap(catalogRecords);
  const items = [...day.items];
  const index = items.findIndex((item) => item.id === activityId);
  if (index < 0 || index >= items.length - 1) return day;
  const current = items[index];
  items[index] = {
    ...current,
    transitToNext: await calculateRoadLeg(
      extractCoords(current, coordMap),
      extractCoords(items[index + 1], coordMap),
      { preferredMode: newMode, bufferMinutes: customBufferMinutes },
    ),
  };
  const realigned = await realignTimeSlots(items, catalogRecords);
  return {
    ...day,
    items: realigned,
    routeSummary: (await recomputeDailyRouteSummary(realigned)) ?? day.routeSummary,
  };
}

export async function optimizeDayRouteOrder(
  day: ItineraryDay,
  catalogRecords?: Array<Record<string, unknown>>,
): Promise<ItineraryDay> {
  const [enriched] = await enrichItineraryWithRoadRouting([day], catalogRecords, {
    optimizeSequence: true,
  });
  return enriched;
}
