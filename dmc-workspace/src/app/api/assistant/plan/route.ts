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
import { proposalImpact } from "@/lib/assistant-impact";
import { requestIntent, assertPlanIntent, IntentConflict } from "@/lib/assistant-intent";
import { syncOperationalState } from "@/lib/operational-s3";

export const runtime = "nodejs";
type Language = "pt" | "en";
const message = (language: Language, pt: string, en: string) => (language === "en" ? en : pt);

export async function POST(request: Request) {
  let body;
  let language: Language = "pt";
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== publicOrigin(request.url))
      return jsonError("Origem não autorizada. / Origin not allowed.", 403, noStoreHeaders);
    const raw = await request.text();
    if (raw.length > 2000000)
      return jsonError("Pedido demasiado grande. / Request too large.", 413, noStoreHeaders);
    body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    if (body.language !== undefined && !["pt", "en"].includes(body.language)) throw new Error();
    language = body.language ?? "pt";
    checkTripId(body.tripId);
    if (!Number.isSafeInteger(body.baseVersion) || body.baseVersion < 1) throw new Error();
    if (
      !body.runId &&
      (typeof body.input !== "string" || !body.input.trim() || body.input.length > 4000)
    )
      throw new Error();
    if (
      body.runId &&
      (typeof body.runId !== "string" ||
        body.runId.length > 80 ||
        !["accept", "reject", "select"].includes(body.decision))
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
    return jsonError(
      message(
        language,
        "Pedido inválido. Guarde a viagem antes de usar o assistente.",
        "Invalid request. Save the trip before using the assistant.",
      ),
      400,
      noStoreHeaders,
    );
  }
  const store = new VersionStore();
  try {
    const audit = new AgentAuditStore(store);
    if (body.runId) {
      // A versão enviada não é autoridade; a base é sempre recuperada do registo do servidor.
      const catalog =
        body.decision === "reject"
          ? { atracoes: [], experiencias: [], restaurantes: [], curation_rules: [] }
          : await loadPublishedCatalog();
      if (body.decision === "select")
        return Response.json(
          audit.selectAlternative(
            body.runId,
            body.tripId,
            body.dayNumber,
            body.itemId,
            body.catalogId,
            catalog,
            language,
          ),
          { headers: noStoreHeaders },
        );
      return Response.json(
        audit.decide(
          body.runId,
          body.tripId,
          body.decision,
          catalog,
          body.rejectionReason ?? "",
        ) ?? { rejected: true },
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
    const intent = requestIntent(body.input);
    const context = {
      ...plannerContext(snapshot, catalog),
      requestIntent: intent,
      conversation: recentConversation(body.conversation),
      conversationLanguage: language,
      currentView: "itinerary",
      pendingPlan: body.pendingRunId
        ? audit.pendingPlan(body.tripId, body.baseVersion, body.pendingRunId)
        : undefined,
    };
    type PlannerResult = {
      plan: AgentPlan;
      provider: string;
      modelId: string;
      latencyMs: number;
      inputTokens: number;
      outputTokens: number;
    };
    const result = await portalRequest<PlannerResult>("agent-plan", "", {
      instruction: body.input,
      context,
    });
    validatePlan(result.plan);
    assertPlanIntent(result.plan, intent);
    if (
      !["bedrock", "openai"].includes(result.provider) ||
      typeof result.modelId !== "string" ||
      !result.modelId ||
      result.modelId.length > 250 ||
      ![result.latencyMs, result.inputTokens, result.outputTokens].every(
        (value) => typeof value === "number" && Number.isFinite(value) && value >= 0,
      )
    )
      throw new PortalPythonError("AGENT_INVALID_RESPONSE", "Resposta inválida do planeador.");
    const preview = simulatePlan(snapshot, result.plan, catalog);
    if (result.plan.actions.some((action) => action.type === "optimize_route")) {
      const warning = message(
        language,
        "A sequência geográfica é estimada; não comprova tempos de viagem reais nem viabilidade operacional.",
        "The geographic sequence is estimated; it does not establish actual travel times or operational feasibility.",
      );
      result.plan.warnings = [warning, ...result.plan.warnings.filter((w) => w !== warning)].slice(
        0,
        10,
      );
    }
    const changedPending = snapshot.itinerary.some((day) =>
      day.items.some((item) => {
        if (item.confirmation?.status !== "pending") return false;
        const nextDay = preview.itinerary.find((d) => d.items.some((i) => i.id === item.id));
        const next = nextDay?.items.find((i) => i.id === item.id);
        return next && (nextDay?.dayNumber !== day.dayNumber || next.time !== item.time);
      }),
    );
    if (changedPending) {
      const warning = message(
        language,
        "Os dados de confirmação pendente foram preservados. Reveja-os manualmente após alterar o dia ou horário.",
        "Pending confirmation details were preserved. Review them manually after changing the day or time.",
      );
      result.plan.warnings = [warning, ...result.plan.warnings.filter((w) => w !== warning)].slice(
        0,
        10,
      );
    }
    const alternatives = resolveAlternatives(snapshot, result.plan, catalog);
    const metadata = {
      provider: result.provider,
      modelId: result.modelId,
      latencyMs: result.latencyMs,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      requestIntent: intent,
      conversationLanguage: language,
    };
    const runId = audit.propose(
      body.tripId,
      body.baseVersion,
      body.input,
      result.plan,
      preview,
      metadata,
    );
    return Response.json(
      {
        runId,
        tripId: body.tripId,
        baseVersion: body.baseVersion,
        plan: result.plan,
        alternatives,
        before: snapshot.itinerary,
        after: preview.itinerary,
        impact: proposalImpact(snapshot, preview),
        provider: result.provider,
        modelId: result.modelId,
      },
      { headers: noStoreHeaders },
    );
  } catch (error) {
    if (error instanceof IntentConflict)
      return jsonError(
        message(
          language,
          "O pedido de adição não autoriza uma substituição nem outras alterações. Nada foi alterado.",
          "An addition request does not authorize a replacement or other changes. Nothing was changed.",
        ),
        422,
        noStoreHeaders,
      );
    if (error instanceof VersionConflict)
      return jsonError(
        message(
          language,
          error.message,
          "This proposal or version is no longer available, was already decided, or has changed. Reopen the latest version and request a new preview.",
        ),
        409,
        noStoreHeaders,
      );
    if (error instanceof PortalPythonError) {
      const failure = agentFailure(error.code);
      console.warn(`[assistant] ${failure.code}`);
      return Response.json(
        {
          error: message(
            language,
            failure.message,
            "The assistant could not complete the request. Check model availability and permissions, or clarify the request. Nothing was changed.",
          ),
          code: failure.code,
        },
        { status: failure.status, headers: noStoreHeaders },
      );
    }
    return jsonError(
      message(
        language,
        "A proposta não passou a validação do catálogo, horários ou proteções. Esclareça o pedido ou ajuste-o nos controlos manuais. Nada foi alterado.",
        "The proposal did not pass catalogue, schedule or protection checks. Clarify the request or use the manual controls. Nothing was changed.",
      ),
      422,
      noStoreHeaders,
    );
  } finally {
    await syncOperationalState();
    store.close();
  }
}
