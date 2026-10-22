import { after, before, beforeEach, test } from "node:test";
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { optimizeRouteSequence } from "../src/lib/road-routing.ts";
import {
  calculateRoadLeg,
  enrichItineraryWithRoadRouting,
  updateDayTransitLeg,
} from "../src/lib/road-routing-server.ts";

const previousRouter = process.env.OSRM_ROUTER_URL;
const previousTelemetry = process.env.BLU_TELEMETRY_DIR;
let routerUrl;
let routingCalls;
let routingResponse;
let telemetry;
const provider = createServer(async (request, response) => {
  routingCalls.push({ url: routerUrl + request.url });
  try {
    const result = await routingResponse();
    response.writeHead(result.status, { "content-type": "application/json" });
    response.end(await result.text());
  } catch {
    request.socket.destroy();
  }
});

// O cálculo corre em Python: o fornecedor simulado deve atravessar a mesma fronteira HTTP.
before(async () => {
  telemetry = mkdtempSync(path.join(tmpdir(), "blu-routing-telemetry-"));
  await new Promise((resolve) => provider.listen(0, "127.0.0.1", resolve));
  routerUrl = `http://127.0.0.1:${provider.address().port}`;
  process.env.OSRM_ROUTER_URL = routerUrl;
  process.env.BLU_TELEMETRY_DIR = telemetry;
});
beforeEach(() => {
  routingCalls = [];
  routingResponse = async () =>
    Response.json({ code: "Ok", routes: [{ distance: 1600, duration: 240 }] });
});
after(async () => {
  await new Promise((resolve) => provider.close(resolve));
  if (previousRouter === undefined) delete process.env.OSRM_ROUTER_URL;
  else process.env.OSRM_ROUTER_URL = previousRouter;
  if (previousTelemetry === undefined) delete process.env.BLU_TELEMETRY_DIR;
  else process.env.BLU_TELEMETRY_DIR = previousTelemetry;
  rmSync(telemetry, { recursive: true, force: true });
});

test("calculateRoadLeg uses the measured OSRM response without external requests", async () => {
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
  assert.equal(leg.distance, "1.6 km");
  assert.equal(leg.duration, "4 min");
  assert.equal(leg.mode, "chauffeur");
  assert.equal(routingCalls.length, 1);
  assert.equal(
    routingCalls[0].url,
    `${routerUrl}/route/v1/driving/-9.13348,38.71391;-9.13571,38.7202?overview=false`,
  );
  assert.equal(new URL(routingCalls[0].url).searchParams.get("overview"), "false");
});

test("calculateRoadLeg falls back gracefully when coordinates are missing", async () => {
  const from = { title: "Local Sem GPS A" };
  const to = { title: "Local Sem GPS B" };

  const leg = await calculateRoadLeg(from, to, 1000);
  assert.ok(leg);
  assert.equal(leg.fromLocation, "Local Sem GPS A");
  assert.equal(leg.toLocation, "Local Sem GPS B");
  assert.equal(leg.isAlgorithmOptimized, false);
  assert.equal(leg.distance, "Por confirmar");
  assert.equal(routingCalls.length, 0);
});

test("OSRM unavailable keeps estimates distinct from measured routes", async () => {
  routingResponse = async () => {
    return Response.json({ code: "ServiceUnavailable" }, { status: 503 });
  };
  const leg = await calculateRoadLeg(
    { title: "A", latitude: 38.71391, longitude: -9.13348 },
    { title: "B", latitude: 38.7202, longitude: -9.13571 },
    { preferredMode: "walk", bufferMinutes: 7 },
  );
  assert.equal(routingCalls.length, 1);
  assert.equal(new URL(routingCalls[0].url).pathname.split("/")[3], "walking");
  assert.equal(leg.isAlgorithmOptimized, false);
  assert.equal(leg.mode, "walk");
  assert.equal(leg.bufferMinutes, 7);
  assert.match(leg.distance, /\(estimado\)$/);
  assert.match(leg.routeNote, /estimada/);
  assert.doesNotMatch(leg.algorithmNote, /via OSRM/);
});

