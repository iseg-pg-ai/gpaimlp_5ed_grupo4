import { VersionStore, VersionConflict, checkTripId } from "./version-store.ts";
import type { Snapshot } from "./itinerary-pdf";

export const ratingFields = [
  "overall",
  "accuracy",
  "supplier",
  "schedule",
  "value",
  "accessibility",
  "dietary",
] as const;
export type RatingField = (typeof ratingFields)[number];
export type ItemFeedback = {
  dayNumber: number;
  itemId: string;
  outcome: "completed" | "cancelled" | "replaced" | "not_applicable";
  ratings: Record<RatingField, number | null>;
  comment: string;
  issues: string[];
};
export type TripFeedback = { operator: string; notes: string; items: ItemFeedback[] };
export type FeedbackRow = {
  tripId: string;
  version: number;
  status: string;
  completedAt: string;
  feedbackAt: string | null;
  operator: string;
  feedback: string | null;
};
export const operatorName = (value: unknown): string => {
  if (typeof value !== "string" || !value.trim() || value.length > 100)
    throw new Error("Identifique o trabalhador (até 100 caracteres).");
  return value.trim();
};

// Pertence à base das versões. Nunca escreve no catálogo nem nos snapshots.
export class FeedbackStore {
  readonly store: VersionStore;
  constructor(store: VersionStore) {
    this.store = store;
    store.db.exec(`PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS trip_feedback (
        tripId TEXT NOT NULL, version INTEGER NOT NULL, status TEXT NOT NULL,
        completedAt TEXT NOT NULL, feedbackAt TEXT, operator TEXT NOT NULL, feedback TEXT,
        PRIMARY KEY(tripId,version),
        FOREIGN KEY(tripId,version) REFERENCES versions(tripId,version) ON DELETE CASCADE);
      CREATE TABLE IF NOT EXISTS item_feedback (
        tripId TEXT NOT NULL, version INTEGER NOT NULL, dayNumber INTEGER NOT NULL,
        itemId TEXT NOT NULL, catalogRevision INTEGER, outcome TEXT NOT NULL,
        ratings TEXT NOT NULL, issues TEXT NOT NULL, comment TEXT NOT NULL,
        PRIMARY KEY(tripId,version,dayNumber,itemId),
        FOREIGN KEY(tripId,version) REFERENCES trip_feedback(tripId,version) ON DELETE CASCADE);
      CREATE TABLE IF NOT EXISTS quality_decisions (
        id INTEGER PRIMARY KEY, catalogId TEXT NOT NULL, operator TEXT NOT NULL,
        decision TEXT NOT NULL, reason TEXT NOT NULL, createdAt TEXT NOT NULL);
      CREATE UNIQUE INDEX IF NOT EXISTS one_completed_version_per_trip ON trip_feedback(tripId);`);
  }
  snapshot(tripId: string, version: number): Snapshot {
    checkTripId(tripId);
    if (!Number.isSafeInteger(version) || version < 1) throw new Error("Versão inválida.");
    const row = this.store.get(tripId, version);
    if (row.trashedAt)
      throw new VersionConflict("Restaure a versão antes de registar a conclusão ou o feedback.");
    return JSON.parse(row.snapshot);
  }
  list(): FeedbackRow[] {
    return this.store.db
      .prepare(
        "SELECT f.* FROM trip_feedback f JOIN versions v USING(tripId,version) WHERE v.trashedAt IS NULL ORDER BY f.completedAt DESC",
      )
      .all() as unknown as FeedbackRow[];
  }
  complete(tripId: string, version: number, operator: unknown) {
    this.snapshot(tripId, version);
    const author = operatorName(operator);
    const previous = this.store.db
      .prepare("SELECT version FROM trip_feedback WHERE tripId=?")
      .get(tripId);
    if (previous && previous.version !== version)
      throw new VersionConflict(
        "Esta viagem já tem outra versão identificada como realizada. Preserve o feedback dessa entrega.",
      );
    this.store.db
      .prepare(
        "INSERT INTO trip_feedback(tripId,version,status,completedAt,operator) VALUES(?,?,'pending',?,?) ON CONFLICT(tripId,version) DO NOTHING",
      )
      .run(tripId, version, new Date().toISOString(), author);
  }
  submit(tripId: string, version: number, value: TripFeedback) {
    const snapshot = this.snapshot(tripId, version);
    const operator = operatorName(value?.operator);
    if (typeof value.notes !== "string" || value.notes.length > 4000 || !Array.isArray(value.items))
      throw new Error("Feedback inválido.");
    const expected = snapshot.itinerary.flatMap((day) =>
      day.items.map((item) => ({ dayNumber: day.dayNumber, item })),
    );
    if (
      expected.length !== value.items.length ||
      new Set(value.items.map((i) => `${i.dayNumber}:${i.itemId}`)).size !== expected.length
    )
      throw new Error("Responda a todos os cartões da versão realizada, sem duplicados.");
    for (const response of value.items) {
      if (
        !expected.some(
          (e) => e.dayNumber === response.dayNumber && e.item.id === response.itemId,
        ) ||
        !["completed", "cancelled", "replaced", "not_applicable"].includes(response.outcome) ||
        typeof response.comment !== "string" ||
        response.comment.length > 2000 ||
        !Array.isArray(response.issues) ||
        response.issues.length > 10 ||
        response.issues.some((i) => typeof i !== "string" || i.length > 100) ||
        !response.ratings ||
        Object.keys(response.ratings).length !== ratingFields.length
      )
        throw new Error("Resposta a um cartão inválida.");
      for (const field of ratingFields) {
        const rating = response.ratings[field];
        if (rating !== null && (!Number.isSafeInteger(rating) || rating < 1 || rating > 5))
          throw new Error("As avaliações devem estar entre 1 e 5 ou não aplicável.");
        if (response.outcome === "completed" && field === "overall" && rating === null)
          throw new Error("Avalie globalmente cada atividade realizada.");
        if (response.outcome !== "completed" && rating !== null)
          throw new Error("Não atribua avaliações a uma atividade não realizada.");
      }
    }
    this.store.db.exec("BEGIN IMMEDIATE");
    try {
      const row = this.store.db
        .prepare("SELECT status FROM trip_feedback WHERE tripId=? AND version=?")
        .get(tripId, version);
      if (!row || row.status !== "pending")
        throw new VersionConflict("A conclusão não foi registada ou o feedback já foi entregue.");
      const insert = this.store.db.prepare("INSERT INTO item_feedback VALUES(?,?,?,?,?,?,?,?,?)");
      for (const response of value.items) {
        const original = expected.find(
          (e) => e.dayNumber === response.dayNumber && e.item.id === response.itemId,
        )!.item;
        insert.run(
          tripId,
          version,
          response.dayNumber,
          response.itemId,
          original.catalogRevision ?? null,
          response.outcome,
          JSON.stringify(response.ratings),
          JSON.stringify(response.issues),
          response.comment,
        );
      }
      this.store.db
        .prepare(
          "UPDATE trip_feedback SET status='submitted',feedbackAt=?,operator=?,feedback=? WHERE tripId=? AND version=?",
        )
        .run(
          new Date().toISOString(),
          operator,
          JSON.stringify({ notes: value.notes }),
          tripId,
          version,
        );
      this.store.db.exec("COMMIT");
    } catch (error) {
      this.store.db.exec("ROLLBACK");
      throw error;
    }
  }
  items(
    tripId: string,
    version: number,
  ): Array<ItemFeedback & { tripId: string; version: number; catalogRevision: number | null }> {
    return this.store.db
      .prepare("SELECT * FROM item_feedback WHERE tripId=? AND version=? ORDER BY dayNumber,itemId")
      .all(tripId, version)
      .map((value) => {
        const row = value as unknown as {
          tripId: string;
          version: number;
          dayNumber: number;
          itemId: string;
          catalogRevision: number | null;
          outcome: ItemFeedback["outcome"];
          ratings: string;
          issues: string;
          comment: string;
        };
        return {
          ...row,
          ratings: JSON.parse(row.ratings),
          issues: JSON.parse(row.issues),
        };
      });
  }
  quality() {
    const rows = this.store.db
      .prepare(
        "SELECT i.*,f.feedbackAt FROM item_feedback i JOIN trip_feedback f USING(tripId,version) JOIN versions v USING(tripId,version) WHERE v.trashedAt IS NULL AND f.status='submitted'",
      )
      .all();
    const ids = [...new Set(rows.map((row) => String(row.itemId)))];
    return ids.map((catalogId) => {
      const samples = rows.filter((row) => row.itemId === catalogId);
      const rated = samples
        .map((row) => JSON.parse(String(row.ratings)).overall)
        .filter((n): n is number => typeof n === "number");
      const average = rated.length ? rated.reduce((a, b) => a + b, 0) / rated.length : null;
      const windows = [30, 90, 180].map((days) => {
        const recent = samples.filter(
          (row) => Date.parse(String(row.feedbackAt)) >= Date.now() - days * 86400000,
        );
        const scores = recent
          .map((row) => JSON.parse(String(row.ratings)).overall)
          .filter((n): n is number => typeof n === "number");
        return {
          days,
          uses: recent.length,
          average: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
        };
      });
      return {
        catalogId,
        uses: samples.length,
        ratings: rated.length,
        average,
        windows,
        cancelled: samples.filter((row) => row.outcome === "cancelled").length,
        replaced: samples.filter((row) => row.outcome === "replaced").length,
        issues: [...new Set(samples.flatMap((row) => JSON.parse(String(row.issues)) as string[]))],
        lastUsed: samples
          .map((row) => String(row.feedbackAt))
          .sort()
          .at(-1),
        alert:
          (average !== null && average < 3) ||
          samples.some((row) => JSON.parse(String(row.issues)).length > 0),
        revisions: [...new Set(samples.map((row) => row.catalogRevision))],
      };
    });
  }
}
