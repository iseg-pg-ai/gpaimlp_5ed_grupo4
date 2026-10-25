import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { AgentConversationStore } from "../src/lib/agent-conversation-store.ts";
import { VersionStore } from "../src/lib/version-store.ts";

const snapshot = {
  brief: {
    customerName: "Pessoa sintética",
    destination: "Lisboa",
    startDate: "2027-01-01",
    endDate: "2027-01-01",
  },
  itinerary: [],
  pending: [],
};

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "blu-agent-conversation-"));
  const versions = new VersionStore(root);
  versions.save("trip-memory", snapshot, "generated", null);
  return { root, versions, conversations: new AgentConversationStore(versions) };
}

test("memória é isolada por utilizador, viagem e versão", () => {
  const { root, versions, conversations } = fixture();
  try {
    conversations.append("curator-a", "trip-memory", 1, "user", "Primeiro pedido");
    assert.equal(conversations.get("curator-a", "trip-memory", 1).turns.length, 1);
    assert.equal(conversations.get("curator-b", "trip-memory", 1).turns.length, 0);
    assert.throws(() => conversations.get("../intruso", "trip-memory", 1));
  } finally {
    versions.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("apenas oito turnos recentes seguem completos e os anteriores formam resumo limitado", () => {
  const { root, versions, conversations } = fixture();
  try {
    for (let index = 0; index < 12; index += 1)
      conversations.append(
        "curator-a",
        "trip-memory",
        1,
        index % 2 ? "assistant" : "user",
        `Mensagem ${index}`,
      );
    const result = conversations.get("curator-a", "trip-memory", 1);
    assert.equal(result.turns.length, 8);
    assert.match(result.summary, /Mensagem 0/);
    assert.match(result.summary, /Mensagem 3/);
    assert.ok(result.summary.length <= 2000);
    assert.equal(result.turns[0].text, "Mensagem 4");
  } finally {
    versions.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("retenção elimina sessões expiradas, respeita legal hold e cascata dos turnos", () => {
  const { root, versions, conversations } = fixture();
  try {
    const past = new Date("2026-01-01T00:00:00Z");
    conversations.append("curator-a", "trip-memory", 1, "user", "Eliminar", past);
    conversations.append("curator-b", "trip-memory", 1, "user", "Preservar", past);
    versions.db
      .prepare("UPDATE agent_conversations SET legalHold=1 WHERE ownerId='curator-b'")
      .run();
    assert.equal(conversations.cleanupExpired(new Date("2027-01-01T00:00:00Z")), 1);
    assert.equal(conversations.get("curator-a", "trip-memory", 1).turns.length, 0);
    assert.equal(conversations.get("curator-b", "trip-memory", 1).turns.length, 1);
    assert.equal(conversations.remove("curator-b", "trip-memory", 1), false);
  } finally {
    versions.close();
    rmSync(root, { recursive: true, force: true });
  }
});
