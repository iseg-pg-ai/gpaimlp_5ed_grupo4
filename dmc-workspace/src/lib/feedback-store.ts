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
export type TripFeedback = { notes: string; items: ItemFeedback[] };
export class FeedbackInputError extends Error {}

type FeedbackRow = {
  tripId: string;
  version: number;
  status: "pending" | "submitted";
  completedAt: string;
  feedbackAt: string | null;
  authorId: string;
};

/** Feedback operacional ligado à versão; nunca altera snapshots nem catálogo. */
export class FeedbackStore {
  readonly store: VersionStore;

  constructor(store: VersionStore) {
    this.store = store;
    store.db.exec(`PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS trip_feedback (
        tripId TEXT NOT NULL, version INTEGER NOT NULL, status TEXT NOT NULL,
        completedAt TEXT NOT NULL, feedbackAt TEXT, authorId TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT '', PRIMARY KEY(tripId,version),
        FOREIGN KEY(tripId,version) REFERENCES versions(tripId,version) ON DELETE CASCADE);
      CREATE TABLE IF NOT EXISTS item_feedback (
        tripId TEXT NOT NULL, version INTEGER NOT NULL, dayNumber INTEGER NOT NULL,
        itemId TEXT NOT NULL, catalogRevision INTEGER, outcome TEXT NOT NULL,
        ratings TEXT NOT NULL, issues TEXT NOT NULL, comment TEXT NOT NULL,
        PRIMARY KEY(tripId,version,dayNumber,itemId),
        FOREIGN KEY(tripId,version) REFERENCES trip_feedback(tripId,version) ON DELETE CASCADE);
      CREATE UNIQUE INDEX IF NOT EXISTS one_completed_version_per_trip ON trip_feedback(tripId);`);
  }

  snapshot(tripId: string, version: number): Snapshot {
    checkTripId(tripId);
    if (!Number.isSafeInteger(version) || version < 1)
      throw new FeedbackInputError("Versão inválida.");
    const row = this.store.get(tripId, version);
    if (row.trashedAt) throw new VersionConflict("Restaure a versão antes de registar feedback.");
    return JSON.parse(row.snapshot);
  }

  complete(tripId: string, version: number, authorId: string) {
    this.snapshot(tripId, version);
    if (!/^[A-Za-z0-9:_-]{1,180}$/.test(authorId)) throw new FeedbackInputError("Autor inválido.");
    const existing = this.store.db
      .prepare("SELECT version FROM trip_feedback WHERE tripId=?")
      .get(tripId) as { version: number } | undefined;
    if (existing && existing.version !== version)
      throw new VersionConflict("A viagem já tem outra versão identificada como realizada.");
    this.store.db
      .prepare(
        "INSERT INTO trip_feedback(tripId,version,status,completedAt,authorId) VALUES(?,?,'pending',?,?) ON CONFLICT(tripId,version) DO NOTHING",
      )
      .run(tripId, version, new Date().toISOString(), authorId);
  }

