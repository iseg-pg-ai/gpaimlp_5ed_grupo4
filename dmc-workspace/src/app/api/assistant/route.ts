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
    let result;
    try {
      result = editWithAssistant(body.snapshot, body.input, catalog);
    } catch (editErr) {
      const agentUrl = process.env.BLU_AI_AGENT_URL || "http://127.0.0.1:8000";
      try {
        const agentResp = await fetch(`${agentUrl}/api/agent/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            instruction: body.input,
            currentItinerary: body.snapshot.itinerary,
            brief: body.snapshot.brief,
          }),
          signal: AbortSignal.timeout(8000),
        });
        if (agentResp.ok) {
          const agentData = (await agentResp.json()) as { reply?: string };
          if (agentData?.reply) {
            return Response.json({
              itinerary: body.snapshot.itinerary,
              changed: false,
              reply: agentData.reply,
            });
          }
        }
      } catch {
        // Agent service unreachable or timed out; rethrow to preserve standard fallback
      }
      throw editErr;
    }

    if (result.changed) {
      try {
        const allRecords = [...catalog.atracoes, ...catalog.experiencias, ...catalog.restaurantes];
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
