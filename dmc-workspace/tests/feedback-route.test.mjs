import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { FeedbackStore, ratingFields } from "../src/lib/feedback-store.ts";
import { HistoricalCaseStore } from "../src/lib/historical-cases.ts";
import { VersionStore } from "../src/lib/version-store.ts";

test("fluxo de aplicação regista, entrega e aprova sem enviar comentários ao caso", (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "blu-feedback-api-"));
  const snapshot = JSON.parse(readFileSync(new URL("./browser/fixture.json", import.meta.url)));
  snapshot.itinerary = [snapshot.itinerary[0]];
  const versions = new VersionStore(root);
  t.after(() => {
    versions.close();
    rmSync(root, { recursive: true, force: true });
  });
  const version = versions.save("trip", snapshot, "generated", null).version;
  const feedback = new FeedbackStore(versions);
  const cases = new HistoricalCaseStore(feedback);
  feedback.complete("trip", version, "local:curator");
  assert.equal(feedback.list()[0].status, "pending");

  const items = snapshot.itinerary[0].items.map((item) => ({
    dayNumber: 1,
    itemId: item.id,
    outcome: "completed",
    ratings: Object.fromEntries(ratingFields.map((field) => [field, 5])),
    issues: [],
    comment: "COMENTARIO_PRIVADO",
  }));
  feedback.submit("trip", version, { notes: "NOTA_PRIVADA", items }, "local:curator");
  const approved = cases.approve("trip", version, "local:admin");
  assert.ok(!JSON.stringify(approved).includes("PRIVAD"));
});
