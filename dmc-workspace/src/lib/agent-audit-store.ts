import { randomUUID, createHash } from "node:crypto";
import { VersionStore, VersionConflict, snapshotFingerprint } from "./version-store.ts";
import {
  simulatePlan,
  validatePlan,
  resolveAlternatives,
  type AgentPlan,
} from "./assistant-actions.ts";
import type { Snapshot } from "./itinerary-pdf";
import type { Catalog } from "./curation.ts";
import { proposalImpact } from "./assistant-impact.ts";
import { assertPlanIntent, type RequestIntent, IntentConflict } from "./assistant-intent.ts";

type Run = {
  id: string;
  tripId: string;
  baseVersion: number;
  plan: string;
  status: string;
  previewHash: string;
  createdAt: string;
  executedVersion: number | null;
  ownerId: string | null;
};
export class AgentAuditStore {
  readonly store: VersionStore;
  constructor(store: VersionStore) {
    this.store = store;
    store.db.exec(`CREATE TABLE IF NOT EXISTS agent_runs (
      id TEXT PRIMARY KEY, tripId TEXT NOT NULL, baseVersion INTEGER NOT NULL,
      instructionHash TEXT NOT NULL, plan TEXT NOT NULL, status TEXT NOT NULL,
      previewHash TEXT NOT NULL, metadata TEXT NOT NULL, createdAt TEXT NOT NULL,
      completedAt TEXT, executedVersion INTEGER, ownerId TEXT,
      FOREIGN KEY(tripId,baseVersion) REFERENCES versions(tripId,version) ON DELETE CASCADE)`);
    const columns = store.db.prepare("PRAGMA table_info(agent_runs)").all() as unknown as Array<{
      name: string;
    }>;
    if (!columns.some((column) => column.name === "legalHold"))
      store.db.exec("ALTER TABLE agent_runs ADD COLUMN legalHold INTEGER NOT NULL DEFAULT 0");
    if (!columns.some((column) => column.name === "ownerId"))
      store.db.exec("ALTER TABLE agent_runs ADD COLUMN ownerId TEXT");
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
    ownerId: string | null = null,
  ) {
    this.base(tripId, baseVersion);
    validatePlan(plan);
    const id = randomUUID();
    this.store.db
      .prepare(
        "INSERT INTO agent_runs (id,tripId,baseVersion,instructionHash,plan,status,previewHash,metadata,createdAt,ownerId) VALUES (?,?,?,?,?,?,?,?,?,?)",
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
        ownerId,
      );
    return id;
  }
  pendingPlan(
    tripId: string,
    baseVersion: number,
    id: string,
    ownerId: string | null = null,
  ): AgentPlan | undefined {
    const row = this.store.db
      .prepare(
        "SELECT * FROM agent_runs WHERE id=? AND tripId=? AND baseVersion=? AND status IN ('proposed','answered')",
      )
      .get(id, tripId, baseVersion) as unknown as Run | undefined;
    if (!row || row.ownerId !== ownerId || Date.now() - Date.parse(row.createdAt) > 30 * 60 * 1000)
      return undefined;
    const plan = JSON.parse(row.plan);
    validatePlan(plan);
    return plan;
  }
  selectAlternative(
    id: string,
    tripId: string,
    dayNumber: number,
    itemId: string,
    catalogId: string,
    catalog: Catalog,
    language: "pt" | "en" = "pt",
    ownerId: string | null = null,
  ) {
    const run = this.store.db
      .prepare("SELECT * FROM agent_runs WHERE id=? AND tripId=?")
      .get(id, tripId) as unknown as Run | undefined;
    if (
      !run ||
      run.ownerId !== ownerId ||
      !["proposed", "answered"].includes(run.status) ||
      Date.now() - Date.parse(run.createdAt) > 30 * 60 * 1000
    )
      throw new VersionConflict("As opções já não estão disponíveis. Peça novas alternativas.");
    const before = this.base(tripId, run.baseVersion);
    const sourceMetadata = this.store.db
      .prepare("SELECT metadata FROM agent_runs WHERE id=?")
      .get(id)!;
    const sourceIntent = JSON.parse(String(sourceMetadata.metadata)).requestIntent as
      | RequestIntent
      | undefined;
    if (sourceIntent?.kind === "add")
      throw new IntentConflict(
        "Este pedido não autoriza uma substituição. Escolha uma opção de adição.",
      );
    const groups = resolveAlternatives(before, JSON.parse(run.plan), catalog);
    const group = groups.find((g) => g.dayNumber === dayNumber && g.itemId === itemId);
    const option = group?.options.find((candidate) => candidate.catalogId === catalogId);
    if (!group || !option)
      throw new VersionConflict("Escolha uma das alternativas apresentadas para esta atividade.");
    const plan: AgentPlan = {
      summary:
        language === "en"
          ? `Replace ${group.itemTitle} with ${option.title} on day ${dayNumber}.`
          : `Substituir ${group.itemTitle} por ${option.title} no dia ${dayNumber}.`,
      actions: [{ type: "replace_item", dayNumber, itemId, catalogId }],
      warnings: [],
      requiresConfirmation: true,
    };
    const after = simulatePlan(before, plan, catalog);
    const runId = this.propose(
      tripId,
      run.baseVersion,
      `Selecionar alternativa ${catalogId}`,
      plan,
      after,
      {
        provider: "catalog",
        modelId: "human-selection",
        parentRunId: id,
        conversationLanguage: language,
      },
      ownerId,
    );
    return {
      runId,
      tripId,
      baseVersion: run.baseVersion,
      plan,
      before: before.itinerary,
      after: after.itinerary,
      impact: proposalImpact(before, after),
      alternatives: [],
      provider: "catalog",
      modelId: "human-selection",
    };
  }
  metrics() {
    const rows = this.store.db
      .prepare(
        "SELECT status,metadata,createdAt,completedAt,executedVersion,tripId FROM agent_runs ORDER BY createdAt DESC",
      )
      .all();
    let rates: Record<string, { input: number; output: number }> = {};
    try {
      const configured = JSON.parse(process.env.BLU_BEDROCK_RATES_JSON ?? "{}");
      if (configured && typeof configured === "object" && !Array.isArray(configured))
        rates = configured;
    } catch {
      /* Sem custos inventados. */
    }
    const models = [
      ...new Set(rows.map((row) => String(JSON.parse(String(row.metadata)).modelId ?? "unknown"))),
    ];
    return {
      total: rows.length,
      accepted: rows.filter((row) => row.status === "accepted").length,
      rejected: rows.filter((row) => row.status === "rejected").length,
      expired: rows.filter(
        (row) =>
          row.status === "proposed" && Date.now() - Date.parse(String(row.createdAt)) > 1800000,
      ).length,
      models: models.map((modelId) => {
        const entries = rows
          .map((row) => JSON.parse(String(row.metadata)))
          .filter((meta) => meta.modelId === modelId);
        const inputTokens = entries.reduce((n, m) => n + (Number(m.inputTokens) || 0), 0),
          outputTokens = entries.reduce((n, m) => n + (Number(m.outputTokens) || 0), 0);
        const rate = rates[modelId];
        const costUsd =
          rate && [rate.input, rate.output].every((n) => Number.isFinite(n) && n >= 0)
            ? (inputTokens * rate.input + outputTokens * rate.output) / 1e6
            : null;
        return {
          modelId,
          runs: entries.length,
          inputTokens,
          outputTokens,
          averageLatencyMs:
            entries.reduce((n, m) => n + (Number(m.latencyMs) || 0), 0) / entries.length,
          costUsd,
        };
      }),
      decisions: rows.slice(0, 50).map((row) => ({
        status: row.status,
        createdAt: row.createdAt,
        executedVersion: row.executedVersion,
        reason: JSON.parse(String(row.metadata)).rejectionReason ?? null,
      })),
      corrections:
        this.store.db
          .prepare(
            "SELECT COUNT(*) AS n FROM versions v WHERE v.reason='edited' AND v.trashedAt IS NULL AND NOT EXISTS(SELECT 1 FROM agent_runs a WHERE a.tripId=v.tripId AND a.executedVersion=v.version AND a.status='accepted')",
          )
          .get()?.n ?? 0,
    };
  }
  monthlySpendUsd(
    rates: Record<string, { input: number; output: number }>,
    now = new Date(),
  ): number {
    if (Number.isNaN(now.getTime())) throw new Error("Data de custos inválida.");
    const month = now.toISOString().slice(0, 7);
    const rows = this.store.db
      .prepare("SELECT metadata FROM agent_runs WHERE substr(createdAt,1,7)=?")
      .all(month) as unknown as Array<{ metadata: string }>;
    return rows.reduce((total, row) => {
      const metadata = JSON.parse(String(row.metadata));
      const rate = rates[String(metadata.modelId ?? "")];
      if (!rate) return total;
      return (
        total +
        ((Number(metadata.inputTokens) || 0) * rate.input +
          (Number(metadata.outputTokens) || 0) * rate.output) /
          1_000_000
      );
    }, 0);
  }
  cleanupExpired(cutoff: Date): number {
    if (Number.isNaN(cutoff.getTime())) throw new Error("Limite de retenção inválido.");
    return Number(
      this.store.db
        .prepare("DELETE FROM agent_runs WHERE createdAt<=? AND legalHold=0")
        .run(cutoff.toISOString()).changes,
    );
  }
  decide(
    id: string,
    tripId: string,
    decision: "accept" | "reject",
    catalog: Catalog,
    rejectionReason = "",
    ownerId: string | null = null,
  ) {
    const run = this.store.db
      .prepare("SELECT * FROM agent_runs WHERE id=? AND tripId=?")
      .get(id, tripId) as unknown as Run | undefined;
    if (!run || run.ownerId !== ownerId) throw new VersionConflict("Proposta não encontrada.");
    if (run.status !== "proposed")
      throw new VersionConflict(
        "Esta proposta já foi decidida. Reabra o histórico antes de continuar.",
      );
    if (decision === "reject") {
      if (typeof rejectionReason !== "string" || rejectionReason.length > 1000)
        throw new Error("Motivo de rejeição inválido.");
      const metadata = this.store.db.prepare("SELECT metadata FROM agent_runs WHERE id=?").get(id)!;
      this.store.db
        .prepare(
          "UPDATE agent_runs SET status='rejected',completedAt=?,metadata=? WHERE id=? AND status='proposed'",
        )
        .run(
          new Date().toISOString(),
          JSON.stringify({ ...JSON.parse(String(metadata.metadata)), rejectionReason }),
          id,
        );
      return null;
    }
    if (Date.now() - Date.parse(run.createdAt) > 30 * 60 * 1000)
      throw new VersionConflict("A proposta expirou. Peça uma nova pré-visualização.");
    const before = this.base(tripId, run.baseVersion);
    const plan = JSON.parse(run.plan);
    const metadata = this.store.db.prepare("SELECT metadata FROM agent_runs WHERE id=?").get(id)!;
    const intent = JSON.parse(String(metadata.metadata)).requestIntent as RequestIntent | undefined;
    if (intent) assertPlanIntent(plan, intent);
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
