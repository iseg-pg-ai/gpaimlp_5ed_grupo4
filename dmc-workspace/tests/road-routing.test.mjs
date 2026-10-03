import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateRoadLeg, enrichItineraryWithRoadRouting } from "../src/lib/road-routing.ts";

test("calculateRoadLeg computes real road travel leg between coordinates", async () => {
  const from = { title: "Castelo de São Jorge", latitude: 38.71391, longitude: -9.13348 };
  const to = { title: "Cervejaria Ramiro", latitude: 38.7202, longitude: -9.13571 };

  const leg = await calculateRoadLeg(from, to, 4000);
  assert.ok(leg);
  assert.equal(leg.fromLocation, "Castelo de São Jorge");
  assert.equal(leg.toLocation, "Cervejaria Ramiro");
  assert.match(leg.duration, /^\d+\s*min$/);
  assert.match(leg.distance, /[\d.]+\s*(km|m)/);
  assert.ok(["chauffeur", "walk"].includes(leg.mode));
  assert.ok(leg.isAlgorithmOptimized);
});

test("calculateRoadLeg falls back gracefully when coordinates are missing", async () => {
  const from = { title: "Local Sem GPS A" };
  const to = { title: "Local Sem GPS B" };

  const leg = await calculateRoadLeg(from, to, 1000);
  assert.ok(leg);
  assert.equal(leg.fromLocation, "Local Sem GPS A");
  assert.equal(leg.toLocation, "Local Sem GPS B");
  assert.equal(leg.isAlgorithmOptimized, false);
});

test("enrichItineraryWithRoadRouting attaches transitToNext and routeSummary to days", async () => {
  const mockDays = [
    {
      dayNumber: 1,
      date: "2026-10-05",
      title: "Lisboa",
      location: "Lisboa",
      items: [
        {
          id: "atracoes:LIS-001",
          time: "09:30–11:00 (proposto)",
          title: "Castelo de São Jorge",
          category: "activity",
          location: "Lisboa",
        },
        {
          id: "atracoes:LIS-002",
          time: "11:30–12:30 (proposto)",
          title: "Sé de Lisboa",
          category: "activity",
          location: "Lisboa",
        },
        {
          id: "restaurantes:REST-002",
          time: "13:00–14:30 (proposto)",
          title: "Cervejaria Ramiro",
          category: "restaurant",
          location: "Lisboa",
        },
      ],
    },
  ];

  const catalogRecords = [
    { id: "LIS-001", latitude: 38.713909, longitude: -9.133476 },
    { id: "LIS-002", latitude: 38.71037, longitude: -9.132472 },
    { id_blu: "REST-002", latitude: 38.7201981, longitude: -9.1357063 },
  ];

  const enriched = await enrichItineraryWithRoadRouting(mockDays, catalogRecords);
  assert.equal(enriched.length, 1);
  const day = enriched[0];

  assert.ok(day.items[0].transitToNext);
  assert.equal(day.items[0].transitToNext.fromLocation, "Castelo de São Jorge");
  assert.equal(day.items[0].transitToNext.toLocation, "Sé de Lisboa");

  assert.ok(day.items[1].transitToNext);
  assert.equal(day.items[1].transitToNext.fromLocation, "Sé de Lisboa");
  assert.equal(day.items[1].transitToNext.toLocation, "Cervejaria Ramiro");

  assert.equal(day.items[2].transitToNext, undefined);

  assert.ok(day.routeSummary);
  assert.equal(day.routeSummary.legsCount, 2);
  assert.match(day.routeSummary.totalTransitTime, /\d+\s*min/);
  assert.match(day.routeSummary.totalDistance, /[\d.]+\s*km/);
  assert.equal(day.routeSummary.algorithmStatus, "Feasible & Optimized");
});
