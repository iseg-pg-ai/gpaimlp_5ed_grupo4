import type { Locale } from "./locales";
import type { ChatMessage, CustomerBrief, ItineraryDay } from "../types/index";

export const TRIPS_STORAGE = "blu-trips-v1";
export const TRASH_STORAGE = "blu-trip-trash-v1";
export const AUTO_TRASH_STORAGE = "blu-auto-trash-completed-v1";
export const LAST_TRASH_CLEANUP_STORAGE = "blu-last-trash-cleanup-v1";
export const TRASH_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

export type StoredTrip = {
  clientLanguage?: Locale;
  version?: number;
  id: string;
  brief: CustomerBrief;
  itinerary: ItineraryDay[];
  pending: string[];
  messages: ChatMessage[];
};

export type TripTrashEntry = {
  kind: "trip";
  trip: StoredTrip;
  removedAt: string;
  removal: "manual" | "automatic";
};

export function readTripTrash(raw: string | null): TripTrashEntry[] {
  if (!raw) return [];
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) throw new Error("Lixo de viagens inválido.");
  return parsed.filter((entry): entry is TripTrashEntry =>
    Boolean(
      entry &&
        typeof entry === "object" &&
        (entry as TripTrashEntry).kind === "trip" &&
        typeof (entry as TripTrashEntry).trip?.id === "string" &&
        typeof (entry as TripTrashEntry).removedAt === "string" &&
        ["manual", "automatic"].includes((entry as TripTrashEntry).removal),
    ),
  );
}

export function moveTripToTrash(
  trips: StoredTrip[],
  trash: TripTrashEntry[],
  tripId: string,
  removal: TripTrashEntry["removal"],
  removedAt = new Date().toISOString(),
) {
  const trip = trips.find((item) => item.id === tripId);
  if (!trip) return { trips, trash };
  return {
    trips: trips.filter((item) => item.id !== tripId),
    trash: [
      { kind: "trip" as const, trip, removedAt, removal },
      ...trash.filter((entry) => entry.trip.id !== tripId),
    ],
  };
}

export function restoreTripFromTrash(trips: StoredTrip[], trash: TripTrashEntry[], tripId: string) {
  const entry = trash.find((item) => item.trip.id === tripId);
  if (!entry) return { trips, trash };
  return {
    trips: [...trips.filter((item) => item.id !== tripId), entry.trip],
    trash: trash.filter((item) => item.trip.id !== tripId),
  };
}

export function moveCompletedTripsToTrash(
  trips: StoredTrip[],
  trash: TripTrashEntry[],
  today: string,
  removedAt = new Date().toISOString(),
) {
  return trips
    .filter((trip) => /^\d{4}-\d{2}-\d{2}$/.test(trip.brief.endDate) && trip.brief.endDate < today)
    .reduce(
      (state, trip) => moveTripToTrash(state.trips, state.trash, trip.id, "automatic", removedAt),
      { trips, trash },
    );
}

export function isTripPast(trip: StoredTrip, today: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(trip.brief.endDate) && trip.brief.endDate < today;
}

export function expiredTrashTripIds(trash: TripTrashEntry[], today: string) {
  return trash.filter((entry) => isTripPast(entry.trip, today)).map((entry) => entry.trip.id);
}
