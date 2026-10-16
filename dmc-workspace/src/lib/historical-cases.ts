import { createHash } from "node:crypto";
import { FeedbackStore, operatorName } from "./feedback-store.ts";
import type { Snapshot } from "./itinerary-pdf";

export class HistoricalCases {
  readonly feedback: FeedbackStore;
  constructor(feedback: FeedbackStore) {
    this.feedback = feedback;
    feedback.store.db.exec(`CREATE TABLE IF NOT EXISTS historical_cases (
      tripId TEXT NOT NULL, version INTEGER NOT NULL, profile TEXT NOT NULL,
      items TEXT NOT NULL, searchText TEXT NOT NULL, approvedBy TEXT NOT NULL,
      approvedAt TEXT NOT NULL, PRIMARY KEY(tripId,version),
      FOREIGN KEY(tripId,version) REFERENCES versions(tripId,version) ON DELETE CASCADE);`);
  }
  approve(tripId: string, version: number, author: unknown) {
    const operator = operatorName(author);
    const snapshot = this.feedback.snapshot(tripId, version);
    const row = this.feedback
      .list()
      .find((row) => row.tripId === tripId && row.version === version);
    const responses = this.feedback.items(tripId, version);
    const scores = responses
      .map((row) => row.ratings.overall)
      .filter((v): v is number => typeof v === "number");
    if (
      row?.status !== "submitted" ||
      !scores.length ||
      scores.reduce((a, b) => a + b, 0) / scores.length < 4 ||
      responses.some(
        (row) => row.issues.length || ["cancelled", "replaced"].includes(String(row.outcome)),
      )
    )
      throw new Error(
        "Só casos com feedback completo, média mínima 4 e sem incidentes podem ser reutilizados.",
      );
    const {
      destination,
      pace,
      proposalTier,
      interests,
      adults,
      children,
      mobilityRestrictions,
      dietaryRestrictions,
    } = snapshot.brief;
    const profile = {
      destination,
      pace,
      proposalTier,
      interests,
      adults,
      children,
      mobilityRestrictions,
      dietaryRestrictions,
      days: snapshot.itinerary.length,
    };
    const items = snapshot.itinerary.flatMap((day) =>
      day.items
        .filter((item) =>
          responses.some(
            (row) =>
              row.itemId === item.id &&
              row.dayNumber === day.dayNumber &&
              row.outcome === "completed",
          ),
        )
        .map((item) => ({
          dayNumber: day.dayNumber,
          catalogId: item.id,
          catalogRevision: item.catalogRevision ?? null,
        })),
    );
    this.feedback.store.db
      .prepare(
        "INSERT INTO historical_cases VALUES(?,?,?,?,?,?,?) ON CONFLICT(tripId,version) DO UPDATE SET approvedBy=excluded.approvedBy,approvedAt=excluded.approvedAt",
      )
      .run(
        tripId,
        version,
        JSON.stringify(profile),
        JSON.stringify(items),
        [destination, pace, proposalTier, ...interests].join(" ").toLocaleLowerCase("pt"),
        operator,
        new Date().toISOString(),
      );
  }
  search(snapshot: Snapshot, query = "") {
    const rows = this.feedback.store.db
      .prepare(
        "SELECT h.* FROM historical_cases h JOIN versions v USING(tripId,version) WHERE v.trashedAt IS NULL",
      )
      .all();
    const terms = query.toLocaleLowerCase("pt").split(/\s+/).filter(Boolean).slice(0, 10);
    return rows
      .filter((row) => terms.every((term) => String(row.searchText).includes(term)))
      .map((row) => {
        const hasAudit = this.feedback.store.db
          .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='agent_runs'")
          .get();
        const decisions = hasAudit
          ? this.feedback.store.db
              .prepare(
                "SELECT status,plan FROM agent_runs WHERE tripId=? AND baseVersion<=? AND status IN ('accepted','rejected') ORDER BY createdAt DESC LIMIT 5",
              )
              .all(row.tripId, row.version)
              .map((entry) => ({
                status: entry.status,
                actions: (JSON.parse(String(entry.plan)).actions ?? []).map(
                  (action: Record<string, unknown>) =>
                    Object.fromEntries(
                      ["type", "dayNumber", "itemId", "catalogId", "targetDayNumber"]
                        .filter((key) => action[key] !== undefined)
                        .map((key) => [key, action[key]]),
                    ),
                ),
              }))
          : [];
        const profile = JSON.parse(String(row.profile));
        const brief = snapshot.brief;
        const score =
          (profile.destination === brief.destination ? 5 : 0) +
          (profile.pace === brief.pace ? 2 : 0) +
          (profile.proposalTier === brief.proposalTier ? 2 : 0) +
          profile.interests.filter((interest: string) => brief.interests.includes(interest))
            .length +
          (profile.days === snapshot.itinerary.length ? 1 : 0);
        return {
          caseId: createHash("sha256")
            .update(`${row.tripId}:${row.version}`)
            .digest("hex")
            .slice(0, 16),
          profile,
          items: JSON.parse(String(row.items)),
          score,
          decisions,
          reasons: [
            profile.destination === brief.destination ? "Mesmo destino" : "Destino diferente",
            profile.pace === brief.pace ? "Mesmo ritmo" : "Ritmo diferente",
            "Feedback revisto, média mínima 4",
          ],
        };
      })
      .filter((row) => row.score >= 5)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }
}