test("OSRM network failure returns an explicit estimate without a second request", async () => {
  routingResponse = async () => {
    throw new TypeError("Fornecedor simulado indisponível");
  };
  const leg = await calculateRoadLeg(
    { title: "A", latitude: 38.71391, longitude: -9.13348 },
    { title: "B", latitude: 38.7202, longitude: -9.13571 },
    { preferredMode: "chauffeur", timeoutMs: 1 },
  );
  assert.equal(routingCalls.length, 1);
  assert.equal(leg.isAlgorithmOptimized, false);
  assert.equal(leg.mode, "chauffeur");
  assert.match(leg.distance, /\(estimado\)$/);
  assert.match(leg.routeNote, /estimada/);
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
  assert.equal(routingCalls.length, 2);
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
  assert.ok(
    ["Viável e Otimizado", "Feasible & Optimized"].includes(day.routeSummary.algorithmStatus),
  );
});

test("enrichItineraryWithRoadRouting resolves coordinates by catalog ID, title and establishment", async () => {
  const mockDays = [
    {
      dayNumber: 1,
      date: "2026-10-10",
      title: "Lisboa",
      location: "Lisboa",
      items: [
        {
          id: "atracoes:cat-09673e2650504dd8c36f64c92b2e14e8",
          time: "11:00–11:30 (proposto)",
          title: "Telecabine Lisboa",
          category: "activity",
        },
        {
          id: "restaurantes:cat-0122ddf2cd071f8778b6be4112d0553a",
          time: "12:30–14:00 (proposto)",
          title: "Time Out Market Lisboa",
          category: "restaurant",
        },
      ],
    },
  ];

  const catalogRecords = [
    {
      id: "LIS-066",
      nome_da_atracao: "Telecabine Lisboa",
      _catalog_id: "cat-09673e2650504dd8c36f64c92b2e14e8",
      latitude: 38.7673,
      longitude: -9.0954,
    },
    {
      id_blu: "REST-015",
      estabelecimento: "Time Out Market Lisboa",
      _catalog_id: "cat-0122ddf2cd071f8778b6be4112d0553a",
      latitude: 38.7070934,
      longitude: -9.1458973,
    },
  ];

  const enriched = await enrichItineraryWithRoadRouting(mockDays, catalogRecords);
  const leg = enriched[0].items[0].transitToNext;
  assert.equal(routingCalls.length, 1);
  assert.ok(leg);
  assert.equal(leg.fromLocation, "Telecabine Lisboa");
  assert.equal(leg.toLocation, "Time Out Market Lisboa");
  assert.notEqual(leg.distance, "Por confirmar");
  assert.match(leg.distance, /[\d.]+\s*km/);
  assert.match(leg.duration, /\d+\s*min/);
});

test("optimizeRouteSequence eliminates zig-zag and anchors lunch in the middle", () => {
  // Parque das Nações (East)
  const telecabine = {
    id: "poi-telecabine",
    title: "Telecabine Lisboa",
    category: "activity",
    latitude: 38.7673,
    longitude: -9.0954,
    time: "09:30–10:30 (proposto)",
  };
  const oceanario = {
    id: "poi-oceanario",
    title: "Oceanário de Lisboa",
    category: "activity",
    latitude: 38.7635,
    longitude: -9.0937,
    time: "10:45–12:00 (proposto)",
  };

  // Lunch anchor in Baixa / Cais do Sodré
  const lunch = {
    id: "poi-lunch",
    title: "Time Out Market",
    category: "restaurant",
    latitude: 38.7071,
    longitude: -9.1459,
    time: "12:30–14:00 (proposto)",
  };

  // Belém (West)
  const jeronimos = {
    id: "poi-jeronimos",
    title: "Mosteiro dos Jerónimos",
    category: "activity",
    latitude: 38.6979,
    longitude: -9.2067,
    time: "14:30–16:00 (proposto)",
  };
  const torreBelem = {
    id: "poi-torre",
    title: "Torre de Belém",
    category: "activity",
    latitude: 38.6916,
    longitude: -9.216,
    time: "16:30–17:30 (proposto)",
  };

  // Scrambled input: East -> West -> Lunch -> West -> East
  const scrambled = [telecabine, jeronimos, lunch, torreBelem, oceanario];

  const optimized = optimizeRouteSequence(scrambled);
  assert.equal(optimized.length, 5);

  // Lunch must remain anchored in index 2
  assert.equal(optimized[2].id, "poi-lunch");

  // Morning activities must both be East (Telecabine & Oceanário together)
  const morningIds = [optimized[0].id, optimized[1].id];
  assert.ok(morningIds.includes("poi-telecabine"));
  assert.ok(morningIds.includes("poi-oceanario"));

  // Afternoon activities must both be West (Jerónimos & Torre together)
  const afternoonIds = [optimized[3].id, optimized[4].id];
  assert.ok(afternoonIds.includes("poi-jeronimos"));
  assert.ok(afternoonIds.includes("poi-torre"));

  // Times must be sequential
  assert.match(optimized[0].time, /^09:30/);
});

