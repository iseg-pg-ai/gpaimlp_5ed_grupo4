import { test } from "node:test";
import assert from "node:assert/strict";
import {
  moveCompletedTripsToTrash,
  moveTripToTrash,
  readTripTrash,
  restoreTripFromTrash,
} from "../src/lib/trip-trash.ts";

const trip = (id, endDate) => ({
  id,
  brief: { customerName: id, destination: "Lisboa", startDate: "2026-01-01", endDate },
  itinerary: [],
  pending: [],
  messages: [],
});

test("manual trip removal and restoration preserve the complete trip", () => {
  const original = trip("manual", "2026-12-20");
  const removed = moveTripToTrash([original], [], original.id, "manual", "2026-10-05T10:00:00Z");
  assert.equal(removed.trips.length, 0);
  assert.equal(removed.trash[0].trip, original);
  assert.equal(removed.trash[0].removal, "manual");
  assert.deepEqual(readTripTrash(JSON.stringify(removed.trash)), removed.trash);

  const restored = restoreTripFromTrash([], removed.trash, original.id);
  assert.deepEqual(restored.trips, [original]);
  assert.equal(restored.trash.length, 0);
});

test("automatic removal moves only trips whose end date is before today", () => {
  const completed = trip("completed", "2026-10-04");
  const today = trip("today", "2026-10-05");
  const future = trip("future", "2026-10-06");
  const result = moveCompletedTripsToTrash(
    [completed, today, future],
    [],
    "2026-10-05",
    "2026-10-05T10:00:00Z",
  );
  assert.deepEqual(
    result.trips.map((item) => item.id),
    ["today", "future"],
  );
  assert.equal(result.trash[0].trip.id, "completed");
  assert.equal(result.trash[0].removal, "automatic");
});
