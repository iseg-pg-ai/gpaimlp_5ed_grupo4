import { appendFile, mkdir, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";

type Level = "info" | "warning" | "error" | "critical";

export type OperationalEvent = {
  component: string;
  operation: string;
  outcome: string;
  level?: Level;
  user?: string;
  module?: string;
  details?: string;
  message?: string;
  stack?: string;
  durationMs?: number;
  errorCode?: string;
  httpStatus?: number;
};

const MAX_BYTES = 2_000_000;
const ROTATED_FILES = 3;
let writeQueue: Promise<void> = Promise.resolve();
const telemetryRoot = () =>
  process.env.BLU_TELEMETRY_DIR ?? path.resolve(process.cwd(), "../monitoring/runtime");

function clean(value: string, maximum = 80) {
  return value.replace(/[^A-Za-z0-9_.:/-]/g, "_").slice(0, maximum);
}

function redact(value: string, maximum = 500) {
  return value
    .replace(/(password|token|secret|authorization|cookie)\s*[:=]\s*\S+/gi, "$1=[REDACTED]")
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/https?:\/\/\S+/gi, "[URL]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[EMAIL]")
    .replace(/(["']).{3,}?\1/g, "[VALUE]")
    .replace(/\b\d{9,}\b/g, "[NUMBER]")
    .replace(/[\r\n]+/g, " ")
    .slice(0, maximum);
}

async function rotate(file: string) {
  for (let index = ROTATED_FILES; index >= 1; index -= 1) {
    const source = index === 1 ? file : `${file}.${index - 1}`;
    const destination = `${file}.${index}`;
    await unlink(destination).catch(() => undefined);
    await rename(source, destination).catch(() => undefined);
  }
}

async function persistOperationalEvent(event: OperationalEvent) {
  try {
    const directory = telemetryRoot();
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const file = path.join(directory, "portal-events.jsonl");
    const record = {
      at: new Date().toISOString(),
      component: clean(event.component),
      operation: clean(event.operation),
      outcome: clean(event.outcome),
      level: event.level ?? (event.outcome === "success" ? "info" : "error"),
      user: clean(event.user ?? "system", 64),
      module: clean(event.module ?? event.component, 64),
      ...(event.details ? { details: redact(event.details) } : {}),
      ...(event.message ? { message: redact(event.message) } : {}),
      ...(event.stack ? { stack: redact(event.stack, 1200) } : {}),
      ...(Number.isFinite(event.durationMs)
        ? { duration_ms: Math.max(0, Math.round(event.durationMs!)) }
        : {}),
      ...(event.errorCode ? { error_code: clean(event.errorCode) } : {}),
      ...(event.httpStatus ? { http_status: event.httpStatus } : {}),
    };
    const line = `${JSON.stringify(record)}\n`;
    const current = await stat(file).catch(() => null);
    if (current && current.size + Buffer.byteLength(line) > MAX_BYTES) await rotate(file);
    await appendFile(file, line, { encoding: "utf8", mode: 0o600 });
  } catch {
    // A telemetria nunca deve interromper o fluxo operacional.
  }
}

export function recordOperationalEvent(event: OperationalEvent) {
  if (process.env.NEXT_RUNTIME === "edge") return Promise.resolve();
  writeQueue = writeQueue.then(() => persistOperationalEvent(event));
  return writeQueue;
}