test("enrichItineraryWithRoadRouting skips road legs for free_time periods", async () => {
  const day = {
    dayNumber: 1,
    date: "2026-10-10",
    title: "Dia 1: Lisboa",
    location: "Lisboa",
    items: [
      {
        id: "poi-1",
        title: "Castelo de São Jorge",
        category: "activity",
        latitude: 38.7139,
        longitude: -9.1335,
        time: "10:00–12:00 (proposto)",
      },
      {
        id: "free-time-1",
        title: "Tarde Livre — Exploração e Descanso",
        category: "free_time",
        time: "14:00–18:00 (proposto)",
      },
    ],
  };

  const [enriched] = await enrichItineraryWithRoadRouting([day]);
  assert.equal(enriched.items.length, 2);
  // No transit leg between poi-1 and free-time-1
  assert.equal(enriched.items[0].transitToNext, undefined);
  assert.equal(enriched.routeSummary, undefined);
  assert.equal(routingCalls.length, 0);
});

test("calculateRoadLeg supports explicit preferredMode (walk vs chauffeur)", async () => {
  const from = { title: "Miradouro de Santa Luzia", latitude: 38.7116, longitude: -9.1303 };
  const to = { title: "Sé de Lisboa", latitude: 38.7099, longitude: -9.1326 };

  const walkLeg = await calculateRoadLeg(from, to, { preferredMode: "walk" });
  assert.ok(walkLeg);
  assert.equal(walkLeg.mode, "walk");
  assert.match(walkLeg.duration, /^\d+\s*min$/);
  assert.equal(walkLeg.bufferMinutes, 5);

  const carLeg = await calculateRoadLeg(from, to, {
    preferredMode: "chauffeur",
    bufferMinutes: 12,
  });
  assert.ok(carLeg);
  assert.equal(carLeg.mode, "chauffeur");
  assert.equal(carLeg.bufferMinutes, 12);
  assert.equal(routingCalls.length, 2);
  assert.deepEqual(
    routingCalls.map(({ url }) => new URL(url).pathname.split("/")[3]),
    ["walking", "driving"],
  );
  assert.equal(walkLeg.duration, "21 min");
  assert.equal(carLeg.duration, "4 min");
});

test("updateDayTransitLeg switches transit mode and realigns subsequent schedule", async () => {
  const day = {
    dayNumber: 1,
    date: "2026-10-10",
    title: "Lisboa",
    location: "Lisboa",
    items: [
      {
        id: "act-1",
        title: "Praça do Comércio",
        category: "activity",
        latitude: 38.7075,
        longitude: -9.1364,
        time: "09:30–10:45 (proposto)",
      },
      {
        id: "act-2",
        title: "Elevador de Santa Justa",
        category: "activity",
        latitude: 38.7121,
        longitude: -9.1394,
        time: "11:15–12:30 (proposto)",
      },
    ],
  };

  const updatedDay = await updateDayTransitLeg(day, "act-1", "walk", 8);
  assert.equal(updatedDay.items[0].transitToNext?.mode, "walk");
  assert.equal(updatedDay.items[0].transitToNext?.bufferMinutes, 8);
  assert.ok(updatedDay.routeSummary);
  assert.equal(updatedDay.routeSummary.legsCount, 1);
  assert.equal(routingCalls.length, 1);
});
