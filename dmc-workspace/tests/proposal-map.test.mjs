import { test } from "node:test";
import assert from "node:assert/strict";
import { proposalStops } from "../src/lib/proposal-map.ts";
import { fitPoints, project } from "../src/lib/map-projection.ts";

const item = (id, title, time, latitude, longitude, category = "attraction") => ({
  id,
  title,
  time,
  latitude,
  longitude,
  category,
});

test("the proposal map keeps itinerary order and lists stops without coordinates apart", () => {
  const itinerary = [
    {
      dayNumber: 1,
      date: "2026-11-02",
      items: [
        item("a", "Torre de Belém", "09:30", 38.6916, -9.216),
        item("free", "Tempo livre", "12:00", undefined, undefined, "free_time"),
        item("b", "Restaurante sem morada", "13:00", undefined, undefined),
        item("c", "Mosteiro dos Jerónimos", "15:00", "38.6979", -9.2068),
        item("d", "Ponto 0,0", "17:00", 0, 0),
      ],
    },
    { dayNumber: 2, date: "2026-11-03", items: [item("e", "Sintra", "10:00", 38.7976, -9.3906)] },
  ];
  const { days, unplaced } = proposalStops(itinerary);
  assert.deepEqual(
    days[0].stops.map((stop) => [stop.order, stop.title]),
    [[1, "Torre de Belém"]],
  );
  assert.deepEqual(
    days[1].stops.map((stop) => stop.title),
    ["Sintra"],
  );
  // Desconhecido não é «perto»: texto, 0,0 e vazio ficam fora do mapa, mas à vista.
  assert.deepEqual(
    unplaced.map((stop) => [stop.dayNumber, stop.title]),
    [
      [1, "Restaurante sem morada"],
      [1, "Mosteiro dos Jerónimos"],
      [1, "Ponto 0,0"],
    ],
  );
  assert.ok(!unplaced.some((stop) => stop.title === "Tempo livre"));
});

test("the map frames all stops and falls back to mainland Portugal", () => {
  const camera = fitPoints([project(-9.216, 38.6916), project(-8.611, 41.1496)]);
  const [x, y] = project(-8.611, 41.1496);
  assert.ok(camera.x < x && x < camera.x + camera.w && camera.y < y && y < camera.y + camera.h);
  assert.deepEqual(fitPoints([]), { x: -12, y: -52, w: 17, h: 14 });
});
