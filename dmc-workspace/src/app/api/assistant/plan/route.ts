// Endpoint: recebe o pedido de planeamento e devolve uma proposta validada para revisão
// humana.
import { loadPublishedCatalog } from "@/lib/catalog-store";
import {
  plannerContext,
  simulatePlan,
  validatePlan,
  resolveAlternatives,
  resolveRanking,
  resolveDelivery,
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
import { AgentConversationStore } from "@/lib/agent-conversation-store";
import { authorizeAgentTool, type AgentToolName } from "@/lib/agent-tool-registry";
import {
  AgentBudgetExceeded,
  AgentRuntimeConfigurationError,
  enforceAgentRuntimePolicy,
} from "@/lib/agent-runtime-policy";
import { proposalImpact } from "@/lib/assistant-impact";
import { simulationFeedback } from "@/lib/agent-simulation-feedback";
import { requestIntent, assertPlanIntent, IntentConflict } from "@/lib/assistant-intent";
import { syncOperationalState } from "@/lib/operational-s3";
import { publicAgentConversation, publicAgentText } from "@/lib/agent-public-input";
import { cachedServerDayWeather } from "@/lib/weather-server-cache";
import { agentSupervisionSignals } from "@/lib/agent-supervision-signals";
import { FeedbackStore } from "@/lib/feedback-store";
import { HistoricalCaseStore } from "@/lib/historical-cases";
import {
  IdentityConfigurationError,
  IdentityDenied,
  IdentityRequired,
  type AuthenticatedPrincipal,
  requestPrincipal,
} from "@/lib/server-principal";

export const runtime = "nodejs";
type Language = "pt" | "en";
const message = (language: Language, pt: string, en: string) => (language === "en" ? en : pt);

export async function POST(request: Request) {
  let body;
  let language: Language = "pt";
  let principal: AuthenticatedPrincipal | null = null;
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
    if (
      body.pendingRunId !== undefined &&
      (typeof body.pendingRunId !== "string" || body.pendingRunId.length > 80)
    )
      throw new Error();
    principal = await requestPrincipal(request);
    if (!principal) recentConversation(body.conversation);
  } catch (error) {
    if (error instanceof IdentityRequired)
      return jsonError("Autenticação necessária. / Authentication required.", 401, noStoreHeaders);
    if (error instanceof IdentityDenied)
      return jsonError("Identidade inválida. / Invalid identity.", 403, noStoreHeaders);
    if (error instanceof IdentityConfigurationError)
      return jsonError("Identidade indisponível. / Identity unavailable.", 503, noStoreHeaders);
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
  try {
    if (principal) {
      const tool: AgentToolName = !body.runId
        ? "itinerary.propose"
        : body.decision === "select"
          ? "itinerary.select_alternative"
          : body.decision === "reject"
            ? "itinerary.reject"
            : "itinerary.accept";
      authorizeAgentTool(principal, tool, Boolean(body.runId));
    }
  } catch (error) {
    if (error instanceof IdentityDenied)
      return jsonError("Permissão insuficiente. / Insufficient permission.", 403, noStoreHeaders);
    throw error;
  }
  const store = new VersionStore();
  try {
    const audit = new AgentAuditStore(store);
    const feedback = new FeedbackStore(store);
    const historicalCases = new HistoricalCaseStore(feedback);
    const conversations = principal ? new AgentConversationStore(store) : null;
    const ownerId = principal?.id ?? null;
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
            ownerId,
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
          ownerId,
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
    const providerInput = publicAgentText(body.input);
    const intent = requestIntent(providerInput);
    const remembered = conversations?.get(ownerId!, body.tripId, body.baseVersion);
    const relevantIds = new Set([
      ...snapshot.itinerary.flatMap((day) => day.items.map((item) => item.id)),
      ...plannerContext(snapshot, catalog).candidates.map((candidate) => candidate.id),
    ]);
    const weatherObservations = snapshot.itinerary.flatMap((day) => {
      const weather = cachedServerDayWeather({
        date: day.date,
        location: day.location,
        items: day.items.map(({ latitude, longitude }) => ({ latitude, longitude })),
      });
      return weather
        ? [
            {
              dayNumber: day.dayNumber,
              date: day.date,
              conditionPt: weather.conditionPt,
              conditionEn: weather.conditionEn,
              maxTemp: weather.maxTemp,
              minTemp: weather.minTemp,
              precipitationProbability: weather.precipitationProbability,
              precipitationSum: weather.precipitationSum,
              isRainy: weather.isRainy,
              evidence: weather.isHistorical ? "historical_reference" : "forecast",
              historicalReferenceYear: weather.historicalReferenceYear,
            },
          ]
        : [];
    });
    const context = {
      ...plannerContext(snapshot, catalog),
      weatherObservations,
      supervisionSignals: agentSupervisionSignals(
        snapshot,
        catalog,
        weatherObservations,
        providerInput,
      ),
      qualitySignals: feedback
        .qualitySignals()
        .filter((signal) => relevantIds.has(signal.catalogId)),
      historicalCases: historicalCases.search({
        destination: snapshot.brief.destination,
        proposalTier: snapshot.brief.proposalTier,
        pace: snapshot.brief.pace,
        adults: snapshot.brief.adults,
        children: snapshot.brief.children,
        interests: snapshot.brief.interests,
        limit: 5,
      }),
      requestIntent: intent,
      conversation: publicAgentConversation(
        remembered?.turns ?? recentConversation(body.conversation),
      ),
      conversationSummary: remembered?.summary || undefined,
      conversationLanguage: language,
      currentView: "itinerary",
      pendingPlan: body.pendingRunId
        ? audit.pendingPlan(body.tripId, body.baseVersion, body.pendingRunId, ownerId)
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
    const requestBytes = Buffer.byteLength(
      JSON.stringify({ instruction: providerInput, context }),
      "utf8",
    );
    const plannerPayload = {
      instruction: providerInput,
      context,
    };
    // Comandos inequívocos são compilados localmente antes de reservar custo.
    // Apenas linguagem que exige interpretação chega ao fornecedor externo.
    let result = await portalRequest<PlannerResult | null>("agent-compile", "", plannerPayload);
    if (!result) {
      // Reserva no máximo duas chamadas: proposta inicial e uma única correção
      // após falha determinística sanitizada.
      enforceAgentRuntimePolicy(audit, requestBytes, 2);
      result = await portalRequest<PlannerResult>("agent-plan", "", plannerPayload);
    }
    const validateResult = (value: PlannerResult) => {
      validatePlan(value.plan);
      assertPlanIntent(value.plan, intent);
      if (
        !["bedrock", "deterministic"].includes(value.provider) ||
        typeof value.modelId !== "string" ||
        !value.modelId ||
        value.modelId.length > 250 ||
        ![value.latencyMs, value.inputTokens, value.outputTokens].every(
          (metric) => typeof metric === "number" && Number.isFinite(metric) && metric >= 0,
        )
      )
        throw new PortalPythonError("AGENT_INVALID_RESPONSE", "Resposta inválida do planeador.");
    };
    validateResult(result);
    let preview;
    let alternatives;
    let rankedCandidates;
    let deliveryPreview;
    try {
      preview = simulatePlan(snapshot, result.plan, catalog);
      alternatives = resolveAlternatives(snapshot, result.plan, catalog);
      rankedCandidates = resolveRanking(snapshot, result.plan, catalog);
      deliveryPreview = resolveDelivery(snapshot, result.plan, catalog);
    } catch (error) {
      const corrected = await portalRequest<PlannerResult>("agent-plan", "", {
        instruction: providerInput,
        context: { ...context, simulationFeedback: simulationFeedback(error) },
      });
      validateResult(corrected);
      if (corrected.provider !== result.provider || corrected.modelId !== result.modelId)
        throw new PortalPythonError("AGENT_INVALID_RESPONSE", "Fornecedor mudou durante o pedido.");
      preview = simulatePlan(snapshot, corrected.plan, catalog);
      alternatives = resolveAlternatives(snapshot, corrected.plan, catalog);
      rankedCandidates = resolveRanking(snapshot, corrected.plan, catalog);
      deliveryPreview = resolveDelivery(snapshot, corrected.plan, catalog);
      result = {
        ...corrected,
        latencyMs: result.latencyMs + corrected.latencyMs,
        inputTokens: result.inputTokens + corrected.inputTokens,
        outputTokens: result.outputTokens + corrected.outputTokens,
      };
    }
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
      ownerId,
    );
    if (conversations) {
      try {
        conversations.append(ownerId!, body.tripId, body.baseVersion, "user", body.input);
        conversations.append(
          ownerId!,
          body.tripId,
          body.baseVersion,
          "assistant",
          result.plan.summary,
        );
      } catch {
        console.warn("[assistant] AGENT_MEMORY_UNAVAILABLE");
      }
    }
    return Response.json(
      {
        runId,
        tripId: body.tripId,
        baseVersion: body.baseVersion,
        plan: result.plan,
        alternatives,
        rankedCandidates,
        deliveryPreview,
        before: snapshot.itinerary,
        after: preview.itinerary,
        impact: proposalImpact(snapshot, preview),
        provider: result.provider,
        modelId: result.modelId,
      },
      { headers: noStoreHeaders },
    );
  } catch (error) {
    if (error instanceof AgentBudgetExceeded)
      return jsonError(
        message(
          language,
          "O orçamento mensal do assistente foi atingido. Nada foi alterado.",
          "The assistant monthly budget has been reached. Nothing was changed.",
        ),
        429,
        noStoreHeaders,
      );
    if (error instanceof AgentRuntimeConfigurationError)
      return jsonError(
        message(
          language,
          "A política operacional do assistente está incompleta. Nada foi alterado.",
          "The assistant operational policy is incomplete. Nothing was changed.",
        ),
        503,
        noStoreHeaders,
      );
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
    console.error(
      "[assistant] AGENT_PLAN_VALIDATION_FAILED",
      error instanceof Error ? `${error.name}: ${error.message}` : "Unknown error",
    );
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
