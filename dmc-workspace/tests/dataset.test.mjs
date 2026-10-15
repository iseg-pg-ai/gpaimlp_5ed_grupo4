import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { portalRequest, queryDataset } from "../src/lib/python-portal.ts";
import { operationalFromSource, validateOperational } from "../src/lib/catalog-operational.ts";
test("source enrichment preserves curator edits and links reference tariffs by exact ID", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "blu-source-"));
  try {
    writeFileSync(
      path.join(root, "structured_atracoes_base.jsonl"),
      JSON.stringify({ id: "LIS-1", latitude: 38.7, horario: "09h–18h" }),
    );
    writeFileSync(
      path.join(root, "structured_precos_base.jsonl"),
      JSON.stringify({ id: "LIS-1", preco_referencia_eur: 17 }),
    );
    const original = {
      category: "atracoes",
      raw: { id: "LIS-1" },
      fields: { hours: "Horário editado" },
    };
    const [result] = await portalRequest("enrich", root, { records: [original] });
    assert.equal(result.fields.hours, "Horário editado");
    assert.equal(result.sourceData.latitude, 38.7);
    assert.equal(result.sourceData.tarifas_de_referencia[0].preco_referencia_eur, 17);
    assert.deepEqual(original.raw, { id: "LIS-1" });
    assert.equal((await queryDataset(root, {})).tables.length, 2);
    await assert.rejects(queryDataset(root, { table: "../secrets" }), /Folha indisponível/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test("operational data retains explicit unknowns and rejects incomplete coordinates", () => {
  const value = operationalFromSource({
    latitude: 38.7,
    longitude: -9.1,
    dias_de_encerramento: "Segunda",
    observacoes: "Por confirmar",
  });
  assert.doesNotThrow(() => validateOperational(value));
  assert.equal(value.closures, "Segunda");
  assert.throws(() => validateOperational({ ...value, latitude: "91" }));
  assert.throws(() => validateOperational({ ...value, longitude: "" }));
  assert.doesNotThrow(() => validateOperational(operationalFromSource({})));
});

test("missing Python fails explicitly without hanging or falling back to duplicated rules", async () => {
  const previous = process.env.BLU_PYTHON;
  process.env.BLU_PYTHON = path.join(tmpdir(), "blu-no-such-python", "python");
  try {
    await assert.rejects(queryDataset(tmpdir(), {}), /Python do portal indisponível/);
  } finally {
    if (previous === undefined) delete process.env.BLU_PYTHON;
    else process.env.BLU_PYTHON = previous;
  }
});
