// Contrato do portal → SQLite Python → ETL → geração, em diretórios isolados.
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { CatalogStore } from "../src/lib/catalog-store.ts";
import { emptyMatching } from "../src/lib/catalog-matching.ts";
import { emptyFields } from "../src/lib/catalog-schema.ts";
import { generateItinerary } from "../src/lib/curation.ts";
import { applyConfirmation, initialConfirmation } from "../src/lib/activity-confirmation.ts";
import { VersionStore } from "../src/lib/version-store.ts";
const project = fileURLToPath(new URL("../../", import.meta.url));
const temporary = mkdtempSync(path.join(tmpdir(), "blu-catalog-etl-"));
const data = path.join(temporary, "data");
const warehouse = path.join(temporary, "warehouse");
mkdirSync(data);
const venv = path.join(
  project,
  ".venv",
  process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
);
const python = process.env.BLU_PYTHON ?? (existsSync(venv) ? venv : "python");
try {
  execFileSync(python, ["scripts/create_ci_etl_fixture.py", "--output", data], {
    cwd: project,
    windowsHide: true,
    stdio: "pipe",
  });
  const store = new CatalogStore(path.join(data, "portal"));
  let record;

  record = await store.save({
    category: "atracoes",
    subcategory: "Museu e galeria",
    operational: {
      latitude: "38.71",
      longitude: "-9.13",
      closures: "Segunda-feira",
      observations: "Reserva prévia",
      reservations: "Obrigatória",
    },
    status: "approved",
    baseRevision: null,
    reason: "Integration test",
    pricing: { amount: "12,50", currency: "EUR", unit: "person", status: "estimated" },
    matching: {
      ...emptyMatching(),
      interests: ["Culture & Heritage"],
      children: "allowed",
      food: "no",
      pricePerPerson: 10,
    },
    fields: {
      ...emptyFields(),
      name: "Jardim de teste",
      location: "Lisboa",
      description: "Passeio cultural",
      duration: "60 min",
      price: "10 EUR por pessoa",
      accessibility: "Entrada sem degraus",
      source: "Fornecedor",
      effort: "Baixo",
    },
  });

  const run = () => {
    execFileSync(
      python,
      ["-B", "-m", "etl.pipeline", "--data-dir", data, "--output-dir", warehouse],
      { cwd: project, windowsHide: true, stdio: "pipe" },
    );
    execFileSync(python, ["scripts/check_warehouse_release.py", "--warehouse", warehouse], {
      cwd: project,
      windowsHide: true,
      stdio: "pipe",
    });
  };
  const readCatalog = () =>
    Object.fromEntries(
      ["atracoes", "experiencias", "restaurantes", "curation_rules"].map((name) => [
        name,
        readFileSync(path.join(warehouse, `${name}.jsonl`), "utf8")
          .split(/\r?\n/)
          .filter(Boolean)
          .map(JSON.parse),
      ]),
    );
  run();
  const catalog = readCatalog();
  const row = catalog.atracoes.find((r) => r._catalog_id === record.id);
  assert.equal(row._catalog_revision, 1);
  assert.equal(row.subcategoria, "Museu e galeria");
  assert.equal(row.latitude, 38.71);
  assert.equal(row.dias_de_encerramento, "Segunda-feira");
  assert.equal(row.observacoes, "Reserva prévia");
  assert.equal(row._catalog_status, "approved");
  assert.deepEqual(row._matching, { ...record.matching, pricePerPerson: 12.5 });
  assert.deepEqual(row._pricing, record.pricing);
  assert.match(row.preco_da_atracao, /12.50 EUR/);
  const brief = JSON.parse(
    readFileSync(new URL("./browser/fixture.json", import.meta.url), "utf8"),
  ).brief;
  Object.assign(brief, {
    childrenAges: "",
    specialOccasion: "",
    notes: "",
    accommodation: "Boutique",
    diningPace: "Relaxed Dining (~90m)",
    destination: "Lisboa",
  });
  const items = generateItinerary(brief, catalog).itinerary.flatMap((d) => d.items);
  assert.deepEqual(
    items.map((i) => i.id),
    [`atracoes:${record.id}`],
  );
  const generated = generateItinerary(brief, catalog);
  const snapshot = { brief, ...generated };
  const confirmation = initialConfirmation(snapshot.itinerary[0].items[0]);
  Object.assign(confirmation, {
    status: "confirmed",
    time: "10:00",
    location: "Lisboa",
    price: "12,50 EUR por pessoa",
    notes: "Confirmação sintética do teste isolado",
    confirmedAt: "2026-10-24T10:00:00Z",
  });
  confirmation.checks = confirmation.checks.map((check) => ({
    ...check,
    resolved: true,
    details: "Validado no cenário sintético",
  }));
  snapshot.itinerary[0].items[0] = applyConfirmation(snapshot.itinerary[0].items[0], confirmation);
  const versions = new VersionStore(path.join(temporary, "exports"));
  try {
    const saved = versions.save("ci-lifecycle", snapshot, "generated", null);
    assert.equal(saved.version, 1);
    const pdf = await versions.pdf("ci-lifecycle", 1);
    assert.equal(pdf.bytes.subarray(0, 5).toString("ascii"), "%PDF-");
    assert.deepEqual(versions.get("ci-lifecycle", 1).snapshotHash, saved.snapshotHash);
  } finally {
    versions.close();
  }
  const reopened = new CatalogStore(path.join(data, "portal"));

  await reopened.save({ ...record, status: "inactive", baseRevision: 1, reason: "Inactive test" });
  assert.equal(await reopened.isPublished(row), false);

  run();
  assert.equal(generateItinerary(brief, readCatalog()).itinerary.flatMap((d) => d.items).length, 0);
  console.log(
    "Approved catalog -> ETL -> generation -> confirmation -> version -> PDF -> inactivation OK",
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
