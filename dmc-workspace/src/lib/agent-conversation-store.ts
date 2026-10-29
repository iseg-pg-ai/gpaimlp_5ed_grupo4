// Guarda os turnos do agente com validação do contrato e associação à conversa
// correspondente.
import { randomUUID } from "node:crypto";
import { checkOwnerId } from "./draft-store.ts";
import { checkTripId, VersionStore } from "./version-store.ts";
import { loadRetentionPolicy } from "./retention-policy.ts";

export type StoredConversationTurn = {
  sender: "user" | "assistant";
  text: string;
  createdAt: string;
};

export type StoredConversation = {
  summary: string;
  turns: StoredConversationTurn[];
  updatedAt: string | null;
};

const MAX_RECENT_TURNS = 8;
const MAX_TEXT = 4000;
const MAX_SUMMARY = 2000;

function validateTurn(sender: string, text: string) {
  if (!(["user", "assistant"] as string[]).includes(sender))
    throw new Error("Papel de conversa inválido.");
  if (typeof text !== "string" || !text.trim() || text.length > MAX_TEXT)
    throw new Error("Mensagem de conversa inválida.");
}

/** Memória privada do agente; só deve receber um principal autenticado no backend. */
export class AgentConversationStore {
  readonly store: VersionStore;

  constructor(store: VersionStore) {
    this.store = store;
    store.db.exec(`
      CREATE TABLE IF NOT EXISTS agent_conversations (
        ownerId TEXT NOT NULL,
        tripId TEXT NOT NULL,
        baseVersion INTEGER NOT NULL,
        summary TEXT NOT NULL DEFAULT '',
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        expiresAt TEXT NOT NULL,
        legalHold INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY(ownerId,tripId,baseVersion),
        FOREIGN KEY(tripId,baseVersion) REFERENCES versions(tripId,version) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS agent_conversation_turns (
        id TEXT PRIMARY KEY,
        ownerId TEXT NOT NULL,
        tripId TEXT NOT NULL,
        baseVersion INTEGER NOT NULL,
        sender TEXT NOT NULL CHECK(sender IN ('user','assistant')),
        text TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        FOREIGN KEY(ownerId,tripId,baseVersion)
          REFERENCES agent_conversations(ownerId,tripId,baseVersion) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_agent_conversation_expiry
        ON agent_conversations(expiresAt,legalHold);
      CREATE INDEX IF NOT EXISTS idx_agent_turn_order
        ON agent_conversation_turns(ownerId,tripId,baseVersion,createdAt,id);
    `);
  }

  append(
    ownerId: string,
    tripId: string,
    baseVersion: number,
    sender: "user" | "assistant",
    text: string,
    now = new Date(),
  ): StoredConversation {
    checkOwnerId(ownerId);
    checkTripId(tripId);
    validateTurn(sender, text);
    if (!Number.isSafeInteger(baseVersion) || baseVersion < 1)
      throw new Error("Versão de conversa inválida.");
    const version = this.store.get(tripId, baseVersion);
    if (version.trashedAt) throw new Error("A versão no Lixo não aceita novas mensagens.");
    const timestamp = now.toISOString();
    const expiresAt = new Date(
      now.getTime() + loadRetentionPolicy().agent_conversation_days * 86400000,
    ).toISOString();
    this.store.db.exec("BEGIN IMMEDIATE");
    try {
      this.store.db
        .prepare(
          `INSERT INTO agent_conversations
            (ownerId,tripId,baseVersion,summary,createdAt,updatedAt,expiresAt)
           VALUES (?,?,?,?,?,?,?)
           ON CONFLICT(ownerId,tripId,baseVersion) DO UPDATE SET
             updatedAt=excluded.updatedAt, expiresAt=excluded.expiresAt`,
        )
        .run(ownerId, tripId, baseVersion, "", timestamp, timestamp, expiresAt);
      this.store.db
        .prepare(
          `INSERT INTO agent_conversation_turns
            (id,ownerId,tripId,baseVersion,sender,text,createdAt)
           VALUES (?,?,?,?,?,?,?)`,
        )
        .run(randomUUID(), ownerId, tripId, baseVersion, sender, text.trim(), timestamp);

      const older = this.store.db
        .prepare(
          `SELECT id,sender,text FROM agent_conversation_turns
           WHERE ownerId=? AND tripId=? AND baseVersion=?
           ORDER BY createdAt DESC,id DESC LIMIT -1 OFFSET ?`,
        )
        .all(ownerId, tripId, baseVersion, MAX_RECENT_TURNS) as unknown as Array<{
        id: string;
        sender: string;
        text: string;
      }>;
      if (older.length) {
        const current = this.store.db
          .prepare(
            "SELECT summary FROM agent_conversations WHERE ownerId=? AND tripId=? AND baseVersion=?",
          )
          .get(ownerId, tripId, baseVersion) as unknown as { summary: string };
        const addition = older
          .reverse()
          .map((turn) => `${turn.sender === "user" ? "U" : "A"}: ${turn.text}`)
          .join("\n");
        const summary = [current.summary, addition].filter(Boolean).join("\n").slice(-MAX_SUMMARY);
        const remove = this.store.db.prepare(
          `DELETE FROM agent_conversation_turns
           WHERE ownerId=? AND tripId=? AND baseVersion=? AND id=?`,
        );
        for (const turn of older) remove.run(ownerId, tripId, baseVersion, turn.id);
        this.store.db
          .prepare(
            "UPDATE agent_conversations SET summary=? WHERE ownerId=? AND tripId=? AND baseVersion=?",
          )
          .run(summary, ownerId, tripId, baseVersion);
      }
      this.store.db.exec("COMMIT");
    } catch (error) {
      this.store.db.exec("ROLLBACK");
      throw error;
    }
    return this.get(ownerId, tripId, baseVersion);
  }

  get(ownerId: string, tripId: string, baseVersion: number): StoredConversation {
    checkOwnerId(ownerId);
    checkTripId(tripId);
    const session = this.store.db
      .prepare(
        `SELECT summary,updatedAt FROM agent_conversations
         WHERE ownerId=? AND tripId=? AND baseVersion=?`,
      )
      .get(ownerId, tripId, baseVersion) as unknown as
      | { summary: string; updatedAt: string }
      | undefined;
    const turns = this.store.db
      .prepare(
        `SELECT sender,text,createdAt FROM agent_conversation_turns
         WHERE ownerId=? AND tripId=? AND baseVersion=?
         ORDER BY createdAt,id`,
      )
      .all(ownerId, tripId, baseVersion) as unknown as StoredConversationTurn[];
    return { summary: session?.summary ?? "", turns, updatedAt: session?.updatedAt ?? null };
  }

  remove(ownerId: string, tripId: string, baseVersion: number): boolean {
    checkOwnerId(ownerId);
    checkTripId(tripId);
    return (
      this.store.db
        .prepare(
          `DELETE FROM agent_conversations
           WHERE ownerId=? AND tripId=? AND baseVersion=? AND legalHold=0`,
        )
        .run(ownerId, tripId, baseVersion).changes === 1
    );
  }

  cleanupExpired(now = new Date()): number {
    if (Number.isNaN(now.getTime())) throw new Error("Data de retenção inválida.");
    return Number(
      this.store.db
        .prepare("DELETE FROM agent_conversations WHERE expiresAt<=? AND legalHold=0")
        .run(now.toISOString()).changes,
    );
  }
}
