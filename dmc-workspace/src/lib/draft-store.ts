// Persiste rascunhos com verificação do proprietário e da revisão esperada.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { checkTripId } from "./version-store.ts";
import { canonicalSnapshot, validateSnapshot } from "./snapshot-validation.ts";
import type { Snapshot } from "./itinerary-pdf.ts";
import { loadRetentionPolicy } from "./retention-policy.ts";

const DAY = 86_400_000;
const OWNER = /^[A-Za-z0-9:_-]{1,128}$/;

export class DraftConflict extends Error {}
export class DraftAccessDenied extends Error {}

export type DraftPayload = Snapshot & {
  clientLanguage?: string;
  assistantLanguage?: "pt" | "en";
};

export type DraftRecord = {
  ownerId: string;
  tripId: string;
  revision: number;
  payload: DraftPayload;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  legalHold: boolean;
};

type StoredDraft = Omit<DraftRecord, "payload" | "legalHold"> & {
  payload: string;
  legalHold: number;
};

export function checkOwnerId(ownerId: string) {
  if (!OWNER.test(ownerId)) throw new DraftAccessDenied("Identidade inválida.");
}

function publicDraft(row: StoredDraft): DraftRecord {
  return { ...row, payload: JSON.parse(row.payload), legalHold: row.legalHold === 1 };
}

/** Store privado: todas as operações exigem owner e revisão explícitos. */
export class DraftStore {
  db: DatabaseSync;
  private retentionDays: number;
  private clock: () => Date;

  constructor(
    root = process.env.BLU_OPERATIONAL_DIR ??
      path.resolve(process.cwd(), "../exports/portal-persistence"),
    retentionDays = loadRetentionPolicy().draft_inactivity_days,
    clock = () => new Date(),
  ) {
    if (!Number.isSafeInteger(retentionDays) || retentionDays < 1 || retentionDays > 365)
      throw new Error("Retenção de rascunhos inválida.");
    this.retentionDays = retentionDays;
    this.clock = clock;
    mkdirSync(root, { recursive: true });
    this.db = new DatabaseSync(path.join(root, "drafts.sqlite"));
    this.db.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS drafts (
        ownerId TEXT NOT NULL,
        tripId TEXT NOT NULL,
        revision INTEGER NOT NULL,
        payload TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        expiresAt TEXT NOT NULL,
        legalHold INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY(ownerId, tripId)
      );
      CREATE INDEX IF NOT EXISTS drafts_expiry ON drafts(expiresAt);`);
  }

  close() {
    this.db.close();
  }

  get(ownerId: string, tripId: string): DraftRecord | null {
    checkOwnerId(ownerId);
    checkTripId(tripId);
    const row = this.db
      .prepare("SELECT * FROM drafts WHERE ownerId=? AND tripId=?")
      .get(ownerId, tripId) as unknown as StoredDraft | undefined;
    return row ? publicDraft(row) : null;
  }

  list(ownerId: string): DraftRecord[] {
    checkOwnerId(ownerId);
    return (
      this.db
        .prepare("SELECT * FROM drafts WHERE ownerId=? ORDER BY updatedAt DESC")
        .all(ownerId) as unknown as StoredDraft[]
    ).map(publicDraft);
  }

  // A escrita exige a revisão esperada para impedir que um separador substitua alterações de outro.
  save(
    ownerId: string,
    tripId: string,
    payload: DraftPayload,
    baseRevision: number | null,
  ): DraftRecord {
    checkOwnerId(ownerId);
    checkTripId(tripId);
    validateSnapshot(payload);
    if (baseRevision !== null && (!Number.isSafeInteger(baseRevision) || baseRevision < 1))
      throw new Error("Revisão de origem inválida.");
    const canonical = canonicalSnapshot(payload);
    if (Buffer.byteLength(canonical, "utf8") > 2_000_000)
      throw new Error("Rascunho demasiado grande.");

    const now = this.clock();
    const timestamp = now.toISOString();
    const expiresAt = new Date(now.getTime() + this.retentionDays * DAY).toISOString();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const current = this.db
        .prepare("SELECT revision,payload FROM drafts WHERE ownerId=? AND tripId=?")
        .get(ownerId, tripId) as unknown as { revision: number; payload: string } | undefined;
      if (!current && baseRevision !== null)
        throw new DraftConflict("O rascunho já não existe ou pertence a outro utilizador.");
      if (current && baseRevision !== current.revision)
        throw new DraftConflict("O rascunho foi alterado noutro dispositivo.");
      const revision = (current?.revision ?? 0) + 1;
      if (current?.payload === canonical) {
        this.db
          .prepare("UPDATE drafts SET updatedAt=?,expiresAt=? WHERE ownerId=? AND tripId=?")
          .run(timestamp, expiresAt, ownerId, tripId);
      } else if (current) {
        this.db
          .prepare(
            "UPDATE drafts SET revision=?,payload=?,updatedAt=?,expiresAt=? WHERE ownerId=? AND tripId=?",
          )
          .run(revision, canonical, timestamp, expiresAt, ownerId, tripId);
      } else {
        this.db
          .prepare(
            "INSERT INTO drafts(ownerId,tripId,revision,payload,createdAt,updatedAt,expiresAt) VALUES(?,?,?,?,?,?,?)",
          )
          .run(ownerId, tripId, revision, canonical, timestamp, timestamp, expiresAt);
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.get(ownerId, tripId)!;
  }

  remove(ownerId: string, tripId: string, baseRevision: number): boolean {
    checkOwnerId(ownerId);
    checkTripId(tripId);
    if (!Number.isSafeInteger(baseRevision) || baseRevision < 1)
      throw new Error("Revisão de origem inválida.");
    const result = this.db
      .prepare("DELETE FROM drafts WHERE ownerId=? AND tripId=? AND revision=? AND legalHold=0")
      .run(ownerId, tripId, baseRevision);
    if (result.changes === 0) throw new DraftConflict("O rascunho mudou ou está protegido.");
    return true;
  }

  cleanupExpired(now = this.clock()): number {
    return Number(
      this.db.prepare("DELETE FROM drafts WHERE expiresAt<? AND legalHold=0").run(now.toISOString())
        .changes,
    );
  }
}
