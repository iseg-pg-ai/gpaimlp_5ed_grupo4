import { jsonError, noStoreHeaders } from "@/lib/api-response";
import { editWithAssistant } from "@/lib/assistant-editing";
import { validateBrief } from "@/lib/curation";
import { CatalogStore } from "@/lib/catalog-store";
import { loadPublishedCatalog } from "@/lib/published-catalog";
import type { ItineraryDay } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let brief: unknown;
  let itinerary: ItineraryDay[];
  let dayNumber: number;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    brief = body.brief;
    validateBrief(brief);
    if (!Array.isArray(body.itinerary) || body.itinerary.length > 100)
      throw new Error("Roteiro inválido.");
    itinerary = body.itinerary as ItineraryDay[];
    dayNumber = Number(body.dayNumber);
    const day = itinerary.find((item) => item.dayNumber === dayNumber);
    if (!Number.isSafeInteger(dayNumber) || !day || !/^\d{4}-\d{2}-\d{2}$/.test(day.date))
      throw new Error("Dia inválido.");
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Pedido inválido.", 400);
  }

  try {
    const catalog = await loadPublishedCatalog();
    const eligibilityItinerary = itinerary.map((day) =>
      day.dayNumber === dayNumber
        ? {
            ...day,
            dailyCapacity: Math.min(
              6,
              Math.max(
                day.dailyCapacity ?? 1,
                day.items.filter((item) => item.category !== "free_time").length + 1,
              ),
            ),
          }
        : day,
    );
    const snapshot = { brief, itinerary: eligibilityItinerary, pending: [] };
    const eligibleIds = new Set<string>();
    for (const category of ["atracoes", "restaurantes", "experiencias"] as const) {
      for (const row of catalog[category]) {
        const id = `${category}:${row._catalog_id ?? row.id ?? row.id_blu ?? row.nome_da_experiencia ?? row._source_row}`;
        const result = editWithAssistant(
          snapshot,
          `adicionar "${id}" ao dia ${dayNumber}`,
          catalog,
        );
        if (result.changed) eligibleIds.add(String(row._catalog_id));
      }
    }

    const store = new CatalogStore();
    try {
      return Response.json(
        store.list().filter((record) => eligibleIds.has(record.id)),
        { headers: noStoreHeaders },
      );
    } finally {
      store.close();
    }
  } catch (error) {
    console.error("Catalog eligibility failed", error);
    return jsonError("Não foi possível validar as opções compatíveis.", 422, noStoreHeaders);
  }
}
