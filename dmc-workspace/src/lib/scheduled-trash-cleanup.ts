import {
  LAST_TRASH_CLEANUP_STORAGE,
  TRASH_CLEANUP_INTERVAL_MS,
  TRASH_STORAGE,
  expiredTrashTripIds,
  readTripTrash,
} from "./trip-trash";

type CleanupResponse = {
  deletedTripIds: string[];
  deletedVersions: Array<{ tripId: string; version: number }>;
};

export async function runScheduledTrashCleanup(force = false) {
  const now = Date.now();
  const previous = Number(localStorage.getItem(LAST_TRASH_CLEANUP_STORAGE) ?? 0);
  if (!force && Number.isFinite(previous) && now - previous < TRASH_CLEANUP_INTERVAL_MS)
    return {
      ran: false,
      nextCleanupAt: new Date(previous + TRASH_CLEANUP_INTERVAL_MS).toISOString(),
      deletedTripIds: [],
      deletedVersions: [],
    };

  const trash = readTripTrash(localStorage.getItem(TRASH_STORAGE));
  const today = new Date().toLocaleDateString("sv-SE");
  const candidates = expiredTrashTripIds(trash, today);
  const response = await fetch("/api/trash/cleanup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tripIds: candidates }),
  });
  const result = (await response.json()) as CleanupResponse & { error?: string };
  if (!response.ok) throw new Error(result.error || "Não foi possível limpar o Lixo.");
  const deleted = new Set(result.deletedTripIds);
  localStorage.setItem(
    TRASH_STORAGE,
    JSON.stringify(trash.filter((entry) => !deleted.has(entry.trip.id))),
  );
  localStorage.setItem(LAST_TRASH_CLEANUP_STORAGE, String(now));
  return {
    ran: true,
    nextCleanupAt: new Date(now + TRASH_CLEANUP_INTERVAL_MS).toISOString(),
    deletedTripIds: result.deletedTripIds,
    deletedVersions: result.deletedVersions,
  };
}
