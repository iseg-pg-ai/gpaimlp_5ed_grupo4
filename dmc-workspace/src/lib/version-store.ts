import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { renderPdf, type Snapshot, type VersionMeta } from "./itinerary-pdf.ts";
const hash = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).filter(([,v]) => v !== undefined).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
const slug = (s: string) => s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40).replace(/-$/g, "") || "Sem-nome";
export function checkTripId(id: string) { if (!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,79}$/.test(id)) throw new Error("Identificador da viagem inválido."); }
export class VersionConflict extends Error {}
type Stored = VersionMeta & { snapshot: string; pdf: Uint8Array | null; pdfHash: string | null; exportedAt: string | null };
export class VersionStore {
  db: DatabaseSync;
  root: string;
  constructor(root = process.env.BLU_EXPORT_DIR ?? path.resolve(process.cwd(), "../exports/itineraries")) {
    this.root = root;
    mkdirSync(root, { recursive: true });
    this.db = new DatabaseSync(path.join(root, "history.sqlite"));
    this.db.exec(`PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS versions (
      tripId TEXT NOT NULL, version INTEGER NOT NULL, filename TEXT NOT NULL,
      createdAt TEXT NOT NULL, reason TEXT NOT NULL, snapshotHash TEXT NOT NULL,
      chainHash TEXT NOT NULL, parentVersion INTEGER, snapshot TEXT NOT NULL,
      pdf BLOB, pdfHash TEXT, exportedAt TEXT, PRIMARY KEY(tripId, version));`);
  }
  close() { this.db.close(); }
  list(tripId?: string): VersionMeta[] {
    const columns = "tripId, version, filename, createdAt, reason, snapshotHash, chainHash, parentVersion, exportedAt";
    if (tripId) { checkTripId(tripId); return this.db.prepare(`SELECT ${columns} FROM versions WHERE tripId=? ORDER BY version DESC`).all(tripId) as unknown as VersionMeta[]; }
    return this.db.prepare(`SELECT ${columns} FROM versions ORDER BY createdAt DESC`).all() as unknown as VersionMeta[];
  }
  get(tripId: string, version: number): Stored {
    checkTripId(tripId);
    if (!Number.isSafeInteger(version) || version < 1) throw new Error("Versão inválida.");
    const row = this.db.prepare("SELECT * FROM versions WHERE tripId=? AND version=?").get(tripId, version) as unknown as Stored | undefined;
    if (!row) throw new Error("Versão não encontrada.");
    return row;
  }
  save(tripId: string, snapshot: Snapshot, reason: string, baseVersion: number | null): VersionMeta {
    checkTripId(tripId);
    const serialized = canonical(snapshot), snapshotHash = hash(serialized);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const previous = this.db.prepare("SELECT * FROM versions WHERE tripId=? ORDER BY version DESC LIMIT 1").get(tripId) as unknown as Stored | undefined;
      if (previous?.snapshotHash === snapshotHash) { this.db.exec("COMMIT"); return this.list(tripId)[0]; }
      if ((previous?.version ?? null) !== baseVersion) throw new VersionConflict("Existe uma versão mais recente desta viagem. Reabra a versão guardada antes de alterar o roteiro.");
      const version = (previous?.version ?? 0) + 1, createdAt = new Date().toISOString();
      const filename = `BLU_${slug(snapshot.brief.customerName)}_${slug(snapshot.brief.destination)}_${snapshot.brief.startDate}_a_${snapshot.brief.endDate}_v${String(version).padStart(3,"0")}_${tripId}.pdf`;
      const chainHash = hash(`${previous?.chainHash ?? ""}|${snapshotHash}|${tripId}|${version}|${createdAt}`);
      this.db.prepare("INSERT INTO versions (tripId,version,filename,createdAt,reason,snapshotHash,chainHash,parentVersion,snapshot) VALUES (?,?,?,?,?,?,?,?,?)").run(tripId,version,filename,createdAt,reason,snapshotHash,chainHash,previous?.version ?? null,serialized);
      this.db.exec("COMMIT");
      return { tripId,version,filename,createdAt,reason,snapshotHash,chainHash,parentVersion: previous?.version ?? null };
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  async pdf(tripId: string, version: number) {
    let stored = this.get(tripId, version);
    if (!stored.pdf) {
      const bytes = await renderPdf(JSON.parse(stored.snapshot), stored);
      this.db.prepare("UPDATE versions SET pdf=?, pdfHash=?, exportedAt=? WHERE tripId=? AND version=? AND pdf IS NULL").run(bytes, hash(bytes), new Date().toISOString(), tripId, version);
      stored = this.get(tripId, version);
    }
    const directory = path.join(this.root, tripId);
    mkdirSync(directory, { recursive: true });
    const writeOnce = (filename: string, data: string | Buffer) => {
      try { writeFileSync(path.join(directory, filename), data, { flag: "wx" }); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    };
    writeOnce(stored.filename, Buffer.from(stored.pdf!));
    writeOnce(stored.filename.replace(/\.pdf$/, ".json"), JSON.stringify({ meta: { tripId: stored.tripId, version: stored.version, filename: stored.filename, createdAt: stored.createdAt, parentVersion: stored.parentVersion, snapshotHash: stored.snapshotHash, chainHash: stored.chainHash, pdfHash: stored.pdfHash }, snapshot: JSON.parse(stored.snapshot) }, null, 2));
    return { bytes: Buffer.from(stored.pdf!), filename: stored.filename };
  }
}
