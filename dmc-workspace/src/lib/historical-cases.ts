import { createHash } from "node:crypto";

import { FeedbackStore } from "./feedback-store.ts";
import { VersionConflict, checkTripId } from "./version-store.ts";

export type HistoricalProfile = {
  destination: string;
  proposalTier: string;
  pace: string;
  interests: string[];
  adults: number;
  children: number;
  days: number;
  mobilityRestrictions: string[];
  dietaryRestrictions: string[];
};

export type HistoricalCase = {
  caseId: string;
  profile: HistoricalProfile;
  items: Array<{
    dayNumber: number;
    catalogId: string;
    catalogRevision: number | null;
    overall: number;
  }>;
  approvedAt: string;
};

export type HistoricalQuery = Partial<
  Pick<HistoricalProfile, "destination" | "proposalTier" | "pace" | "adults" | "children">
> & { interests?: string[]; limit?: number };

const normalized = (value: string) => value.trim().toLocaleLowerCase("pt-PT");

/** Memória de casos aprovada, derivada de feedback e sem comentários ou identidade do cliente. */
export class HistoricalCaseStore {
  readonly feedback: FeedbackStore;

  constructor(feedback: FeedbackStore) {
    this.feedback = feedback;
    feedback.store.db.exec(`CREATE TABLE IF NOT EXISTS historical_cases (
      caseId TEXT PRIMARY KEY, tripId TEXT NOT NULL, version INTEGER NOT NULL,
      profile TEXT NOT NULL, items TEXT NOT NULL, approvedAt TEXT NOT NULL,
      approvedBy TEXT NOT NULL, UNIQUE(tripId,version),
      FOREIGN KEY(tripId,version) REFERENCES trip_feedback(tripId,version) ON DELETE CASCADE);`);
    const columns = feedback.store.db
      .prepare("PRAGMA table_info(historical_cases)")
      .all() as unknown as Array<{ name: string }>;
    if (!columns.some((column) => column.name === "caseId")) {
      // Compatibilidade com a primeira versão, cuja chave era (tripId, version).
      // A migração apenas acrescenta o identificador anonimizado e preserva os casos.
      feedback.store.db.exec("ALTER TABLE historical_cases ADD COLUMN caseId TEXT");
      const rows = feedback.store.db
        .prepare("SELECT tripId,version FROM historical_cases WHERE caseId IS NULL")
        .all() as unknown as Array<{ tripId: string; version: number }>;
      const update = feedback.store.db.prepare(
        "UPDATE historical_cases SET caseId=? WHERE tripId=? AND version=?",
      );
      for (const row of rows)
        update.run(
          createHash("sha256").update(`${row.tripId}:${row.version}`).digest("hex").slice(0, 24),
          row.tripId,
          row.version,
        );
      feedback.store.db.exec(
        "CREATE UNIQUE INDEX IF NOT EXISTS historical_cases_case_id ON historical_cases(caseId)",
      );
    }
  }

  approve(tripId: string, version: number, approvedBy: string): HistoricalCase {
    checkTripId(tripId);
    if (!/^[A-Za-z0-9:_-]{1,180}$/.test(approvedBy)) throw new Error("Aprovador inválido.");
    const snapshot = this.feedback.snapshot(tripId, version);
    const status = this.feedback.store.db
      .prepare("SELECT status FROM trip_feedback WHERE tripId=? AND version=?")
      .get(tripId, version) as { status: string } | undefined;
    if (status?.status !== "submitted")
      throw new VersionConflict("O feedback final tem de ser entregue antes da aprovação.");
    const responses = this.feedback.items(tripId, version);
    const accepted = responses.filter(
      (item) =>
        item.outcome === "completed" &&
        item.ratings.overall !== null &&
        item.ratings.overall >= 4 &&
        item.issues.length === 0,
    );
    if (!accepted.length)
      throw new VersionConflict("O caso não contém atividades realizadas com qualidade aprovada.");
    if (accepted.length !== responses.length)
      throw new VersionConflict(
        "Resolva cancelamentos, substituições, avaliações baixas ou incidentes.",
      );

    const profile: HistoricalProfile = {
      destination: snapshot.brief.destination,
      proposalTier: snapshot.brief.proposalTier,
      pace: snapshot.brief.pace,
      interests: [...snapshot.brief.interests],
      adults: snapshot.brief.adults,
      children: snapshot.brief.children,
      days: snapshot.itinerary.length,
      mobilityRestrictions: [...snapshot.brief.mobilityRestrictions],
      dietaryRestrictions: [...snapshot.brief.dietaryRestrictions],
    };
    const items = accepted.map((item) => ({
      dayNumber: item.dayNumber,
      catalogId: item.itemId,
      catalogRevision: item.catalogRevision,
      overall: item.ratings.overall!,
    }));
    const caseId = createHash("sha256").update(`${tripId}:${version}`).digest("hex").slice(0, 24);
    const approvedAt = new Date().toISOString();
    this.feedback.store.db
      .prepare(
        "INSERT INTO historical_cases (caseId,tripId,version,profile,items,approvedAt,approvedBy) VALUES(?,?,?,?,?,?,?) ON CONFLICT(tripId,version) DO UPDATE SET caseId=excluded.caseId,profile=excluded.profile,items=excluded.items,approvedAt=excluded.approvedAt,approvedBy=excluded.approvedBy",
      )
      .run(
        caseId,
        tripId,
        version,
        JSON.stringify(profile),
        JSON.stringify(items),
        approvedAt,
        approvedBy,
      );
    return { caseId, profile, items, approvedAt };
  }

  search(query: HistoricalQuery): HistoricalCase[] {
    const limit = query.limit ?? 5;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10)
      throw new Error("Limite inválido.");
    const rows = this.feedback.store.db
      .prepare(
        "SELECT h.caseId,h.profile,h.items,h.approvedAt FROM historical_cases h JOIN versions v USING(tripId,version) WHERE v.trashedAt IS NULL",
      )
      .all() as unknown as Array<{
      caseId: string;
      profile: string;
      items: string;
      approvedAt: string;
    }>;
    const wantedInterests = (query.interests ?? []).map(normalized);
    return rows
      .map((row) => {
        const value: HistoricalCase = {
          ...row,
          profile: JSON.parse(row.profile),
          items: JSON.parse(row.items),
        };
        let score = 0;
        if (
          query.destination &&
          normalized(value.profile.destination) === normalized(query.destination)
        )
          score += 5;
        if (query.proposalTier && value.profile.proposalTier === query.proposalTier) score += 2;
        if (query.pace && value.profile.pace === query.pace) score += 2;
        if (query.adults === value.profile.adults) score += 1;
        if (query.children === value.profile.children) score += 1;
        const interests = value.profile.interests.map(normalized);
        score += wantedInterests.filter((interest) => interests.includes(interest)).length * 2;
        return { value, score };
      })
      .filter(({ score }) => score > 0 || Object.keys(query).every((key) => key === "limit"))
      .sort((a, b) => b.score - a.score || b.value.approvedAt.localeCompare(a.value.approvedAt))
      .slice(0, limit)
      .map(({ value }) => value);
  }
}
