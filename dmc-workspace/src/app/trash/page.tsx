"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArchiveRestore, Search, Trash2 } from "lucide-react";
import { T } from "@/components/LocaleProvider";
import { VersionTrashButton } from "@/components/VersionTrashButton";
import {
  AUTO_TRASH_STORAGE,
  TRASH_STORAGE,
  TRIPS_STORAGE,
  moveCompletedTripsToTrash,
  readTripTrash,
  restoreTripFromTrash,
  type StoredTrip,
  type TripTrashEntry,
} from "@/lib/trip-trash";
import type { VersionRecord } from "@/lib/version-store";

export default function TrashPage() {
  const [query, setQuery] = useState("");
  const [trips, setTrips] = useState<TripTrashEntry[]>([]);
  const [versions, setVersions] = useState<VersionRecord[]>([]);
  const [autoTrash, setAutoTrash] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

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
    try {
      const savedTrips = readTripTrash(localStorage.getItem(TRASH_STORAGE));
      const savedAutomatic = localStorage.getItem(AUTO_TRASH_STORAGE) === "true";
      queueMicrotask(() => {
        setTrips(savedTrips);
        setAutoTrash(savedAutomatic);
      });
      queueMicrotask(() =>
        loadVersions().catch((loadError) =>
          setError(loadError instanceof Error ? loadError.message : "Erro ao carregar o Lixo."),
        ),
      );
    } catch {
      queueMicrotask(() =>
        setError("Não foi possível ler os elementos removidos neste navegador."),
      );
    } finally {
      queueMicrotask(() => setReady(true));
    }
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

  const normalized = query.trim().toLocaleLowerCase();
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
      {!ready && <p className="mt-6">A carregar…</p>}

      <section className="mt-8">
        <h2 className="font-serif-blu text-2xl">Viagens removidas</h2>
        <div className="mt-3 space-y-3">
          {ready && !visibleTrips.length && (
            <p className="rounded-xl border border-[#D5D1C7] bg-white p-5 text-sm">
              Nenhuma viagem encontrada.
            </p>
          )}
          {visibleTrips.map((entry) => (
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
                </div>
                <button
                  type="button"
                  onClick={() => restoreTrip(entry.trip.id)}
                  className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#2D5B67] px-3 py-2 text-sm font-semibold text-[#143F4B] hover:bg-[#E7EEF0]"
                >
                  <ArchiveRestore className="size-4" /> Restaurar viagem
                </button>
              </div>
            </article>
          ))}
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
          {visibleVersions.map((entry) => (
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
              <VersionTrashButton
                tripId={entry.tripId}
                version={entry.version}
                action="restore"
                onComplete={() => setVersions((items) => items.filter((item) => item !== entry))}
              />
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
