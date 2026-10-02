// Real Node source -> Python ETL -> itinerary generation, in isolated directories.
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  readdirSync,
  readFileSync,
  rmSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { CatalogStore } from "../src/lib/catalog-store.ts";
import { emptyMatching } from "../src/lib/catalog-matching.ts";
import { emptyFields } from "../src/lib/catalog-schema.ts";
import { generateItinerary } from "../src/lib/curation.ts";
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
  const workbook = readdirSync(path.join(project, "data")).find((f) => f.endsWith(".xlsx"));
  copyFileSync(path.join(project, "data", workbook), path.join(data, workbook));
  const store = new CatalogStore(path.join(data, "portal"));
  let record;
  try {
    record = store.save({
      category: "atracoes",
      status: "approved",
      baseRevision: null,
      reason: "Integration test",
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
  } finally {
    store.close();
  }
  const run = () =>
    execFileSync(
      python,
      ["-B", "-m", "etl.pipeline", "--data-dir", data, "--output-dir", warehouse],
      { cwd: project, windowsHide: true, stdio: "pipe" },
    );
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
  assert.equal(row._catalog_status, "approved");
  assert.deepEqual(row._matching, record.matching);
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
  const reopened = new CatalogStore(path.join(data, "portal"));
  try {
    reopened.save({ ...record, status: "inactive", baseRevision: 1, reason: "Inactive test" });
    assert.equal(reopened.isPublished(row), false);
  } finally {
    reopened.close();
  }
  run();
  assert.equal(generateItinerary(brief, readCatalog()).itinerary.flatMap((d) => d.items).length, 0);
  console.log("Catalog source -> ETL -> approved generation -> inactivation OK");
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
