import { DatabaseSync } from "node:sqlite";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { renderLocalizedPdf } from "./localized-pdf.ts";
import { isLocale, type Locale } from "./locales.ts";
import { renderPdf, type Snapshot, type VersionMeta } from "./itinerary-pdf.ts";
const hash = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
const slug = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40)
    .replace(/-$/g, "") || "Sem-nome";
export function checkTripId(id: string) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,79}$/.test(id))
    throw new Error("Identificador da viagem inválido.");
}
export class VersionConflict extends Error {}
// Normalize legacy download names without changing archived PDF bytes or version hashes.
function publicName<T extends VersionMeta>(row: T): T {
  const suffix = `_${row.tripId}.pdf`;
  return row.filename.endsWith(suffix)
    ? { ...row, filename: row.filename.slice(0, -suffix.length) + ".pdf" }
    : row;
}
type Stored = VersionMeta & {
  snapshot: string;
  pdf: Uint8Array | null;
  pdfHash: string | null;
  exportedAt: string | null;
  trashedAt: string | null;
  trashReason: "manual" | null;
};
export type VersionRecord = VersionMeta & {
  trashedAt?: string | null;
  trashReason?: "manual" | null;
  tripEndDate?: string;
};
export type TrashCleanupResult = {
  deletedTripIds: string[];
  deletedVersions: Array<{ tripId: string; version: number }>;
};
export type ShareMethod = "document" | "link";
export type ProposalShare = {
  token: string;
  tripId: string;
  version: number;
  locale: Locale;
  method: ShareMethod;
  recipient: string;
  createdAt: string;
  filename: string;
  customerName: string;
  destination: string;
  startDate: string;
  endDate: string;
};
export class VersionStore {
  db: DatabaseSync;
  root: string;
  private localizedRenderer: typeof renderLocalizedPdf;
  constructor(
    root = process.env.BLU_EXPORT_DIR ?? path.resolve(process.cwd(), "../exports/itineraries"),
    localizedRenderer = renderLocalizedPdf,
  ) {
    this.localizedRenderer = localizedRenderer;
    this.root = root;
    mkdirSync(root, { recursive: true });
    this.db = new DatabaseSync(path.join(root, "history.sqlite"));
    this.db.exec(`PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS versions (
      tripId TEXT NOT NULL, version INTEGER NOT NULL, filename TEXT NOT NULL,
      createdAt TEXT NOT NULL, reason TEXT NOT NULL, snapshotHash TEXT NOT NULL,
      chainHash TEXT NOT NULL, parentVersion INTEGER, snapshot TEXT NOT NULL,
      pdf BLOB, pdfHash TEXT, exportedAt TEXT, PRIMARY KEY(tripId, version));
      CREATE TABLE IF NOT EXISTS localized_pdfs (
        tripId TEXT NOT NULL, version INTEGER NOT NULL, locale TEXT NOT NULL,
        filename TEXT NOT NULL, pdf BLOB NOT NULL, pdfHash TEXT NOT NULL, createdAt TEXT NOT NULL,
        PRIMARY KEY(tripId,version,locale));
      CREATE TABLE IF NOT EXISTS proposal_shares (
        token TEXT PRIMARY KEY, tripId TEXT NOT NULL, version INTEGER NOT NULL,
        locale TEXT NOT NULL, method TEXT NOT NULL, recipient TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        FOREIGN KEY(tripId,version) REFERENCES versions(tripId,version));`);
    const versionColumns = this.db
      .prepare("PRAGMA table_info(versions)")
      .all() as unknown as Array<{
      name: string;
    }>;
    if (!versionColumns.some((column) => column.name === "trashedAt"))
      this.db.exec("ALTER TABLE versions ADD COLUMN trashedAt TEXT");
    if (!versionColumns.some((column) => column.name === "trashReason"))
      this.db.exec("ALTER TABLE versions ADD COLUMN trashReason TEXT");
  }
  close() {
    this.db.close();
  }
  list(tripId?: string): VersionRecord[] {
    const columns =
      "tripId, version, filename, createdAt, reason, snapshotHash, chainHash, parentVersion, exportedAt, trashedAt, trashReason";
    if (tripId) {
      checkTripId(tripId);
      return (
        this.db
          .prepare(
            `SELECT ${columns} FROM versions WHERE tripId=? AND trashedAt IS NULL ORDER BY version DESC`,
          )
          .all(tripId) as unknown as VersionRecord[]
      ).map(publicName);
    }
    return (
      this.db
        .prepare(`SELECT ${columns} FROM versions WHERE trashedAt IS NULL ORDER BY createdAt DESC`)
        .all() as unknown as VersionRecord[]
    ).map(publicName);
  }
  listTrash(): VersionRecord[] {
    const columns =
      "tripId, version, filename, createdAt, reason, snapshotHash, chainHash, parentVersion, exportedAt, trashedAt, trashReason, snapshot";
    const rows = this.db
      .prepare(
        `SELECT ${columns} FROM versions WHERE trashedAt IS NOT NULL ORDER BY trashedAt DESC`,
      )
      .all() as unknown as Array<VersionRecord & { snapshot: string }>;
    return rows.map((row) => {
      const { snapshot, ...record } = row;
      return publicName({
        ...record,
        tripEndDate: (JSON.parse(snapshot) as Snapshot).brief.endDate,
      });
    });
  }
  trashVersion(tripId: string, version: number) {
    this.get(tripId, version);
    const trashedAt = new Date().toISOString();
    this.db
      .prepare(
        "UPDATE versions SET trashedAt=COALESCE(trashedAt,?), trashReason=COALESCE(trashReason,'manual') WHERE tripId=? AND version=?",
      )
      .run(trashedAt, tripId, version);
    return this.listTrash().find((item) => item.tripId === tripId && item.version === version)!;
  }
  restoreVersion(tripId: string, version: number) {
    this.get(tripId, version);
    this.db
      .prepare("UPDATE versions SET trashedAt=NULL, trashReason=NULL WHERE tripId=? AND version=?")
      .run(tripId, version);
    return this.list(tripId).find((item) => item.version === version)!;
  }
  cleanupExpiredTrash(tripIds: string[], today: string): TrashCleanupResult {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new Error("Data de limpeza inválida.");
    const candidates = [...new Set(tripIds)];
    candidates.forEach(checkTripId);
    const deletedTripIds: string[] = [];
    const deletedVersions: Array<{ tripId: string; version: number }> = [];

    for (const tripId of candidates) {
      const rows = this.db
        .prepare("SELECT version,snapshot FROM versions WHERE tripId=? ORDER BY version")
        .all(tripId) as unknown as Array<{ version: number; snapshot: string }>;
      const allExpired = rows.every((row) => {
        const snapshot = JSON.parse(row.snapshot) as Snapshot;
        return snapshot.brief.endDate < today;
      });
      if (!allExpired) continue;
      this.db.exec("BEGIN IMMEDIATE");
      try {
        this.db.prepare("DELETE FROM proposal_shares WHERE tripId=?").run(tripId);
        this.db.prepare("DELETE FROM localized_pdfs WHERE tripId=?").run(tripId);
        this.db.prepare("DELETE FROM versions WHERE tripId=?").run(tripId);
        this.db.exec("COMMIT");
      } catch (error) {
        this.db.exec("ROLLBACK");
        throw error;
      }
      const directory = path.resolve(this.root, tripId);
      if (path.dirname(directory) !== path.resolve(this.root))
        throw new Error("Pasta de viagem inválida.");
      rmSync(directory, { recursive: true, force: true });
      deletedTripIds.push(tripId);
      deletedVersions.push(...rows.map((row) => ({ tripId, version: row.version })));
    }

    const trashed = this.db
      .prepare("SELECT tripId,version,filename,snapshot FROM versions WHERE trashedAt IS NOT NULL")
      .all() as unknown as Array<{
      tripId: string;
      version: number;
      filename: string;
      snapshot: string;
    }>;
    for (const row of trashed) {
      if (deletedTripIds.includes(row.tripId)) continue;
      const snapshot = JSON.parse(row.snapshot) as Snapshot;
      if (snapshot.brief.endDate >= today) continue;
      const localized = this.db
        .prepare("SELECT filename FROM localized_pdfs WHERE tripId=? AND version=?")
        .all(row.tripId, row.version) as unknown as Array<{ filename: string }>;
      this.db.exec("BEGIN IMMEDIATE");
      try {
        this.db
          .prepare("DELETE FROM proposal_shares WHERE tripId=? AND version=?")
          .run(row.tripId, row.version);
        this.db
          .prepare("DELETE FROM localized_pdfs WHERE tripId=? AND version=?")
          .run(row.tripId, row.version);
        this.db
          .prepare("DELETE FROM versions WHERE tripId=? AND version=?")
          .run(row.tripId, row.version);
        this.db.exec("COMMIT");
      } catch (error) {
        this.db.exec("ROLLBACK");
        throw error;
      }
      const directory = path.resolve(this.root, row.tripId);
      if (path.dirname(directory) !== path.resolve(this.root))
        throw new Error("Pasta de viagem inválida.");
      for (const filename of [
        row.filename,
        row.filename.replace(/\.pdf$/, ".json"),
        ...localized.map((item) => item.filename),
      ]) {
        const target = path.resolve(directory, path.basename(filename));
        if (path.dirname(target) !== directory) throw new Error("Ficheiro de versão inválido.");
        try {
          unlinkSync(target);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
      }
      deletedVersions.push({ tripId: row.tripId, version: row.version });
    }
    return { deletedTripIds, deletedVersions };
  }
  get(tripId: string, version: number): Stored {
    checkTripId(tripId);
    if (!Number.isSafeInteger(version) || version < 1) throw new Error("Versão inválida.");
    const row = this.db
      .prepare("SELECT * FROM versions WHERE tripId=? AND version=?")
      .get(tripId, version) as unknown as Stored | undefined;
    if (!row) throw new Error("Versão não encontrada.");
    return publicName(row);
  }
  createShare(
    tripId: string,
    version: number,
    locale: Locale,
    method: ShareMethod,
    recipient: string,
  ): ProposalShare {
    const stored = this.get(tripId, version);
    const token = randomBytes(24).toString("base64url");
    const createdAt = new Date().toISOString();
    this.db
      .prepare(
        "INSERT INTO proposal_shares (token,tripId,version,locale,method,recipient,createdAt) VALUES (?,?,?,?,?,?,?)",
      )
      .run(token, tripId, version, locale, method, recipient, createdAt);
    const snapshot = JSON.parse(stored.snapshot) as Snapshot;
    return {
      token,
      tripId,
      version,
      locale,
      method,
      recipient,
      createdAt,
      filename: stored.filename.replace(/\.pdf$/, `_${locale.toUpperCase()}.pdf`),
      customerName: snapshot.brief.customerName,
      destination: snapshot.brief.destination,
      startDate: snapshot.brief.startDate,
      endDate: snapshot.brief.endDate,
    };
  }
  getShare(token: string): ProposalShare {
    if (!/^[A-Za-z0-9_-]{32}$/.test(token)) throw new Error("Partilha inválida.");
    const row = this.db.prepare("SELECT * FROM proposal_shares WHERE token=?").get(token) as
      | {
          token: string;
          tripId: string;
          version: number;
          locale: string;
          method: string;
          recipient: string;
          createdAt: string;
        }
      | undefined;
    if (!row || !isLocale(row.locale) || !["document", "link"].includes(row.method))
      throw new Error("Partilha não encontrada.");
    const locale = row.locale;
    const stored = this.get(row.tripId, row.version);
    const snapshot = JSON.parse(stored.snapshot) as Snapshot;
    return {
      ...row,
      locale,
      method: row.method as ShareMethod,
      filename: stored.filename.replace(/\.pdf$/, `_${row.locale.toUpperCase()}.pdf`),
      customerName: snapshot.brief.customerName,
      destination: snapshot.brief.destination,
      startDate: snapshot.brief.startDate,
      endDate: snapshot.brief.endDate,
    };
  }
  save(
    tripId: string,
    snapshot: Snapshot,
    reason: string,
    baseVersion: number | null,
  ): VersionMeta {
    checkTripId(tripId);
    const serialized = canonical(snapshot),
      snapshotHash = hash(serialized);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const previous = this.db
        .prepare("SELECT * FROM versions WHERE tripId=? ORDER BY version DESC LIMIT 1")
        .get(tripId) as unknown as Stored | undefined;
      if (previous?.snapshotHash === snapshotHash) {
        if (previous.trashedAt) this.restoreVersion(tripId, previous.version);
        this.db.exec("COMMIT");
        return this.list(tripId)[0];
      }
      if ((previous?.version ?? null) !== baseVersion)
        throw new VersionConflict(
          "Existe uma versão mais recente desta viagem. Reabra a versão guardada antes de alterar o roteiro.",
        );
      const version = (previous?.version ?? 0) + 1,
        createdAt = new Date().toISOString();
      const filename = `BLU_${slug(snapshot.brief.customerName)}_${slug(snapshot.brief.destination)}_${snapshot.brief.startDate}_a_${snapshot.brief.endDate}_v${String(version).padStart(3, "0")}.pdf`;
      const chainHash = hash(
        `${previous?.chainHash ?? ""}|${snapshotHash}|${tripId}|${version}|${createdAt}`,
      );
      this.db
        .prepare(
          "INSERT INTO versions (tripId,version,filename,createdAt,reason,snapshotHash,chainHash,parentVersion,snapshot) VALUES (?,?,?,?,?,?,?,?,?)",
        )
        .run(
          tripId,
          version,
          filename,
          createdAt,
          reason,
          snapshotHash,
          chainHash,
          previous?.version ?? null,
          serialized,
        );
      this.db.exec("COMMIT");
      return {
        tripId,
        version,
        filename,
        createdAt,
        reason,
        snapshotHash,
        chainHash,
        parentVersion: previous?.version ?? null,
      };
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  async localizedPdf(tripId: string, version: number, locale: Locale) {
    const stored = this.get(tripId, version);
    type LocalPdf = { filename: string; pdf: Uint8Array; pdfHash: string };
    const read = () =>
      this.db
        .prepare(
          "SELECT filename,pdf,pdfHash FROM localized_pdfs WHERE tripId=? AND version=? AND locale=?",
        )
        .get(tripId, version, locale) as unknown as LocalPdf | undefined;
    let result = read();
    if (!result) {
      const filename = stored.filename.replace(/\.pdf$/, `_${locale.toUpperCase()}.pdf`);
      const bytes = await this.localizedRenderer(
        JSON.parse(stored.snapshot),
        { ...stored, filename },
        locale,
      );
      this.db
        .prepare("INSERT OR IGNORE INTO localized_pdfs VALUES (?,?,?,?,?,?,?)")
        .run(tripId, version, locale, filename, bytes, hash(bytes), new Date().toISOString());
      result = read()!;
    }
    this.db
      .prepare("UPDATE versions SET exportedAt=COALESCE(exportedAt,?) WHERE tripId=? AND version=?")
      .run(new Date().toISOString(), tripId, version);
    const directory = path.join(this.root, tripId);
    mkdirSync(directory, { recursive: true });
    try {
      writeFileSync(path.join(directory, result.filename), result.pdf, { flag: "wx" });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    return { bytes: Buffer.from(result.pdf), filename: result.filename };
  }
  async pdf(tripId: string, version: number) {
    let stored = this.get(tripId, version);
    if (!stored.pdf) {
      const bytes = await renderPdf(JSON.parse(stored.snapshot), stored);
      this.db
        .prepare(
          "UPDATE versions SET pdf=?, pdfHash=?, exportedAt=? WHERE tripId=? AND version=? AND pdf IS NULL",
        )
        .run(bytes, hash(bytes), new Date().toISOString(), tripId, version);
      stored = this.get(tripId, version);
    }
    const directory = path.join(this.root, tripId);
    mkdirSync(directory, { recursive: true });
    const writeOnce = (filename: string, data: string | Buffer) => {
      try {
        writeFileSync(path.join(directory, filename), data, { flag: "wx" });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
    };
    writeOnce(stored.filename, Buffer.from(stored.pdf!));
    writeOnce(
      stored.filename.replace(/\.pdf$/, ".json"),
      JSON.stringify(
        {
          meta: {
            tripId: stored.tripId,
            version: stored.version,
            filename: stored.filename,
            createdAt: stored.createdAt,
            parentVersion: stored.parentVersion,
            snapshotHash: stored.snapshotHash,
            chainHash: stored.chainHash,
            pdfHash: stored.pdfHash,
          },
          snapshot: JSON.parse(stored.snapshot),
        },
        null,
        2,
      ),
    );
    return { bytes: Buffer.from(stored.pdf!), filename: stored.filename };
  }
}
