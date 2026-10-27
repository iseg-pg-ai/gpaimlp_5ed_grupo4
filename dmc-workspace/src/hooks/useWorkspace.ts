"use client";
import { portalFetch, responseJson } from "@/lib/http-client";
import { useEffect, useRef, useState } from "react";
import type { Locale } from "@/lib/locales";
import type { CustomerBrief, ItineraryDay, ChatMessage, RecentTrip, TransitMode } from "@/types";
import { initialBrief } from "@/data/initialBrief";
import { assistantHelp } from "@/lib/assistant-editing";
import type { AgentProposal } from "@/lib/assistant-actions";

import { canonicalSnapshot, validateSnapshot } from "@/lib/snapshot-validation";

import type { Snapshot } from "@/lib/itinerary-pdf";
import {
  AUTO_TRASH_STORAGE,
  TRASH_STORAGE,
  TRIPS_STORAGE,
  moveCompletedTripsToTrash,
  moveTripToTrash,
  readTripTrash,
  type StoredTrip,
} from "@/lib/trip-trash";
import { runScheduledTrashCleanup } from "@/lib/scheduled-trash-cleanup";

type ChatLanguage = "pt" | "en";
type Trip = StoredTrip & { assistantLanguage?: ChatLanguage };
type HistoryVersion = {
  version: number;
  filename: string;
  createdAt: string;
  exportedAt?: string | null;
};
const STORAGE = TRIPS_STORAGE;
const emptyBrief = (): CustomerBrief => ({
  ...initialBrief,
  customerName: "",
  destination: "",
  startDate: "",
  endDate: "",
  arrivalLocation: "",
  arrivalTime: "",
  arrivalFlightNumber: "",
  departureLocation: "",
  departureTime: "",
  departureFlightNumber: "",
  interests: [],
  mobilityRestrictions: [],
  dietaryRestrictions: [],
  exclusions: [],
  specialOccasion: "",
  notes: "",
  childrenAges: "",
});
const message = (
  sender: ChatMessage["sender"],
  text: string,
  language: ChatLanguage = "pt",
): ChatMessage => ({
  language,
  id: crypto.randomUUID(),
  sender,
  text,
  timestamp: new Date().toLocaleTimeString(),
});
export function useWorkspace() {
  const [clientLanguage, setClientLanguage] = useState<Locale>("en");
  const [trips, setTrips] = useState<Trip[]>([]);
  const [activeId, setActiveId] = useState("");
  const [exportedVersions, setExportedVersions] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState(true);
  const [draft, setDraft] = useState<CustomerBrief>(emptyBrief);
  const [formKey, setFormKey] = useState(0);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [reopenedVersion, setReopenedVersion] = useState<number | null>(null);
  const [assistantBusy, setAssistantBusy] = useState(false);
  const [agentProposal, setAgentProposal] = useState<AgentProposal | null>(null);
  const operation = useRef(false);
  const cleanupStarted = useRef(false);
  const [history, setHistory] = useState<{ id: string; versions: HistoryVersion[] }>({
    id: "",
    versions: [],
  });
  const [error, setError] = useState("");
  const [storageError, setStorageError] = useState("");
  const active = trips.find((t) => t.id === activeId);
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        const raw = localStorage.getItem(STORAGE);
        if (raw) {
          const saved: Trip[] = JSON.parse(raw);
          if (!Array.isArray(saved)) throw new Error();
          for (const t of saved) {
            validateSnapshot(t);
            if (
              typeof t.id !== "string" ||
              !Array.isArray(t.itinerary) ||
              !Array.isArray(t.pending) ||
              !Array.isArray(t.messages)
            )
              throw new Error();
          }
          setTrips(saved);
        }
        setReady(true);
      } catch {
        setStorageError(
          "Não foi possível ler as viagens guardadas. Os dados existentes não serão substituídos; exporte ou recupere o armazenamento do navegador antes de continuar.",
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (!ready || localStorage.getItem(AUTO_TRASH_STORAGE) !== "true") return;
    try {
      const trash = readTripTrash(localStorage.getItem(TRASH_STORAGE));
      const today = new Date().toLocaleDateString("sv-SE");
      const moved = moveCompletedTripsToTrash(trips, trash, today);
      if (moved.trips.length === trips.length) return;
      localStorage.setItem(TRASH_STORAGE, JSON.stringify(moved.trash));
      queueMicrotask(() => {
        setTrips(moved.trips);
        if (moved.trash.some((entry) => entry.trip.id === activeId)) {
          setActiveId("");
          setEditing(true);
        }
      });
    } catch {
      queueMicrotask(() =>
        setStorageError("Não foi possível aplicar a remoção automática das viagens terminadas."),
      );
    }
  }, [ready, trips, activeId]);
  useEffect(() => {
    if (!ready || cleanupStarted.current) return;
    cleanupStarted.current = true;
    runScheduledTrashCleanup().catch(() =>
      setStorageError(
        "A limpeza automática do Lixo não foi concluída. Os elementos foram preservados para nova tentativa.",
      ),
    );
  }, [ready]);
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORAGE, JSON.stringify(trips));
      queueMicrotask(() => setStorageError(""));
    } catch {
      queueMicrotask(() =>
        setStorageError(
          "Não foi possível guardar no navegador. Mantenha esta página aberta para não perder as alterações.",
        ),
      );
    }
  }, [trips, ready]);
  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    portalFetch(`/api/versions?tripId=${encodeURIComponent(activeId)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Não foi possível carregar o histórico.");
        return response.json();
      })
      .then((versions) => {
        if (!cancelled) setHistory({ id: activeId, versions });
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [activeId, active?.version]);
  const saveVersion = async (trip: Trip, reason: string) => {
    const response = await portalFetch("/api/versions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tripId: trip.id,
        baseVersion: trip.version ?? null,
        reason,
        snapshot: { brief: trip.brief, itinerary: trip.itinerary, pending: trip.pending },
      }),
    });
    if (!response.ok) {
      if (response.status === 409) {
        const historyResponse = await portalFetch(
          `/api/versions?tripId=${encodeURIComponent(trip.id)}`,
        );
        if (historyResponse.ok) setHistory({ id: trip.id, versions: await historyResponse.json() });
      }
      await responseJson(response);
    }
    const result = await responseJson<{
      version?: number;
      queued?: boolean;
      expectedVersion?: number;
    }>(response);
    if (result.queued) {
      if (!Number.isSafeInteger(result.expectedVersion) || result.expectedVersion! < 1)
        throw new Error("Confirmação temporária inválida recebida do servidor.");
      setStorageError(
        "A base operacional está temporariamente indisponível. A alteração ficou protegida na fila persistente e será sincronizada automaticamente.",
      );
      return { ...trip, version: result.expectedVersion };
    }
    const savedVersion = result.version;
    if (!Number.isSafeInteger(savedVersion) || savedVersion === undefined || savedVersion < 1)
      throw new Error("Versão inválida recebida do servidor.");
    return { ...trip, version: savedVersion };
  };
  const update = async (fn: (trip: Trip) => Trip | Promise<Trip>) => {
    if (!active || operation.current) return false;
    operation.current = true;
    setSaving(true);
    setError("");
    try {
      const changed = await saveVersion(await fn(active), "edited");
      setReopenedVersion(null);
      setAgentProposal(null);
      setTrips((prev) => prev.map((t) => (t.id === changed.id ? changed : t)));
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível guardar a alteração.");
      return false;
    } finally {
      operation.current = false;
      setSaving(false);
    }
  };
  const exportProposal = async (format: "bundle" | "prompt", selectedLocale?: Locale) => {
    if (!active || operation.current) return;
    operation.current = true;
    setExporting(true);
    setError("");
    try {
      const saved = await saveVersion(active, "export");
      setTrips((prev) => prev.map((t) => (t.id === saved.id ? saved : t)));
      const response = await portalFetch(
        `/api/versions?tripId=${encodeURIComponent(saved.id)}&version=${saved.version}&format=${format}&locale=${selectedLocale ?? active.clientLanguage ?? clientLanguage}`,
      );
      if (!response.ok) await responseJson(response);
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download =
        response.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ??
        (format === "prompt" ? "roteiro-prompt.txt" : "roteiro.zip");
      document.body.appendChild(link);
      link.click();
      link.remove();
      if (format === "bundle")
        setExportedVersions((prev) => ({ ...prev, [`${saved.id}:${saved.version}`]: true }));
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na exportação.");
    } finally {
      operation.current = false;
      setExporting(false);
    }
  };
  const exportPdf = () => exportProposal("bundle");
  const exportPrompt = () => exportProposal("prompt");
  const exportPrepared = (format: "bundle" | "prompt", locale: Locale) =>
    exportProposal(format, locale);
  const reopenLatest = async () => {
    if (!active || operation.current) return;
    operation.current = true;
    setSaving(true);
    setReopening(true);
    setReopenedVersion(null);
    setError("");
    try {
      // Consultar o servidor no clique: o histórico local pode estar vazio ou desatualizado.
      const versions = await responseJson<HistoryVersion[]>(
        await portalFetch(`/api/versions?tripId=${encodeURIComponent(activeId)}`),
      );
      if (
        !Array.isArray(versions) ||
        versions.some((v) => !Number.isSafeInteger(v?.version) || v.version < 1)
      )
        throw new Error("Histórico inválido recebido do servidor.");
      setHistory({ id: activeId, versions });
      const latest = versions.reduce<HistoryVersion | undefined>(
        (current, version) => (!current || version.version > current.version ? version : current),
        undefined,
      );
      if (!latest) throw new Error("Ainda não existem versões guardadas.");
      const response = await portalFetch(
        `/api/versions?tripId=${encodeURIComponent(activeId)}&version=${latest.version}`,
      );
      if (!response.ok) throw new Error("Não foi possível reabrir a versão.");
      const result = await responseJson<{ snapshot: Snapshot; meta: { version: number } }>(
        response,
      );
      validateSnapshot(result?.snapshot);
      if (result?.meta?.version !== latest.version)
        throw new Error("Versão inválida recebida do servidor.");
      const restored = {
        ...active,
        brief: result.snapshot.brief,
        itinerary: result.snapshot.itinerary,
        pending: result.snapshot.pending,
        version: result.meta.version,
      };
      setTrips((prev) => prev.map((t) => (t.id === restored.id ? restored : t)));
      setAgentProposal(null);
      setReopenedVersion(result.meta.version);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao reabrir.");
    } finally {
      operation.current = false;
      setReopening(false);
      setSaving(false);
    }
  };
  const trashVersion = async (version: number) => {
    if (!activeId || operation.current) return;
    setSaving(true);
    setError("");
    try {
      const response = await portalFetch("/api/versions/trash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId: activeId, version, action: "trash" }),
      });
      if (!response.ok) await responseJson(response);
      setHistory((current) => ({
        ...current,
        versions: current.versions.filter((item) => item.version !== version),
      }));
    } catch (versionError) {
      setError(
        versionError instanceof Error
          ? versionError.message
          : "Não foi possível enviar a versão para o Lixo.",
      );
    } finally {
      setSaving(false);
    }
  };
  const generate = async (brief: CustomerBrief) => {
    if (busy || operation.current) return;
    setError("");
    if (
      active?.itinerary.some((d) =>
        d.items.some((i) => i.isLocked || i.confirmation?.status === "confirmed"),
      )
    ) {
      setError(
        "Existem atividades protegidas ou confirmadas. Desproteja-as e reabra as confirmações antes de regenerar a proposta; a viagem atual foi preservada.",
      );
      return;
    }
    setDraft(brief);
    setBusy(true);
    operation.current = true;
    try {
      const response = await portalFetch("/api/itineraries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(brief),
      });
      const result = await responseJson<Snapshot>(response);
      validateSnapshot({ ...result, brief });
      const trip: Trip = {
        assistantLanguage: active?.assistantLanguage ?? "pt",
        clientLanguage: active?.clientLanguage ?? clientLanguage,
        version: active?.version,
        id: activeId || crypto.randomUUID(),
        brief,
        itinerary: result.itinerary,
        pending: result.pending,
        messages: [
          message(
            "assistant",
            active?.assistantLanguage === "en"
              ? "Describe the itinerary change you would like. I will preview the proposal before you accept it. Use the manual controls for briefing and confirmations."
              : assistantHelp,
            active?.assistantLanguage ?? "pt",
          ),
        ],
      };
      const saved = await saveVersion(trip, "generated");
      setTrips((prev) => [...prev.filter((t) => t.id !== saved.id), saved]);
      setActiveId(trip.id);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na geração. Tente novamente.");
    } finally {
      setBusy(false);
      operation.current = false;
    }
  };
  const appendAssistantMessage = (tripId: string, text: string, language: ChatLanguage) =>
    setTrips((previous) =>
      previous.map((trip) =>
        trip.id === tripId
          ? { ...trip, messages: [...trip.messages, message("assistant", text, language)] }
          : trip,
      ),
    );

  const validateAgentProposal = (result: AgentProposal, trip: Trip) => {
    if (
      !result ||
      result.tripId !== trip.id ||
      result.baseVersion !== trip.version ||
      typeof result.runId !== "string" ||
      !result.runId ||
      !result.plan ||
      !Array.isArray(result.plan.actions) ||
      typeof result.plan.summary !== "string" ||
      !Array.isArray(result.plan.warnings) ||
      result.plan.warnings.some((warning) => typeof warning !== "string") ||
      result.plan.requiresConfirmation !== true ||
      canonicalSnapshot(result.before) !== canonicalSnapshot(trip.itinerary)
    )
      throw new Error(
        trip.assistantLanguage === "en"
          ? "The proposal is invalid or outdated. Request a new proposal."
          : "Proposta inválida ou desatualizada. Peça uma nova proposta.",
      );
    validateSnapshot({ brief: trip.brief, itinerary: result.after, pending: trip.pending });
  };

  const send = async (rawInput: string) => {
    const input = rawInput.trim();
    if (!active || !input || operation.current) return false;
    const language = active.assistantLanguage ?? "pt";
    const say = (pt: string, en: string) => (language === "en" ? en : pt);
    operation.current = true;
    setAssistantBusy(true);
    setError("");
    setTrips((previous) =>
      previous.map((trip) =>
        trip.id === active.id
          ? { ...trip, messages: [...trip.messages, message("user", input, language)] }
          : trip,
      ),
    );
    try {
      if (
        /^(ok|okay|yes|confirm|confirmed|accept|go ahead|apply|sim|confirmo|aceito|podes aplicar)[.!?]*$/i.test(
          input,
        )
      ) {
        const pending =
          agentProposal?.tripId === active.id && agentProposal.baseVersion === active.version;
        appendAssistantMessage(
          active.id,
          pending && agentProposal.plan.actions.length
            ? say(
                "Para aplicar a proposta pendente, use «Aceitar e guardar versão». Escrever «ok» não altera o roteiro.",
                "To apply the pending proposal, use the Accept and save version button. Writing 'ok' does not change the itinerary.",
              )
            : say(
                "Não há alterações pendentes para aceitar. Indique a alteração concreta que pretende.",
                "There are no pending changes to accept. Describe the change you would like.",
              ),
          language,
        );
        return true;
      }
      const pendingRunId =
        agentProposal?.tripId === active.id && agentProposal.baseVersion === active.version
          ? agentProposal.runId
          : undefined;
      setAgentProposal(null);
      if (/^(ajuda|help)[.!?]*$/i.test(input)) {
        appendAssistantMessage(
          active.id,
          say(
            assistantHelp +
              " Os pedidos ao agente apresentam uma pré-visualização antes da aceitação. Briefing, catálogo e confirmações usam os controlos manuais.",
            "Ask me to add, replace, remove, reschedule or move activities, reorder a day, reserve free time, change daily capacity, optimize a route or regenerate one day. I will preview changes before you accept them. Use the manual controls to edit the brief, catalogue or booking confirmations.",
          ),
          language,
        );
        return true;
      }
      if (!active.version)
        throw new Error(
          say(
            "Guarde a viagem antes de usar o assistente.",
            "Save the journey before using the assistant.",
          ),
        );
      const response = await portalFetch("/api/assistant/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tripId: active.id,
          baseVersion: active.version,
          input,
          snapshot: { brief: active.brief, itinerary: active.itinerary, pending: active.pending },
          conversation: active.messages
            .slice(-8)
            .map(({ sender, text }) => ({ sender, text: text.slice(0, 1000) })),
          pendingRunId,
          language,
        }),
      });
      const result = await responseJson<AgentProposal>(response);
      validateAgentProposal(result, active);
      setAgentProposal(
        result.plan.actions.length ||
          result.alternatives?.length ||
          result.rankedCandidates?.length ||
          result.deliveryPreview
          ? result
          : null,
      );
      appendAssistantMessage(
        active.id,
        result.plan.summary +
          (result.plan.warnings.length ? "\n" + result.plan.warnings.join("\n") : "") +
          "\n\n" +
          (result.plan.actions.length
            ? say(
                "Reveja a pré-visualização e escolha aceitar ou rejeitar. O roteiro ainda não foi alterado.",
                "Review the preview and choose accept or reject. The itinerary has not changed yet.",
              )
            : result.rankedCandidates?.length
              ? say(
                  "Escolha um candidato para pré-visualizar a adição. O roteiro permanece igual.",
                  "Choose a candidate to preview the addition. The itinerary remains unchanged.",
                )
              : result.alternatives?.length
                ? say(
                    "Escolha uma alternativa para preparar a substituição. O roteiro permanece igual.",
                    "Choose an alternative to preview its replacement. The itinerary remains unchanged.",
                  )
                : result.deliveryPreview
                  ? say(
                      "Reveja o diagnóstico e confirme a criação ou abra o formulário de partilha. Nada foi enviado.",
                      "Review the diagnostics and confirm creation or open the sharing form. Nothing was sent.",
                    )
                  : say(
                      "Esta resposta não contém alterações para aceitar. O roteiro permanece igual.",
                      "This response contains no changes to accept. The itinerary remains unchanged.",
                    )),
        language,
      );
      return true;
    } catch (error) {
      const reason =
        error instanceof Error
          ? error.message
          : say("Não foi possível preparar a proposta.", "The proposal could not be prepared.");
      setError(reason);
      appendAssistantMessage(active.id, reason, language);
      return false;
    } finally {
      operation.current = false;
      setAssistantBusy(false);
    }
  };

  const selectAgentAlternative = async (dayNumber: number, itemId: string, catalogId: string) => {
    if (!active || !agentProposal || operation.current) return;
    const language = active.assistantLanguage ?? "pt";
    operation.current = true;
    setAssistantBusy(true);
    setError("");
    try {
      validateAgentProposal(agentProposal, active);
      const response = await portalFetch("/api/assistant/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tripId: active.id,
          baseVersion: active.version,
          runId: agentProposal.runId,
          decision: "select",
          dayNumber,
          itemId,
          catalogId,
          language,
        }),
      });
      if (response.status === 409 || response.status === 410) setAgentProposal(null);
      const result = await responseJson<AgentProposal>(response);
      validateAgentProposal(result, active);
      setAgentProposal(result);
      appendAssistantMessage(active.id, result.plan.summary, language);
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : "Não foi possível preparar a alternativa.";
      setError(reason);
      appendAssistantMessage(active.id, reason, language);
    } finally {
      operation.current = false;
      setAssistantBusy(false);
    }
  };

  const decideAgentProposal = async (decision: "accept" | "reject") => {
    if (!active || !agentProposal || operation.current) return;
    const language = active.assistantLanguage ?? "pt";
    operation.current = true;
    setAssistantBusy(true);
    setError("");
    try {
      validateAgentProposal(agentProposal, active);
      const response = await portalFetch("/api/assistant/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tripId: active.id,
          baseVersion: active.version,
          runId: agentProposal.runId,
          decision,
          language,
        }),
      });
      if (response.status === 409 || response.status === 410) setAgentProposal(null);
      const result = await responseJson<{ snapshot?: Snapshot; version?: number }>(response);
      if (decision === "accept") {
        validateSnapshot(result.snapshot);
        if (!Number.isSafeInteger(result.version) || result.version! < active.version!)
          throw new Error(
            language === "en"
              ? "The server returned an invalid version."
              : "Versão inválida recebida do servidor.",
          );
        setTrips((previous) =>
          previous.map((trip) =>
            trip.id === active.id
              ? {
                  ...trip,
                  ...result.snapshot!,
                  version: result.version,
                  messages: [
                    ...trip.messages,
                    message(
                      "assistant",
                      language === "en"
                        ? "Proposal accepted and saved in the journey history."
                        : "Proposta aceite e guardada no histórico da viagem.",
                      language,
                    ),
                  ],
                }
              : trip,
          ),
        );
      } else {
        appendAssistantMessage(
          active.id,
          language === "en"
            ? "Proposal rejected. The itinerary remains unchanged."
            : "Proposta rejeitada. O roteiro foi preservado.",
          language,
        );
      }
      setAgentProposal(null);
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : "Não foi possível confirmar a proposta.";
      setError(reason);
      appendAssistantMessage(active.id, reason, language);
    } finally {
      operation.current = false;
      setAssistantBusy(false);
    }
  };

  const changeAssistantLanguage = (language: ChatLanguage) => {
    if (!active || operation.current) return;
    setTrips((previous) =>
      previous.map((trip) =>
        trip.id === active.id ? { ...trip, assistantLanguage: language } : trip,
      ),
    );
  };
  const recent: RecentTrip[] = trips.map((t) => ({
    id: t.id,
    name: t.brief.customerName,
    destination: t.brief.destination,
    dates: `${t.brief.startDate} – ${t.brief.endDate}`,
    budget: `${t.brief.budget} ${t.brief.currency}`,
    tier: t.brief.proposalTier,
    status: "Draft",
  }));

  const startNewTrip = () => {
    if (busy || operation.current) return;
    setActiveId("");
    setDraft(emptyBrief());
    setEditing(true);
    setFormKey((k) => k + 1);
    setError("");
  };
  const selectTrip = (id: string) => {
    if (busy || operation.current) return;
    setActiveId(id);
    setReopenedVersion(null);
    setEditing(false);
    setError("");
  };
  const trashTrip = (id: string) => {
    if (busy || operation.current) return;
    try {
      const trash = readTripTrash(localStorage.getItem(TRASH_STORAGE));
      const moved = moveTripToTrash(trips, trash, id, "manual");
      if (moved.trips.length === trips.length) return;
      localStorage.setItem(TRASH_STORAGE, JSON.stringify(moved.trash));
      setTrips(moved.trips);
      if (activeId === id) {
        setActiveId("");
        setDraft(emptyBrief());
        setEditing(true);
        setFormKey((key) => key + 1);
      }
      setError("");
    } catch {
      setStorageError("Não foi possível enviar a viagem para o Lixo.");
    }
  };
  const editBrief = () => {
    if (!active || operation.current) return;
    setDraft(active.brief);
    setEditing(true);
    setFormKey((k) => k + 1);
  };
  const changeClientLanguage = (language: Locale) => {
    setClientLanguage(language);
    setTrips((prev) =>
      prev.map((t) => (t.id === activeId ? { ...t, clientLanguage: language } : t)),
    );
  };

  const updateTransitLegMode = (
    dayNumber: number,
    activityId: string,
    newMode: TransitMode,
    bufferMinutes?: number,
  ) =>
    update(async (trip) => {
      const response = await portalFetch("/api/routing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_leg",
          snapshot: trip,
          dayNumber,
          activityId,
          newMode,
          bufferMinutes,
        }),
      });
      if (!response.ok) {
        const err = await responseJson<{ error?: string }>(response).catch(() => null);
        throw new Error(err?.error || "Não foi possível atualizar a modalidade de deslocação.");
      }
      const result = await responseJson<{ itinerary: ItineraryDay[] }>(response);
      validateSnapshot({ ...trip, itinerary: result.itinerary });
      return {
        ...trip,
        itinerary: result.itinerary,
      };
    });

  const optimizeDayRoute = (dayNumber: number) =>
    update(async (trip) => {
      const response = await portalFetch("/api/routing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "optimize_day",
          snapshot: trip,
          dayNumber,
        }),
      });
      if (!response.ok) {
        const err = await responseJson<{ error?: string }>(response).catch(() => null);
        throw new Error(err?.error || "Não foi possível otimizar o percurso do dia.");
      }
      const result = await responseJson<{ itinerary: ItineraryDay[] }>(response);
      validateSnapshot({ ...trip, itinerary: result.itinerary });
      return {
        ...trip,
        itinerary: result.itinerary,
      };
    });

  const applyDeterministicCommand = (
    commandOrFn: string | ((trip: Trip) => string),
    prepareTrip: (trip: Trip) => Trip = (trip) => trip,
  ) =>
    update(async (trip) => {
      const prepared = prepareTrip(trip);
      const command = typeof commandOrFn === "function" ? commandOrFn(prepared) : commandOrFn;
      const response = await portalFetch("/api/itinerary/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshot: prepared, input: command }),
      });
      if (!response.ok) {
        const err = await responseJson<{ error?: string }>(response).catch(() => null);
        throw new Error(err?.error || "Não foi possível executar a ação.");
      }
      const result = await responseJson<{
        itinerary: ItineraryDay[];
        reply: string;
        changed?: boolean;
      }>(response);
      if (result.changed === false) {
        throw new Error(result.reply || "Não foi possível aplicar a alteração.");
      }
      validateSnapshot({ ...prepared, itinerary: result.itinerary });
      return {
        ...prepared,
        itinerary: result.itinerary,
      };
    });

  const addPoiToDay = (dayNumber: number, title: string) =>
    applyDeterministicCommand(`adicionar "${title}" ao dia ${dayNumber}`, (trip) => {
      const defaultLimit =
        trip.brief.personalization?.extraBreaks || trip.brief.pace === "Relaxed"
          ? 2
          : trip.brief.pace === "Balanced"
            ? 3
            : 4;
      return {
        ...trip,
        itinerary: trip.itinerary.map((day) =>
          day.dayNumber === dayNumber
            ? {
                ...day,
                dailyCapacity: Math.min(
                  6,
                  Math.max(
                    day.dailyCapacity ?? defaultLimit,
                    day.items.filter((item) => item.category !== "free_time").length + 1,
                  ),
                ),
              }
            : day,
        ),
      };
    });

  const removeActivity = (dayNumber: number, activityId: string) =>
    applyDeterministicCommand((trip) => {
      const day = trip.itinerary.find((d) => d.dayNumber === dayNumber);
      if (!day) throw new Error("Dia não encontrado.");
      const index = day.items.findIndex((i) => i.id === activityId);
      if (index < 0) throw new Error("Atividade não encontrada.");
      return `remover atividade ${index + 1} do dia ${dayNumber}`;
    });

  const addFreePeriodToDay = (dayNumber: number, type: "afternoon" | "morning" | "fullday") => {
    const cmd =
      type === "morning"
        ? `adicionar manha livre ao dia ${dayNumber}`
        : type === "fullday"
          ? `marcar dia ${dayNumber} como dia livre`
          : `adicionar tarde livre ao dia ${dayNumber}`;
    return applyDeterministicCommand(cmd);
  };

  const adjustDayCapacity = (dayNumber: number, newCapacity: number) =>
    applyDeterministicCommand(`ajustar capacidade do dia ${dayNumber} para ${newCapacity}`);

  return {
    activeId,
    reopening,
    reopenedVersion,
    active,
    busy,
    assistantBusy,
    assistantLanguage: active?.assistantLanguage ?? "pt",
    changeAssistantLanguage,
    agentProposal:
      agentProposal?.tripId === activeId &&
      agentProposal.baseVersion === active?.version &&
      canonicalSnapshot(agentProposal.before) === canonicalSnapshot(active?.itinerary)
        ? agentProposal
        : null,
    decideAgentProposal,
    selectAgentAlternative,
    dismissAgentProposal: () => {
      if (!operation.current) setAgentProposal(null);
    },
    editing,
    ready,
    draft,
    formKey,
    saving,
    exporting,
    error,
    storageError,
    history,
    exportedVersions,
    clientLanguage,
    recent,
    update,
    exportPdf,
    exportPrompt,
    exportPrepared,
    reopenLatest,
    trashVersion,
    generate,
    send,
    setEditing,
    startNewTrip,
    selectTrip,
    trashTrip,
    editBrief,
    changeClientLanguage,
    updateTransitLegMode,
    optimizeDayRoute,
    addPoiToDay,
    removeActivity,
    addFreePeriodToDay,
    adjustDayCapacity,
  };
}
