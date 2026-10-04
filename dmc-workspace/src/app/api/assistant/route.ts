import { validateSnapshot } from "@/lib/snapshot-validation";
import { loadPublishedCatalog } from "@/lib/published-catalog";
import { editWithAssistant } from "@/lib/assistant-editing";
import { jsonError } from "@/lib/api-response";
import { enrichItineraryWithRoadRouting } from "@/lib/road-routing";

export const runtime = "nodejs";
export async function POST(request: Request) {
  let body;
  try {
    body = await request.json();
    validateSnapshot(body.snapshot);
    if (typeof body.input !== "string" || !body.input.trim() || body.input.length > 4000)
      throw new Error("Pedido inválido.");
  } catch {
    return jsonError("Pedido ou roteiro inválido.", 400);
  }
  try {
    const catalog = await loadPublishedCatalog();
    const result = editWithAssistant(body.snapshot, body.input, catalog);
    if (result.changed) {
      try {
        const allRecords = [
          ...catalog.atracoes,
          ...catalog.experiencias,
          ...catalog.restaurantes,
        ];
        result.itinerary = await enrichItineraryWithRoadRouting(result.itinerary, allRecords);
      } catch (routingErr) {
        console.warn("Could not enrich assistant road routes:", routingErr);
      }
    }
    return Response.json(result);
  } catch {
    return jsonError(
      "Não foi possível validar a alteração com o catálogo e as regras atuais. Nada foi alterado.",
      422,
    );
  }
}
