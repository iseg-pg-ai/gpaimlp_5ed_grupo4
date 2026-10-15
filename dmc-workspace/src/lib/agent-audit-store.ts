import { randomUUID, createHash } from "node:crypto";
import { VersionStore, VersionConflict, snapshotFingerprint } from "./version-store.ts";
import { simulatePlan, validatePlan, type AgentPlan } from "./assistant-actions.ts";
import type { Snapshot } from "./itinerary-pdf";
import type { Catalog } from "./curation.ts";

type Run = {
  id: string;
  tripId: string;
  baseVersion: number;
  plan: string;
  status: string;
  previewHash: string;
  createdAt: string;
  executedVersion: number | null;
};
export class AgentAuditStore {
  readonly store: VersionStore;
  constructor(store: VersionStore) {
    this.store = store;
    store.db.exec(`CREATE TABLE IF NOT EXISTS agent_runs (
      id TEXT PRIMARY KEY, tripId TEXT NOT NULL, baseVersion INTEGER NOT NULL,
      instructionHash TEXT NOT NULL, plan TEXT NOT NULL, status TEXT NOT NULL,
      previewHash TEXT NOT NULL, metadata TEXT NOT NULL, createdAt TEXT NOT NULL,
      completedAt TEXT, executedVersion INTEGER,
      FOREIGN KEY(tripId,baseVersion) REFERENCES versions(tripId,version) ON DELETE CASCADE)`);
  }
  base(tripId: string, version: number): Snapshot {
    if (this.store.list(tripId)[0]?.version !== version)
      throw new VersionConflict(
        "A viagem mudou. Reabra a versão mais recente e peça uma nova proposta.",
      );
    const row = this.store.get(tripId, version);
    if (row.trashedAt) throw new VersionConflict("Restaure a versão antes de usar o assistente.");
    return JSON.parse(row.snapshot);
  }
  propose(
    tripId: string,
    baseVersion: number,
    instruction: string,
    plan: AgentPlan,
    preview: Snapshot,
    metadata: object,
  ) {
    this.base(tripId, baseVersion);
    validatePlan(plan);
    const id = randomUUID();
    this.store.db
      .prepare(
        "INSERT INTO agent_runs (id,tripId,baseVersion,instructionHash,plan,status,previewHash,metadata,createdAt) VALUES (?,?,?,?,?,?,?,?,?)",
      )
      .run(
        id,
        tripId,
        baseVersion,
        createHash("sha256").update(instruction).digest("hex"),
        JSON.stringify(plan),
        plan.actions.length ? "proposed" : "answered",
        snapshotFingerprint(preview),
        JSON.stringify(metadata),
        new Date().toISOString(),
      );
    return id;
  }
  decide(id: string, tripId: string, decision: "accept" | "reject", catalog: Catalog) {
    const run = this.store.db
      .prepare("SELECT * FROM agent_runs WHERE id=? AND tripId=?")
      .get(id, tripId) as unknown as Run | undefined;
    if (!run) throw new VersionConflict("Proposta não encontrada.");
    if (run.status !== "proposed")
      throw new VersionConflict(
        "Esta proposta já foi decidida. Reabra o histórico antes de continuar.",
      );
    if (decision === "reject") {
      this.store.db
        .prepare(
          "UPDATE agent_runs SET status='rejected',completedAt=? WHERE id=? AND status='proposed'",
        )
        .run(new Date().toISOString(), id);
      return null;
    }
    if (Date.now() - Date.parse(run.createdAt) > 30 * 60 * 1000)
      throw new VersionConflict("A proposta expirou. Peça uma nova pré-visualização.");
    const before = this.base(tripId, run.baseVersion);
    const plan = JSON.parse(run.plan);
    const after = simulatePlan(before, plan, catalog);
    if (snapshotFingerprint(after) !== run.previewHash)
      throw new VersionConflict(
        "O catálogo ou as regras mudaram desde a pré-visualização. Peça uma nova proposta.",
      );
    const version = this.store.save(tripId, after, "edited", run.baseVersion, (number) => {
      const result = this.store.db
        .prepare(
          "UPDATE agent_runs SET status='accepted',completedAt=?,executedVersion=? WHERE id=? AND status='proposed'",
        )
        .run(new Date().toISOString(), number, id);
      if (result.changes !== 1) throw new VersionConflict("Esta proposta já foi decidida.");
    });
    return { snapshot: after, version: version.version };
  }
}
