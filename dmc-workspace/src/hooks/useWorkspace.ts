"use client";
import { portalFetch, responseJson } from "@/lib/http-client";
import { useEffect, useRef, useState } from "react";
import type { Locale } from "@/lib/locales";
import type { CustomerBrief, ItineraryDay, ChatMessage, RecentTrip, TransitMode } from "@/types";
import { initialBrief } from "@/data/initialBrief";
import { assistantHelp } from "@/lib/assistant-editing";

import { validateSnapshot, canonicalSnapshot } from "@/lib/snapshot-validation";

import type { Snapshot } from "@/lib/itinerary-pdf";
import type { AgentProposal } from "@/lib/assistant-actions";
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

type Trip = StoredTrip;
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
  departureLocation: "",
  interests: [],
  mobilityRestrictions: [],
  dietaryRestrictions: [],
  exclusions: [],
  specialOccasion: "",
  notes: "",
  childrenAges: "",
});
const message = (sender: ChatMessage["sender"], text: string): ChatMessage => ({
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
    const result = await responseJson<{ version: number }>(response);
    if (!Number.isSafeInteger(result?.version) || result.version < 1)
      throw new Error("Versão inválida recebida do servidor.");
    return { ...trip, version: result.version };
  };
  const update = async (fn: (trip: Trip) => Trip | Promise<Trip>) => {
    if (!active || operation.current) return false;
    operation.current = true;
    setSaving(true);
    setError("");
    try {
      const changed = await saveVersion(await fn(active), "edited");
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
  const exportProposal = async (format: "bundle" | "prompt") => {
    if (!active || operation.current) return;
    operation.current = true;
    setExporting(true);
    setError("");
    try {
      const saved = await saveVersion(active, "export");
      setTrips((prev) => prev.map((t) => (t.id === saved.id ? saved : t)));
      const response = await portalFetch(
        `/api/versions?tripId=${encodeURIComponent(saved.id)}&version=${saved.version}&format=${format}&locale=${active.clientLanguage ?? clientLanguage}`,
      );
      if (!response.ok) await responseJson(response);
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download =
        response.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ??
        (format === "prompt" ? "roteiro-canva.txt" : "roteiro.zip");
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
  const reopenLatest = async () => {
    const latest = history.id === activeId ? history.versions[0] : undefined;
    if (!latest || !active || operation.current) return;
    operation.current = true;
    setSaving(true);
    try {
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
      const restored = { ...active, ...result.snapshot, version: result.meta.version };
      setTrips((prev) => prev.map((t) => (t.id === restored.id ? restored : t)));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao reabrir.");
    } finally {
      operation.current = false;
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
        clientLanguage: active?.clientLanguage ?? clientLanguage,
        version: active?.version,
        id: activeId || crypto.randomUUID(),
        brief,
        itinerary: result.itinerary,
        pending: result.pending,
        messages: [message("assistant", assistantHelp)],
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
  const send = async (input: string, currentView = "itinerary") => {
    input = input.trim();
    if (!active || !input || operation.current) return false;
    operation.current = true;
    setAssistantBusy(true);
    setError("");
    // Guardar a mensagem antes da chamada: uma falha nunca apaga a conversa.
    const appendReply = (text: string) =>
      setTrips((prev) =>
        prev.map((trip) =>
          trip.id === active.id
            ? { ...trip, messages: [...trip.messages, message("assistant", text)] }
            : trip,
        ),
      );
    setTrips((prev) =>
      prev.map((trip) =>
        trip.id === active.id
          ? { ...trip, messages: [...trip.messages, message("user", input)] }
          : trip,
      ),
    );
    try {
      if (/^(ok|sim|confirmo|aceito|podes aplicar)[.!?]*$/i.test(input)) {
        const pending =
          agentProposal?.tripId === active.id && agentProposal.baseVersion === active.version;
        appendReply(
          pending && agentProposal.plan.actions.length
            ? "Existe uma pré-visualização pendente. Para aplicar as alterações, clique em «Aceitar e guardar versão». Escrever «ok» não altera o roteiro."
            : pending && agentProposal.rankedCandidates?.length
              ? "Escolha um candidato e clique em «Pré-visualizar adição». Ainda não há alterações para aceitar."
              : pending && agentProposal.alternatives?.length
                ? "Escolha uma das alternativas apresentadas para preparar a substituição. Ainda não há uma alteração para aceitar."
                : "Não existe uma proposta de alteração pendente para confirmar. A resposta anterior não criou ações para aplicar. Indique a alteração concreta que pretende, por exemplo: remover a primeira atividade do dia 1.",
        );
        return true;
      }
      setAgentProposal(null);
      if (input.trim().toLowerCase() === "ajuda") {
        appendReply(
          assistantHelp + " Os pedidos ao agente apresentam uma proposta para aceitar ou rejeitar.",
        );
        return true;
      }
      if (!active.version) throw new Error("Guarde a viagem antes de usar o assistente.");
      const response = await portalFetch("/api/assistant/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tripId: active.id,
          baseVersion: active.version,
          snapshot: active,
          input,
          currentView,
          conversation: active.messages
            .slice(-8)
            .map(({ sender, text }) => ({ sender, text: text.slice(0, 4000) })),
          pendingRunId:
            agentProposal?.tripId === active.id && agentProposal.baseVersion === active.version
              ? agentProposal.runId
              : undefined,
        }),
      });
      const result = await responseJson<AgentProposal>(response);
      validateSnapshot({ ...active, itinerary: result.after });
      setAgentProposal(
        result.plan.actions.length || result.alternatives?.length || result.rankedCandidates?.length
          ? result
          : null,
      );
      appendReply(
        result.plan.summary +
          (result.plan.actions.length
            ? "\n\nReveja a pré-visualização e escolha «Aceitar e guardar versão» ou «Rejeitar»."
            : result.rankedCandidates?.length
              ? "\n\nEscolha um candidato para pré-visualizar a adição. Nenhuma atividade existente será substituída."
              : result.alternatives?.length
                ? "\n\nEscolha uma alternativa para preparar a sua substituição. O roteiro permanece igual."
                : "\n\nEsta resposta não contém alterações para aceitar. O roteiro permanece igual."),
      );
      return true;
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : "Não foi possível preparar a proposta.";
      setError(reason);
      appendReply(reason);
      return false;
    } finally {
      operation.current = false;
      setAssistantBusy(false);
    }
  };
  const selectAgentAlternative = async (dayNumber: number, itemId: string, catalogId: string) => {
    if (!active || !agentProposal || operation.current) return;
    operation.current = true;
    setAssistantBusy(true);
    setError("");
    try {
      if (agentProposal.tripId !== active.id || agentProposal.baseVersion !== active.version)
        throw new Error("A viagem mudou. Peça novas alternativas.");
      const response = await portalFetch("/api/assistant/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tripId: active.id,
          baseVersion: active.version,
          runId: agentProposal.runId,
          decision: itemId ? "select" : "select-add",
          dayNumber,
          itemId,
          catalogId,
        }),
      });
      const result = await responseJson<AgentProposal>(response);
      validateSnapshot({ ...active, itinerary: result.after });
      setAgentProposal(result);
      setTrips((prev) =>
        prev.map((trip) =>
          trip.id === active.id
            ? {
                ...trip,
                messages: [
                  ...trip.messages,
                  message(
                    "assistant",
                    result.plan.summary + " Reveja a pré-visualização antes de aceitar.",
                  ),
                ],
              }
            : trip,
        ),
      );
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : "Não foi possível preparar a alternativa.";
      setError(reason);
      setTrips((prev) =>
        prev.map((trip) =>
          trip.id === active.id
            ? { ...trip, messages: [...trip.messages, message("assistant", reason)] }
            : trip,
        ),
      );
    } finally {
      operation.current = false;
      setAssistantBusy(false);
    }
  };
  const decideAgentProposal = async (decision: "accept" | "reject", rejectionReason = "") => {
    if (!active || !agentProposal || operation.current) return;
    operation.current = true;
    setAssistantBusy(true);
    setError("");
    try {
      if (
        agentProposal.tripId !== active.id ||
        agentProposal.baseVersion !== active.version ||
        canonicalSnapshot(agentProposal.before) !== canonicalSnapshot(active.itinerary)
      )
        throw new Error("A viagem mudou. Peça uma nova proposta antes de confirmar.");
      const response = await portalFetch("/api/assistant/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId: agentProposal.runId,
          tripId: active.id,
          baseVersion: active.version,
          decision,
          rejectionReason,
        }),
      });
      const result = await responseJson<{ snapshot?: Snapshot; version?: number }>(response);
      if (decision === "accept") {
        validateSnapshot(result.snapshot);
        if (!Number.isSafeInteger(result.version)) throw new Error("Versão inválida.");
        setTrips((prev) =>
          prev.map((trip) =>
            trip.id === active.id
              ? {
                  ...trip,
                  ...result.snapshot!,
                  version: result.version,
                  messages: [
                    ...trip.messages,
                    message("assistant", "Proposta aceite e guardada numa nova versão."),
                  ],
                }
              : trip,
          ),
        );
      } else {
        setTrips((prev) =>
          prev.map((trip) =>
            trip.id === active.id
              ? {
                  ...trip,
                  messages: [
                    ...trip.messages,
                    message("assistant", "Proposta rejeitada. O roteiro foi preservado."),
                  ],
                }
              : trip,
          ),
        );
      }
      setAgentProposal(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Não foi possível confirmar a proposta.");
    } finally {
      operation.current = false;
      setAssistantBusy(false);
    }
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
      const response = await portalFetch("/api/assistant", {
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
    active,
    busy,
    assistantBusy,
    agentProposal:
      agentProposal?.tripId === activeId && agentProposal.baseVersion === active?.version
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
