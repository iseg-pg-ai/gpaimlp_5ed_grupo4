import { loadPublishedCatalog } from "@/lib/catalog-store";
import {
  plannerContext,
  simulatePlan,
  validatePlan,
  resolveAlternatives,
  type AgentPlan,
} from "@/lib/assistant-actions";
import { AgentAuditStore } from "@/lib/agent-audit-store";
import {
  VersionStore,
  VersionConflict,
  snapshotFingerprint,
  checkTripId,
} from "@/lib/version-store";
import { portalRequest, PortalPythonError } from "@/lib/python-portal";
import { jsonError, noStoreHeaders, publicOrigin } from "@/lib/server-http";
import { validateSnapshot } from "@/lib/snapshot-validation";
import { agentFailure } from "@/lib/agent-errors";
import { recentConversation } from "@/lib/assistant-conversation";

export const runtime = "nodejs";
export async function POST(request: Request) {
  let body;
  try {
    if (
      request.headers.get("origin") &&
      request.headers.get("origin") !== publicOrigin(request.url)
    )
      return jsonError(
        "A ligação usada para abrir o portal não corresponde à configuração do servidor. Reabra o portal pela ligação configurada.",
        403,
      );
    const raw = await request.text();
    if (raw.length > 2000000) return jsonError("Pedido demasiado grande.", 413);
    body = JSON.parse(raw);
    checkTripId(body.tripId);
    if (!Number.isSafeInteger(body.baseVersion) || body.baseVersion < 1) throw new Error();
    if (
      !body.runId &&
      (typeof body.input !== "string" || !body.input.trim() || body.input.length > 4000)
    )
      throw new Error();
    if (
      body.runId &&
      (typeof body.runId !== "string" || !["accept", "reject", "select"].includes(body.decision))
    )
      throw new Error();
    if (
      body.decision === "select" &&
      (!Number.isSafeInteger(body.dayNumber) ||
        body.dayNumber < 1 ||
        typeof body.itemId !== "string" ||
        body.itemId.length > 300 ||
        typeof body.catalogId !== "string" ||
        body.catalogId.length > 300)
    )
      throw new Error();
    if (!body.runId) validateSnapshot(body.snapshot);
    recentConversation(body.conversation);
    if (
      body.pendingRunId !== undefined &&
      (typeof body.pendingRunId !== "string" || body.pendingRunId.length > 80)
    )
      throw new Error();
  } catch {
    return jsonError("Pedido inválido. Guarde a viagem antes de usar o assistente.", 400);
  }
  const store = new VersionStore();
  try {
    const audit = new AgentAuditStore(store);
    if (body.runId) {
      const catalog =
        body.decision !== "reject"
          ? await loadPublishedCatalog()
          : { atracoes: [], experiencias: [], restaurantes: [], curation_rules: [] };
      if (body.decision === "select")
        return Response.json(
          audit.selectAlternative(
            body.runId,
            body.tripId,
            body.dayNumber,
            body.itemId,
            body.catalogId,
            catalog,
          ),
          { headers: noStoreHeaders },
        );
      return Response.json(
        audit.decide(body.runId, body.tripId, body.decision, catalog) ?? { rejected: true },
        { headers: noStoreHeaders },
      );
    }
    const snapshot = audit.base(body.tripId, body.baseVersion);
    if (
      snapshotFingerprint(snapshot) !==
      snapshotFingerprint({
        brief: body.snapshot.brief,
        itinerary: body.snapshot.itinerary,
        pending: body.snapshot.pending,
      })
    )
      throw new VersionConflict(
        "Há alterações locais por guardar. Guarde ou reabra a versão antes de pedir uma proposta.",
      );
    const catalog = await loadPublishedCatalog();
    const context = {
      ...plannerContext(snapshot, catalog),
      conversation: recentConversation(body.conversation),
      pendingPlan: body.pendingRunId
        ? audit.pendingPlan(body.tripId, body.baseVersion, body.pendingRunId)
        : undefined,
    };
    const result = await portalRequest<{
      plan: AgentPlan;
      provider: string;
      modelId: string;
      latencyMs: number;
      inputTokens: number;
      outputTokens: number;
    }>("agent-plan", "", { instruction: body.input, context });
    validatePlan(result.plan);
    const preview = simulatePlan(snapshot, result.plan, catalog);
    const alternatives = resolveAlternatives(snapshot, result.plan, catalog);
    const { plan, ...metadata } = result;
    const runId = audit.propose(body.tripId, body.baseVersion, body.input, plan, preview, metadata);
    return Response.json(
      {
        runId,
        tripId: body.tripId,
        baseVersion: body.baseVersion,
        plan,
        alternatives,
        before: snapshot.itinerary,
        after: preview.itinerary,
        provider: result.provider,
        modelId: result.modelId,
      },
      { headers: noStoreHeaders },
    );
  } catch (error) {
    if (error instanceof VersionConflict) return jsonError(error.message, 409, noStoreHeaders);
    if (error instanceof PortalPythonError) {
      const failure = agentFailure(error.code);
      // Apenas um código controlado, sem input, contexto ou exceção do SDK.
      console.warn(`[assistant] ${failure.code}`);
      return Response.json(
        { error: failure.message, code: failure.code },
        { status: failure.status, headers: noStoreHeaders },
      );
    }
    return jsonError(
      "A proposta não passou a validação do catálogo e das regras. Nada foi alterado.",
      422,
      noStoreHeaders,
    );
  } finally {
    store.close();
  }
}
