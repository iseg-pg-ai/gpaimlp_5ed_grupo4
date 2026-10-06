"use client";
import { useEffect, useRef, useState } from "react";
import type { Locale } from "@/lib/locales";
import type { CustomerBrief, ItineraryDay, ChatMessage, RecentTrip, TransitMode } from "@/types";
import { initialBrief } from "@/data/initialBrief";
import { assistantHelp } from "@/lib/assistant-editing";

import { validateSnapshot } from "@/lib/snapshot-validation";
import { responseJson } from "@/lib/http-client";
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
    fetch(`/api/versions?tripId=${encodeURIComponent(activeId)}`)
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
    const response = await fetch("/api/versions", {
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
        const historyResponse = await fetch(`/api/versions?tripId=${encodeURIComponent(trip.id)}`);
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
  const exportPdf = async () => {
    if (!active || operation.current) return;
    operation.current = true;
    setExporting(true);
    setError("");
    try {
      const saved = await saveVersion(active, "export");
      setTrips((prev) => prev.map((t) => (t.id === saved.id ? saved : t)));
      const response = await fetch(
        `/api/versions?tripId=${encodeURIComponent(saved.id)}&version=${saved.version}&format=bundle&locale=${active.clientLanguage ?? clientLanguage}`,
      );
      if (!response.ok) await responseJson(response);
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download =
        response.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ??
        "roteiro.zip";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setExportedVersions((prev) => ({ ...prev, [`${saved.id}:${saved.version}`]: true }));
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na exportação.");
    } finally {
      operation.current = false;
      setExporting(false);
    }
  };
  const reopenLatest = async () => {
    const latest = history.id === activeId ? history.versions[0] : undefined;
    if (!latest || !active || operation.current) return;
    operation.current = true;
    setSaving(true);
    try {
      const response = await fetch(
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
      const response = await fetch("/api/versions/trash", {
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
      const response = await fetch("/api/itineraries", {
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
  const send = async (input: string) => {
    if (!active || operation.current) return false;
    setAssistantBusy(true);
    try {
      return await update(async (trip) => {
        const response = await fetch("/api/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ snapshot: trip, input }),
        });
        const result = await responseJson<{ itinerary: ItineraryDay[]; reply: string }>(response);
        validateSnapshot({ ...trip, itinerary: result.itinerary });
        if (typeof result.reply !== "string") throw new Error("Resposta inválida do assistente.");
        const { itinerary, reply } = result;
        return {
          ...trip,
          itinerary,
          messages: [...trip.messages, message("user", input), message("assistant", reply)],
        };
      });
    } finally {
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
      const response = await fetch("/api/routing", {
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
      const response = await fetch("/api/routing", {
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
      const response = await fetch("/api/assistant", {
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