  submit(tripId: string, version: number, value: TripFeedback, authorId: string) {
    const snapshot = this.snapshot(tripId, version);
    if (
      typeof value?.notes !== "string" ||
      value.notes.length > 4000 ||
      !Array.isArray(value.items)
    )
      throw new FeedbackInputError("Feedback inválido.");
    const expected = snapshot.itinerary.flatMap((day) =>
      day.items.map((item) => ({ dayNumber: day.dayNumber, item })),
    );
    if (
      value.items.length !== expected.length ||
      new Set(value.items.map((item) => `${item.dayNumber}:${item.itemId}`)).size !==
        expected.length
    )
      throw new FeedbackInputError("Responda a todos os cartões, sem duplicados.");
    for (const response of value.items) {
      if (
        !expected.some(
          ({ dayNumber, item }) => dayNumber === response.dayNumber && item.id === response.itemId,
        ) ||
        !["completed", "cancelled", "replaced", "not_applicable"].includes(response.outcome) ||
        typeof response.comment !== "string" ||
        response.comment.length > 2000 ||
        !Array.isArray(response.issues) ||
        response.issues.length > 10 ||
        response.issues.some((issue) => typeof issue !== "string" || issue.length > 100) ||
        !response.ratings ||
        Object.keys(response.ratings).length !== ratingFields.length
      )
        throw new FeedbackInputError("Resposta a um cartão inválida.");
      for (const field of ratingFields) {
        const rating = response.ratings[field];
        if (rating !== null && (!Number.isSafeInteger(rating) || rating < 1 || rating > 5))
          throw new FeedbackInputError("As avaliações devem estar entre 1 e 5 ou não aplicável.");
        if (response.outcome === "completed" && field === "overall" && rating === null)
          throw new FeedbackInputError("Avalie globalmente cada atividade realizada.");
        if (response.outcome !== "completed" && rating !== null)
          throw new FeedbackInputError("Não avalie numericamente uma atividade não realizada.");
      }
    }
    this.store.db.exec("BEGIN IMMEDIATE");
    try {
      const row = this.store.db
        .prepare("SELECT status FROM trip_feedback WHERE tripId=? AND version=?")
        .get(tripId, version) as { status: string } | undefined;
      if (row?.status !== "pending")
        throw new VersionConflict("A conclusão não foi registada ou o feedback já foi entregue.");
      const insert = this.store.db.prepare("INSERT INTO item_feedback VALUES(?,?,?,?,?,?,?,?,?)");
      for (const response of value.items) {
        const original = expected.find(
          ({ dayNumber, item }) => dayNumber === response.dayNumber && item.id === response.itemId,
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
          "UPDATE trip_feedback SET status='submitted',feedbackAt=?,authorId=?,notes=? WHERE tripId=? AND version=?",
        )
        .run(new Date().toISOString(), authorId, value.notes, tripId, version);
      this.store.db.exec("COMMIT");
    } catch (error) {
      this.store.db.exec("ROLLBACK");
      throw error;
    }
  }

  list(): FeedbackRow[] {
    return this.store.db
      .prepare(
        "SELECT f.tripId,f.version,f.status,f.completedAt,f.feedbackAt,f.authorId FROM trip_feedback f JOIN versions v USING(tripId,version) WHERE v.trashedAt IS NULL ORDER BY f.completedAt DESC",
      )
      .all() as unknown as FeedbackRow[];
  }

  items(tripId: string, version: number): Array<ItemFeedback & { catalogRevision: number | null }> {
    return this.store.db
      .prepare("SELECT * FROM item_feedback WHERE tripId=? AND version=? ORDER BY dayNumber,itemId")
      .all(tripId, version)
      .map((value) => {
        const row = value as unknown as ItemFeedback & {
          ratings: string;
          issues: string;
          catalogRevision: number | null;
        };
        return { ...row, ratings: JSON.parse(row.ratings), issues: JSON.parse(row.issues) };
      });
  }

  /** Agregados seguros para decisão; comentários e notas nunca saem daqui. */
  qualitySignals() {
    const rows = this.store.db
      .prepare(
        "SELECT i.itemId,i.outcome,i.ratings,i.issues,f.feedbackAt FROM item_feedback i JOIN trip_feedback f USING(tripId,version) JOIN versions v USING(tripId,version) WHERE v.trashedAt IS NULL AND f.status='submitted'",
      )
      .all() as Array<Record<string, unknown>>;
    return [...new Set(rows.map((row) => String(row.itemId)))].map((catalogId) => {
      const samples = rows.filter((row) => row.itemId === catalogId);
      const aggregate = (window: typeof samples) => {
        const values = window
          .map((row) => JSON.parse(String(row.ratings)).overall)
          .filter((score): score is number => typeof score === "number");
        return {
          uses: window.length,
          ratings: values.length,
          average: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null,
          issueCount: window.reduce(
            (count, row) => count + JSON.parse(String(row.issues)).length,
            0,
          ),
        };
      };
      const scores = samples
        .map((row) => JSON.parse(String(row.ratings)).overall)
        .filter((score): score is number => typeof score === "number");
      const average = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
      return {
        catalogId,
        uses: samples.length,
        ratings: scores.length,
        average,
        cancelled: samples.filter((row) => row.outcome === "cancelled").length,
        replaced: samples.filter((row) => row.outcome === "replaced").length,
        issueCount: samples.reduce(
          (count, row) => count + JSON.parse(String(row.issues)).length,
          0,
        ),
        trends: Object.fromEntries(
          [30, 90, 180].map((days) => {
            const cutoff = Date.now() - days * 86400000;
            return [
              `${days}d`,
              aggregate(
                samples.filter((row) => {
                  const timestamp = Date.parse(String(row.feedbackAt));
                  return Number.isFinite(timestamp) && timestamp >= cutoff;
                }),
              ),
            ];
          }),
        ),
        lastUsed: samples
          .map((row) => String(row.feedbackAt))
          .sort()
          .at(-1),
        alert:
          (average !== null && average < 3) ||
          samples.some((row) => JSON.parse(String(row.issues)).length > 0),
      };
    });
  }
}
