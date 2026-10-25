import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DraftStore } from "../src/lib/draft-store.ts";
import { runRetentionCleanup } from "../src/lib/retention-cleanup.ts";
import { loadRetentionPolicy, validateRetentionPolicy } from "../src/lib/retention-policy.ts";
import { AgentAuditStore } from "../src/lib/agent-audit-store.ts";
import { AgentConversationStore } from "../src/lib/agent-conversation-store.ts";
import { VersionStore } from "../src/lib/version-store.ts";

const snapshot = JSON.parse(
  readFileSync(new URL("./browser/fixture.json", import.meta.url), "utf8"),
);
Object.assign(snapshot.brief, {
  childrenAges: "8",
  specialOccasion: "",
  notes: "",
  accommodation: "",
  diningPace: "Relaxed Dining (~90m)",
});

function roots(t) {
  const root = mkdtempSync(path.join(tmpdir(), "blu-retention-"));
  const operational = path.join(root, "operational");
  const exports = path.join(root, "exports");
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return { operational, exports };
}

test("política central recusa enfraquecer salvaguardas", () => {
  const policy = loadRetentionPolicy();
  assert.equal(policy.draft_inactivity_days, 90);
  assert.equal(policy.agent_conversation_days, 30);
  assert.equal(policy.agent_audit_days, 365);
  assert.throws(
    () => validateRetentionPolicy({ ...policy, authoritative_versions_auto_delete: true }),
    /salvaguardas/,
  );
  assert.throws(() => validateRetentionPolicy({ ...policy, unknown: 1 }), /campos/);
});

test("limpeza aplica prazos sem remover versões, exports ou preservações legais", (t) => {
  const { operational, exports } = roots(t);
  const old = new Date("2024-01-01T00:00:00.000Z");
  const now = new Date("2026-10-25T12:00:00.000Z");
  const drafts = new DraftStore(operational, 90, () => old);
  drafts.save("user:a", "expired", snapshot, null);
  drafts.save("user:a", "held", snapshot, null);
  drafts.db
    .prepare("UPDATE drafts SET legalHold=1 WHERE ownerId=? AND tripId=?")
    .run("user:a", "held");
  drafts.close();

  const versions = new VersionStore(exports);
  versions.save("trip-retained", snapshot, "generated", null);
  const expired = versions.createShare("trip-retained", 1, "pt", "link", "expired@example.test", 7);
  const held = versions.createShare("trip-retained", 1, "pt", "link", "held@example.test", 7);
  versions.db
    .prepare("UPDATE proposal_shares SET expiresAt=?,legalHold=1 WHERE token=?")
    .run(old.toISOString(), held.token);
  versions.db
    .prepare("UPDATE proposal_shares SET expiresAt=? WHERE token=?")
    .run(old.toISOString(), expired.token);

  new AgentAuditStore(versions);
  const insert = versions.db.prepare(
    `INSERT INTO agent_runs
      (id,tripId,baseVersion,instructionHash,plan,status,previewHash,metadata,createdAt,legalHold)
      VALUES(?,?,?,?,?,?,?,?,?,?)`,
  );
  for (const [id, legalHold] of [
    ["expired-audit", 0],
    ["held-audit", 1],
  ])
    insert.run(
      id,
      "trip-retained",
      1,
      "hash",
      '{"summary":"","actions":[],"warnings":[],"requiresConfirmation":true}',
      "answered",
      "preview",
      "{}",
      old.toISOString(),
      legalHold,
    );
  const conversations = new AgentConversationStore(versions);
  conversations.append("user:a", "trip-retained", 1, "user", "Expirar", old);
  conversations.append("user:b", "trip-retained", 1, "user", "Preservar", old);
  versions.db.prepare("UPDATE agent_conversations SET legalHold=1 WHERE ownerId='user:b'").run();
  versions.close();

  const result = runRetentionCleanup(now, operational, exports);
  assert.deepEqual(result, {
    drafts: 1,
    shares: 1,
    agentAudit: 1,
    agentConversations: 1,
    authoritativeVersions: 0,
    exports: 0,
  });

  const remainingDrafts = new DraftStore(operational);
  assert.equal(remainingDrafts.get("user:a", "expired"), null);
  assert.ok(remainingDrafts.get("user:a", "held"));
  remainingDrafts.close();

  const remainingVersions = new VersionStore(exports);
  assert.equal(remainingVersions.list("trip-retained").length, 1);
  assert.equal(
    remainingVersions.db.prepare("SELECT COUNT(*) AS n FROM proposal_shares").get().n,
    1,
  );
  assert.equal(remainingVersions.db.prepare("SELECT COUNT(*) AS n FROM agent_runs").get().n, 1);
  assert.equal(
    remainingVersions.db.prepare("SELECT COUNT(*) AS n FROM agent_conversations").get().n,
    1,
  );
  remainingVersions.close();
});
