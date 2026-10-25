import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { FeedbackStore, ratingFields } from "../src/lib/feedback-store.ts";
import { VersionConflict, VersionStore } from "../src/lib/version-store.ts";

const snapshot = () => JSON.parse(readFileSync(new URL("./browser/fixture.json", import.meta.url)));
const ratings = (overall = 5) => Object.fromEntries(ratingFields.map((field) => [field, overall]));

function setup(t) {
  const root = mkdtempSync(path.join(tmpdir(), "blu-feedback-"));
  const versions = new VersionStore(root);
  const value = snapshot();
  value.itinerary = [value.itinerary[0]];
  value.itinerary[0].items = value.itinerary[0].items.slice(0, 2);
  value.itinerary[0].items[0].catalogRevision = 4;
  versions.save("trip", value, "generated", null);
  const feedback = new FeedbackStore(versions);
  t.after(() => {
    versions.close();
    rmSync(root, { recursive: true, force: true });
  });
  return { feedback, value };
}

test("feedback exige todos os cartões, fica imutável e preserva a revisão", (t) => {
  const { feedback, value } = setup(t);
  feedback.complete("trip", 1, "cognito:curator-1");
  assert.throws(
    () => feedback.submit("trip", 1, { notes: "", items: [] }, "cognito:curator-1"),
    /todos os cartões/,
  );
  const items = value.itinerary[0].items.map((item, index) => ({
    dayNumber: 1,
    itemId: item.id,
    outcome: index ? "cancelled" : "completed",
    ratings: index ? Object.fromEntries(ratingFields.map((field) => [field, null])) : ratings(),
    comment: index ? "Cancelada" : "Boa execução",
    issues: index ? ["supplier"] : [],
  }));
  feedback.submit("trip", 1, { notes: "Revisão concluída", items }, "cognito:curator-1");
  assert.equal(feedback.list()[0].status, "submitted");
  assert.equal(feedback.items("trip", 1)[0].catalogRevision, 4);
  assert.throws(
    () => feedback.submit("trip", 1, { notes: "Outra", items }, "cognito:curator-1"),
    VersionConflict,
  );
});

test("qualidade agrega apenas números e etiquetas, nunca comentários", (t) => {
  const { feedback, value } = setup(t);
  feedback.complete("trip", 1, "cognito:curator-1");
  feedback.submit(
    "trip",
    1,
    {
      notes: "NOTA_PRIVADA",
      items: value.itinerary[0].items.map((item) => ({
        dayNumber: 1,
        itemId: item.id,
        outcome: "completed",
        ratings: ratings(2),
        comment: "COMENTARIO_PRIVADO",
        issues: ["accuracy"],
      })),
    },
    "cognito:curator-1",
  );
  const signals = feedback.qualitySignals();
  assert.equal(signals[0].average, 2);
  assert.equal(signals[0].alert, true);
  assert.equal(signals[0].trends["30d"].uses, 1);
  assert.equal(signals[0].trends["90d"].average, 2);
  assert.ok(!JSON.stringify(signals).includes("PRIVAD"));
});

test("uma viagem só pode apontar para uma versão efetivamente realizada", (t) => {
  const { feedback, value } = setup(t);
  value.brief.customerName = "Versão dois";
  feedback.store.save("trip", value, "edited", 1);
  feedback.complete("trip", 1, "cognito:curator-1");
  assert.throws(() => feedback.complete("trip", 2, "cognito:curator-1"), VersionConflict);
});
