import { loadPublishedCatalog } from "@/lib/catalog-store";
import {
  plannerContext,
  simulatePlan,
  validatePlan,
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

export const runtime = "nodejs";
export async function POST(request: Request) {
  let body;
  try {
    if (
      request.headers.get("origin") &&
      request.headers.get("origin") !== publicOrigin(request.url)
    )
      return jsonError("Origem inválida.", 403);
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
      (typeof body.runId !== "string" || !["accept", "reject"].includes(body.decision))
    )
      throw new Error();
    if (!body.runId) validateSnapshot(body.snapshot);
  } catch {
    return jsonError("Pedido inválido. Guarde a viagem antes de usar o assistente.", 400);
  }
  const store = new VersionStore();
  try {
    const audit = new AgentAuditStore(store);
    if (body.runId) {
      const catalog =
        body.decision === "accept"
          ? await loadPublishedCatalog()
          : { atracoes: [], experiencias: [], restaurantes: [], curation_rules: [] };
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
    const context = plannerContext(snapshot, catalog);
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
    const { plan, ...metadata } = result;
    const runId = audit.propose(body.tripId, body.baseVersion, body.input, plan, preview, metadata);
    return Response.json(
      {
        runId,
        tripId: body.tripId,
        baseVersion: body.baseVersion,
        plan,
        before: snapshot.itinerary,
        after: preview.itinerary,
        provider: result.provider,
        modelId: result.modelId,
      },
      { headers: noStoreHeaders },
    );
  } catch (error) {
    if (error instanceof VersionConflict) return jsonError(error.message, 409, noStoreHeaders);
    if (error instanceof PortalPythonError)
      return jsonError(
        error.code === "AGENT_UNAVAILABLE"
          ? "O planeador AWS está indisponível. Nada foi alterado."
          : "O catálogo ou o adaptador Python está indisponível. Nada foi alterado.",
        503,
        noStoreHeaders,
      );
    return jsonError(
      "A proposta não passou a validação do catálogo e das regras. Nada foi alterado.",
      422,
      noStoreHeaders,
    );
  } finally {
    store.close();
  }
}
