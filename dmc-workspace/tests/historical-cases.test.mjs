import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { FeedbackStore, ratingFields } from "../src/lib/feedback-store.ts";
import { HistoricalCaseStore } from "../src/lib/historical-cases.ts";
import { VersionConflict, VersionStore } from "../src/lib/version-store.ts";

const fixture = () => JSON.parse(readFileSync(new URL("./browser/fixture.json", import.meta.url)));
const ratings = (overall = 5) => Object.fromEntries(ratingFields.map((field) => [field, overall]));

function setup(t, overall = 5, issues = []) {
  const root = mkdtempSync(path.join(tmpdir(), "blu-cases-"));
  const versions = new VersionStore(root);
  const snapshot = fixture();
  snapshot.itinerary = [snapshot.itinerary[0]];
  const version = versions.save("trip", snapshot, "generated", null);
  const feedback = new FeedbackStore(versions);
  feedback.complete("trip", version.version, "cognito:curator-1");
  feedback.submit(
    "trip",
    version.version,
    {
      notes: "NOTA_PRIVADA",
      items: snapshot.itinerary[0].items.map((item) => ({
        dayNumber: 1,
        itemId: item.id,
        outcome: "completed",
        ratings: ratings(overall),
        comment: "COMENTARIO_PRIVADO",
        issues,
      })),
    },
    "cognito:curator-1",
  );
  const cases = new HistoricalCaseStore(feedback);
  t.after(() => {
    versions.close();
    rmSync(root, { recursive: true, force: true });
  });
  return { cases, versions, version };
}

test("aprova e pesquisa apenas o perfil reduzido e atividades validadas", (t) => {
  const { cases, version } = setup(t);
  cases.approve("trip", version.version, "cognito:lead-1");
  const found = cases.search({ destination: "Lisboa / Sintra", interests: ["Culture & Heritage"] });
  assert.equal(found.length, 1);
  assert.equal(found[0].items[0].overall, 5);
  assert.ok(!JSON.stringify(found).includes("João"));
  assert.ok(!JSON.stringify(found).includes("PRIVADA"));
  assert.ok(!JSON.stringify(found).includes("COMENTARIO"));
});

test("rejeita casos com avaliação baixa ou incidentes", (t) => {
  const { cases, version } = setup(t, 2, ["accuracy"]);
  assert.throws(() => cases.approve("trip", version.version, "cognito:lead-1"), VersionConflict);
});

test("uma versão no Lixo deixa de ser recuperável pela memória", (t) => {
  const { cases, versions, version } = setup(t);
  cases.approve("trip", version.version, "cognito:lead-1");
  versions.trashVersion("trip", version.version);
  assert.deepEqual(cases.search({ destination: "Lisboa / Sintra" }), []);
});
