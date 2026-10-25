import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { recordOperationalEvent } from "../src/lib/operational-telemetry.ts";

test("telemetria persiste campos técnicos e remove dados sensíveis", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "blu-telemetry-"));
  process.env.BLU_TELEMETRY_DIR = directory;
  try {
    await recordOperationalEvent({
      component: "portal",
      operation: "api_request",
      outcome: "failed",
      level: "error",
      user: "sessao:fixture",
      module: "api:catalog",
      details: "POST /api/catalog",
      message: "password=segredo cliente@example.test token=abc123",
      stack: 'Error: "conteúdo privado" at https://example.test/path?token=secret',
      httpStatus: 500,
    });
    const record = JSON.parse(await readFile(path.join(directory, "portal-events.jsonl"), "utf8"));
    assert.equal(record.user, "sessao:fixture");
    assert.equal(record.module, "api:catalog");
    assert.equal(record.http_status, 500);
    assert.doesNotMatch(
      JSON.stringify(record),
      /segredo|cliente@example|abc123|conteúdo privado|example\.test/,
    );
  } finally {
    delete process.env.BLU_TELEMETRY_DIR;
    await rm(directory, { recursive: true, force: true });
  }
});
