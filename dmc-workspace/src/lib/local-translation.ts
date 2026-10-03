import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { TranslationError } from "./translation-error.ts";
import path from "node:path";
import { createInterface } from "node:readline";
import type { Locale } from "./locales";
export type TranslationItem = { text: string; source: "pt" | "en" };
type Pending = {
  resolve: (texts: string[]) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};
type Worker = {
  revision: number;
  child: ChildProcessWithoutNullStreams;
  next: number;
  pending: Map<number, Pending>;
};
const globalWorker = globalThis as typeof globalThis & { bluTranslationWorker?: Worker };
function getWorker(): Worker {
  if (
    globalWorker.bluTranslationWorker?.revision === 3 &&
    !globalWorker.bluTranslationWorker.child.killed
  )
    return globalWorker.bluTranslationWorker;
  globalWorker.bluTranslationWorker?.child.kill();
  const root = path.resolve(process.cwd(), "..");
  const python =
    process.env.BLU_TRANSLATION_PYTHON ??
    path.join(root, ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
  if (path.isAbsolute(python) && !existsSync(/* turbopackIgnore: true */ python))
    throw new TranslationError("PYTHON_UNAVAILABLE");
  // Python and its models are installed separately on the host, not bundled by Next.
  const child = spawn(
    /* turbopackIgnore: true */ python,
    ["-B", path.join(root, "translations/worker.py")],
    { cwd: root, windowsHide: true, stdio: "pipe" },
  );
  const worker: Worker = { revision: 3, child, next: 1, pending: new Map() };
  globalWorker.bluTranslationWorker = worker;
  let failed = false;
  let stderr = "";
  const fail = (code = "TRANSLATION_FAILED") => {
    if (failed) return;
    failed = true;
    if (globalWorker.bluTranslationWorker === worker) globalWorker.bluTranslationWorker = undefined;
    console.error("Translation worker failed:", code, stderr);
    for (const p of worker.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new TranslationError(code));
    }
    worker.pending.clear();
    child.kill();
  };
  createInterface({ input: child.stdout }).on("line", (line) => {
    try {
      const response = JSON.parse(line);
      if (response.fatal) {
        fail(response.fatal);
        return;
      }
      const pending = worker.pending.get(response.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      worker.pending.delete(response.id);
      if (response.error) {
        console.error("Translation request failed:", response.code, response.error);
        pending.reject(new TranslationError(response.code));
      } else if (
        Array.isArray(response.texts) &&
        response.texts.every((text: unknown) => typeof text === "string")
      )
        pending.resolve(response.texts);
      else pending.reject(new TranslationError("TRANSLATION_FAILED"));
    } catch {
      /* Non-protocol diagnostics do not complete requests. */
    }
  });
  child.stderr.on("data", (chunk) => {
    stderr = (stderr + chunk.toString()).slice(-8000);
  });
  child.stdin.on("error", () => fail());
  child.on("error", (error) =>
    fail(
      (error as NodeJS.ErrnoException).code === "ENOENT"
        ? "PYTHON_UNAVAILABLE"
        : "TRANSLATION_FAILED",
    ),
  );
  child.on("close", () => fail());
  return worker;
}
export function translateLocal(items: TranslationItem[], target: Locale): Promise<string[]> {
  if (!items.length) return Promise.resolve([]);
  if (items.every((item) => item.source === target))
    return Promise.resolve(items.map((item) => item.text));
  const worker = getWorker(),
    id = worker.next++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      worker.pending.delete(id);
      reject(new TranslationError("TRANSLATION_TIMEOUT"));
    }, 300000);
    worker.pending.set(id, { resolve, reject, timer });
    worker.child.stdin.write(JSON.stringify({ id, items, target }) + "\n", (error) => {
      if (error) {
        clearTimeout(timer);
        worker.pending.delete(id);
        reject(new TranslationError("TRANSLATION_FAILED"));
      }
    });
  });
}
