import { appendFile, mkdir, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";

type Level = "info" | "warning" | "error";

type OperationalEvent = {
  component: string;
  operation: string;
  outcome: string;
  level?: Level;
  durationMs?: number;
  errorCode?: string;
  httpStatus?: number;
};

const MAX_BYTES = 2_000_000;
const ROTATED_FILES = 3;
const telemetryRoot = () =>
  process.env.BLU_TELEMETRY_DIR ?? path.resolve(process.cwd(), "../monitoring/runtime");

function clean(value: string, maximum = 80) {
  return value.replace(/[^A-Za-z0-9_.:/-]/g, "_").slice(0, maximum);
}

async function rotate(file: string) {
  for (let index = ROTATED_FILES; index >= 1; index -= 1) {
    const source = index === 1 ? file : `${file}.${index - 1}`;
    const destination = `${file}.${index}`;
    await unlink(destination).catch(() => undefined);
    await rename(source, destination).catch(() => undefined);
  }
}

export async function recordOperationalEvent(event: OperationalEvent) {
  if (process.env.NEXT_RUNTIME === "edge") return;
  try {
    const directory = telemetryRoot();
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const file = path.join(directory, "portal-events.jsonl");
    const current = await stat(file).catch(() => null);
    if (current && current.size >= MAX_BYTES) await rotate(file);
    const record = {
      at: new Date().toISOString(),
      component: clean(event.component),
      operation: clean(event.operation),
      outcome: clean(event.outcome),
      level: event.level ?? (event.outcome === "success" ? "info" : "error"),
      ...(Number.isFinite(event.durationMs)
        ? { duration_ms: Math.max(0, Math.round(event.durationMs!)) }
        : {}),
      ...(event.errorCode ? { error_code: clean(event.errorCode) } : {}),
      ...(event.httpStatus ? { http_status: event.httpStatus } : {}),
    };
    await appendFile(file, `${JSON.stringify(record)}\n`, { encoding: "utf8", mode: 0o600 });
  } catch {
    // A telemetria nunca deve interromper o fluxo operacional.
  }
}
