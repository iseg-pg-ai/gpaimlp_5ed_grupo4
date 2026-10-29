// Endpoint: aplica uma edição validada sem dispensar as proteções dos itens existentes.
import { validateSnapshot } from "@/lib/snapshot-validation";
import { loadPublishedCatalog } from "@/lib/catalog-store";
import { editWithAssistant } from "@/lib/assistant-editing";
import { jsonError, noStoreHeaders, publicOrigin } from "@/lib/server-http";
import { enrichItineraryWithRoadRouting } from "@/lib/road-routing-server";

export const runtime = "nodejs";
// Controlos manuais explícitos: sem modelo, sem aceitar propostas do chat.
export async function POST(request: Request) {
  let body;
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== publicOrigin(request.url))
      return jsonError("Origem não autorizada.", 403, noStoreHeaders);
    const raw = await request.text();
    if (raw.length > 2000000) return jsonError("Pedido demasiado grande.", 413, noStoreHeaders);
    body = JSON.parse(raw);
    validateSnapshot(body.snapshot);
    if (typeof body.input !== "string" || !body.input.trim() || body.input.length > 4000)
      throw new Error();
  } catch {
    return jsonError("Pedido ou roteiro inválido.", 400, noStoreHeaders);
  }
  try {
    const catalog = await loadPublishedCatalog();
    const result = editWithAssistant(body.snapshot, body.input, catalog, "user");
    if (result.changed) {
      try {
        result.itinerary = await enrichItineraryWithRoadRouting(result.itinerary, [
          ...catalog.atracoes,
          ...catalog.experiencias,
          ...catalog.restaurantes,
        ]);
      } catch {
        console.warn("[itinerary-edit] ROUTING_UNAVAILABLE");
      }
      validateSnapshot({ ...body.snapshot, itinerary: result.itinerary });
    }
    return Response.json(result, { headers: noStoreHeaders });
  } catch {
    return jsonError(
      "Não foi possível validar a alteração com o catálogo e as regras atuais. Nada foi alterado.",
      422,
      noStoreHeaders,
    );
  }
}
