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
        const allRecords = [...catalog.atracoes, ...catalog.experiencias, ...catalog.restaurantes];
        result.itinerary = await enrichItineraryWithRoadRouting(result.itinerary, allRecords);
      } catch (routingErr) {
        console.warn("Could not enrich assistant road routes:", routingErr);
      }
      return Response.json(result);
    }

    // Se o comando determinístico não alterou o itinerário (perguntas, linguagem natural, sugestões),
    // invocar o Agente de IA LangChain / Bedrock em http://127.0.0.1:8000
    const agentUrl = process.env.BLU_AI_AGENT_URL || "http://127.0.0.1:8000";
    try {
      console.log(`[Assistant API] Calling AI Agent at ${agentUrl} with input: "${body.input}"`);
      const agentResp = await fetch(`${agentUrl}/api/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction: body.input,
          currentItinerary: body.snapshot.itinerary,
          brief: body.snapshot.brief,
        }),
        signal: AbortSignal.timeout(20000),
      });
      console.log(`[Assistant API] AI Agent response status: ${agentResp.status}`);
      if (agentResp.ok) {
        const agentData = (await agentResp.json()) as { reply?: string };
        if (agentData?.reply) {
          console.log(`[Assistant API] Returning AI Agent reply!`);
          return Response.json({
            itinerary: body.snapshot.itinerary,
            changed: false,
            reply: agentData.reply,
          });
        }
      } else {
        console.warn(`[Assistant API] AI Agent returned error status: ${agentResp.status}`);
      }
    } catch (agentErr) {
      console.warn("[Assistant API] Agent service error:", agentErr);
    }

    return Response.json(result);
  } catch {
    return jsonError(
      "Não foi possível validar a alteração com o catálogo e as regras atuais. Nada foi alterado.",
      422,
    );
  }
}
