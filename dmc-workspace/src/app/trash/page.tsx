"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArchiveRestore, Search, Trash2 } from "lucide-react";
import { T } from "@/components/LocaleProvider";
import { VersionTrashButton } from "@/components/VersionTrashButton";
import {
  AUTO_TRASH_STORAGE,
  TRASH_CLEANUP_INTERVAL_MS,
  TRASH_STORAGE,
  TRIPS_STORAGE,
  moveCompletedTripsToTrash,
  isTripPast,
  readTripTrash,
  restoreTripFromTrash,
  type StoredTrip,
  type TripTrashEntry,
} from "@/lib/trip-trash";
import type { VersionRecord } from "@/lib/version-store";
import { runScheduledTrashCleanup } from "@/lib/scheduled-trash-cleanup";

export default function TrashPage() {
  const [query, setQuery] = useState("");
  const [trips, setTrips] = useState<TripTrashEntry[]>([]);
  const [versions, setVersions] = useState<VersionRecord[]>([]);
  const [autoTrash, setAutoTrash] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [nextCleanupAt, setNextCleanupAt] = useState("");
  const [cleanupMessage, setCleanupMessage] = useState("");

  const loadVersions = async () => {
    const response = await fetch("/api/versions/trash", { cache: "no-store" });
    const result = (await response.json()) as VersionRecord[] | { error?: string };
    if (!response.ok || !Array.isArray(result))
      throw new Error(
        !Array.isArray(result) && result.error ? result.error : "Erro ao carregar versões.",
      );
    setVersions(result);
  };

  useEffect(() => {
    queueMicrotask(() => {
      void (async () => {
        try {
          const cleanup = await runScheduledTrashCleanup();
          const savedTrips = readTripTrash(localStorage.getItem(TRASH_STORAGE));
          const savedAutomatic = localStorage.getItem(AUTO_TRASH_STORAGE) === "true";
          await loadVersions();
          setNextCleanupAt(cleanup.nextCleanupAt);
          if (cleanup.ran && (cleanup.deletedTripIds.length || cleanup.deletedVersions.length))
            setCleanupMessage(
              `Limpeza concluída: ${cleanup.deletedTripIds.length} viagem(ns) e ${cleanup.deletedVersions.length} versão(ões) eliminadas definitivamente.`,
            );
          setTrips(savedTrips);
          setAutoTrash(savedAutomatic);
        } catch (loadError) {
          setError(loadError instanceof Error ? loadError.message : "Erro ao carregar o Lixo.");
        } finally {
          setReady(true);
        }
      })();
    });
  }, []);

  const setAutomatic = (enabled: boolean) => {
    setAutoTrash(enabled);
    localStorage.setItem(AUTO_TRASH_STORAGE, String(enabled));
    if (!enabled) return;
    try {
      const active = JSON.parse(localStorage.getItem(TRIPS_STORAGE) ?? "[]") as StoredTrip[];
      if (!Array.isArray(active)) throw new Error();
      const moved = moveCompletedTripsToTrash(
        active,
        trips,
        new Date().toLocaleDateString("sv-SE"),
      );
      localStorage.setItem(TRIPS_STORAGE, JSON.stringify(moved.trips));
      localStorage.setItem(TRASH_STORAGE, JSON.stringify(moved.trash));
      setTrips(moved.trash);
    } catch {
      setError("Não foi possível aplicar a remoção automática.");
    }
  };

  const restoreTrip = (tripId: string) => {
    try {
      const active = JSON.parse(localStorage.getItem(TRIPS_STORAGE) ?? "[]") as StoredTrip[];
      if (!Array.isArray(active)) throw new Error();
      const restored = restoreTripFromTrash(active, trips, tripId);
      localStorage.setItem(TRIPS_STORAGE, JSON.stringify(restored.trips));
      localStorage.setItem(TRASH_STORAGE, JSON.stringify(restored.trash));
      setTrips(restored.trash);
      setError("");
    } catch {
      setError("Não foi possível restaurar a viagem.");
    }
  };

  const permanentlyDelete = async (tripId: string, version?: number) => {
    const subject = version ? `a versão final ${version}` : "a versão final e a viagem";
    if (!window.confirm(`Eliminar definitivamente ${subject}? Esta ação não pode ser anulada.`))
      return;
    try {
      const response = await fetch("/api/trash/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tripIds: version ? [] : [tripId],
          confirmedTripIds: version ? [] : [tripId],
          confirmedVersions: version ? [{ tripId, version }] : [],
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível eliminar o elemento.");
      if (version) {
        setVersions((items) =>
          items.filter((item) => item.tripId !== tripId || item.version !== version),
        );
      } else {
        const remaining = trips.filter((entry) => entry.trip.id !== tripId);
        localStorage.setItem(TRASH_STORAGE, JSON.stringify(remaining));
        setTrips(remaining);
        setVersions((items) => items.filter((item) => item.tripId !== tripId));
      }
      setCleanupMessage("Eliminação definitiva confirmada e concluída.");
      setError("");
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Não foi possível eliminar o elemento.",
      );
    }
  };

  const normalized = query.trim().toLocaleLowerCase();
  const today = new Date().toLocaleDateString("sv-SE");
  const visibleTrips = useMemo(
    () =>
      trips.filter((entry) =>
        [entry.trip.brief.customerName, entry.trip.brief.destination, entry.trip.brief.startDate]
          .join(" ")
          .toLocaleLowerCase()
          .includes(normalized),
      ),
    [trips, normalized],
  );
  const visibleVersions = useMemo(
    () =>
      versions.filter((entry) =>
        [entry.filename, entry.tripId, String(entry.version)]
          .join(" ")
          .toLocaleLowerCase()
          .includes(normalized),
      ),
    [versions, normalized],
  );

  return (
    <main className="mx-auto max-w-5xl p-4 text-[#143F4B] sm:p-8">
      <Link href="/" className="underline">
        <T text="Voltar ao workspace" source="pt" />
      </Link>
      <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 font-serif-blu text-3xl">
            <Trash2 className="size-7 text-[#70443E]" /> <T text="Lixo" source="pt" />
          </h1>
          <p className="mt-2 text-sm text-[#4A636B]">
            <T
              text="Restaure viagens removidas dos planos ativos e versões retiradas do histórico."
              source="pt"
            />
          </p>
        </div>
        <label className="flex max-w-md items-start gap-3 rounded-xl border border-[#D5D1C7] bg-white p-4 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={autoTrash}
            onChange={(event) => setAutomatic(event.target.checked)}
          />
          <span>
            <strong className="block">
              <T text="Remover automaticamente viagens terminadas" source="pt" />
            </strong>
            <span className="mt-1 block text-xs text-[#4A636B]">
              <T
                text="As viagens cuja data de fim já passou saem dos planos ativos e permanecem recuperáveis aqui."
                source="pt"
              />
            </span>
          </span>
        </label>
      </div>

      <label className="relative mt-6 block">
        <Search className="absolute left-3 top-3 size-4 text-[#698288]" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Pesquisar por cliente, destino, versão ou ficheiro…"
          className="h-11 w-full rounded-xl border border-[#D5D1C7] bg-white pl-10 pr-4 text-sm"
        />
      </label>
      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}
      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        <strong>Limpeza automática diária</strong>
        <p className="mt-1">
          A limpeza é executada no máximo uma vez a cada {TRASH_CLEANUP_INTERVAL_MS / 3600000}{" "}
          horas.
          {nextCleanupAt &&
            ` Próxima execução prevista após ${new Date(nextCleanupAt).toLocaleString()}.`}
        </p>
        <p className="mt-1">
          As versões anteriores de viagens terminadas serão eliminadas na próxima limpeza. A versão
          final só pode ser eliminada após confirmação do utilizador.
        </p>
      </div>
      {cleanupMessage && (
        <p role="status" className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
          {cleanupMessage}
        </p>
      )}
      {!ready && <p className="mt-6">A carregar…</p>}

      <section className="mt-8">
        <h2 className="font-serif-blu text-2xl">Viagens removidas</h2>
        <div className="mt-3 space-y-3">
          {ready && !visibleTrips.length && (
            <p className="rounded-xl border border-[#D5D1C7] bg-white p-5 text-sm">
              Nenhuma viagem encontrada.
            </p>
          )}
          {visibleTrips.map((entry) => {
            const expired = isTripPast(entry.trip, today);
            return (
              <article
                key={entry.trip.id}
                className="rounded-xl border border-[#D5D1C7] bg-white p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <span className="rounded-full bg-[#F1E4E1] px-2 py-1 text-xs font-semibold text-[#70443E]">
                      Viagem
                    </span>
                    <h3 className="mt-2 text-lg font-semibold">{entry.trip.brief.customerName}</h3>
                    <p className="text-sm text-[#4A636B]">
                      {entry.trip.brief.destination} · {entry.trip.brief.startDate} —{" "}
                      {entry.trip.brief.endDate}
                    </p>
                    <p className="mt-2 text-xs text-[#698288]">
                      Removida em {new Date(entry.removedAt).toLocaleString()} · remoção{" "}
                      {entry.removal === "automatic" ? "automática" : "manual"}
                    </p>
                    {expired && (
                      <p className="mt-2 text-sm font-semibold text-red-800">
                        A viagem já terminou. As versões anteriores serão eliminadas na próxima
                        limpeza; a versão final exige confirmação.
                      </p>
                    )}
                  </div>
                  {expired ? (
                    <button
                      type="button"
                      onClick={() => void permanentlyDelete(entry.trip.id)}
                      className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-red-700 px-3 py-2 text-sm font-semibold text-red-800 hover:bg-red-50"
                    >
                      <Trash2 className="size-4" /> Eliminar definitivamente
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => restoreTrip(entry.trip.id)}
                      className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#2D5B67] px-3 py-2 text-sm font-semibold text-[#143F4B] hover:bg-[#E7EEF0]"
                    >
                      <ArchiveRestore className="size-4" /> Restaurar viagem
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-serif-blu text-2xl">Versões removidas</h2>
        <div className="mt-3 space-y-3">
          {ready && !visibleVersions.length && (
            <p className="rounded-xl border border-[#D5D1C7] bg-white p-5 text-sm">
              Nenhuma versão encontrada.
            </p>
          )}
          {visibleVersions.map((entry) => {
            const expired = Boolean(entry.tripEndDate && entry.tripEndDate < today);
            return (
              <article
                key={`${entry.tripId}-${entry.version}`}
                className="rounded-xl border border-[#D5D1C7] bg-white p-5"
              >
                <span className="rounded-full bg-[#E7EEF0] px-2 py-1 text-xs font-semibold">
                  Versão
                </span>
                <h3 className="mt-2 break-words font-semibold">{entry.filename}</h3>
                <p className="my-2 text-xs text-[#698288]">
                  Removida em {entry.trashedAt ? new Date(entry.trashedAt).toLocaleString() : "—"} ·
                  remoção manual
                </p>
                {expired && entry.isFinalVersion ? (
                  <div>
                    <p className="mb-3 text-sm font-semibold text-red-800">
                      Esta é a versão final. A eliminação definitiva exige a sua confirmação.
                    </p>
                    <button
                      type="button"
                      onClick={() => void permanentlyDelete(entry.tripId, entry.version)}
                      className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-red-700 px-3 py-2 text-sm font-semibold text-red-800 hover:bg-red-50"
                    >
                      <Trash2 className="size-4" /> Eliminar versão final
                    </button>
                  </div>
                ) : expired ? (
                  <p className="text-sm font-semibold text-red-800">
                    Esta versão anterior será eliminada definitivamente na próxima limpeza.
                  </p>
                ) : (
                  <VersionTrashButton
                    tripId={entry.tripId}
                    version={entry.version}
                    action="restore"
                    onComplete={() =>
                      setVersions((items) => items.filter((item) => item !== entry))
                    }
                  />
                )}
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
