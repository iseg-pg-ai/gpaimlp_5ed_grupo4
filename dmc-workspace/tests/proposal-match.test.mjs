import { test } from "node:test";
import assert from "node:assert/strict";
import { rankProposals } from "../src/lib/proposal-match.ts";

const brief = (over = {}) => ({
  customerName: "Ana",
  destination: "Lisboa e Sintra",
  startDate: "2026-11-02",
  endDate: "2026-11-06",
  adults: 2,
  children: 0,
  budget: 3000,
  currency: "EUR",
  interests: ["Food"],
  ...over,
});
const wanted = brief({ customerName: "Lead BLU-X", interests: ["Food", "History"] });
const pool = [
  { tripId: "t-porto", version: 1, brief: brief({ destination: "Porto" }) },
  { tripId: "t-lis-a", version: 2, brief: brief() },
  {
    tripId: "t-lis-b",
    version: 1,
    brief: brief({ adults: 4, endDate: "2026-11-12", budget: 9000 }),
  },
  { tripId: "t-lis-usd", version: 1, brief: brief({ currency: "USD" }) },
  { tripId: "t-own", version: 3, brief: brief({ customerName: "Lead BLU-X" }) },
];

test("ranks the best two with reasons, own proposal first, ignoring other places and currencies", () => {
  const result = rankProposals("BLU-X", wanted, pool);
  assert.deepEqual(
    result.map((item) => item.tripId),
    ["t-own", "t-lis-a"],
  );
  assert.ok(result[0].score > result[1].score);
  assert.ok(result[0].reasons.includes("Já criada para este lead"));
  assert.ok(result[1].reasons.some((line) => line.startsWith("Orçamento")));
});

test("is deterministic and returns nothing when no proposal fits the destination", () => {
  assert.deepEqual(
    rankProposals("BLU-X", wanted, pool),
    rankProposals("BLU-X", wanted, [...pool].reverse()),
  );
  assert.deepEqual(rankProposals("BLU-X", brief({ destination: "Algarve" }), pool), []);
});

test("a proposal that only shares the place stays below the threshold", () => {
  const weak = [
    {
      tripId: "w",
      version: 1,
      brief: brief({ adults: 6, endDate: "2026-11-20", budget: 20000, interests: [] }),
    },
  ];
  assert.deepEqual(rankProposals("BLU-X", wanted, weak), []);
});
