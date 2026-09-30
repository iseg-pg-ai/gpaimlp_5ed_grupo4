import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
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
    globalWorker.bluTranslationWorker?.revision === 2 &&
    !globalWorker.bluTranslationWorker.child.killed
  )
    return globalWorker.bluTranslationWorker;
  globalWorker.bluTranslationWorker?.child.kill();
  const root = path.resolve(process.cwd(), "..");
  const python =
    process.env.BLU_TRANSLATION_PYTHON ??
    path.join(root, ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
  // Python and its models are installed separately on the host, not bundled by Next.
  const child = spawn(
    /* turbopackIgnore: true */ python,
    ["-B", path.join(root, "translations/worker.py")],
    { cwd: root, windowsHide: true, stdio: "pipe" },
  );
  const worker: Worker = { revision: 2, child, next: 1, pending: new Map() };
  globalWorker.bluTranslationWorker = worker;
  createInterface({ input: child.stdout }).on("line", (line) => {
    try {
      const response = JSON.parse(line);
      const pending = worker.pending.get(response.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      worker.pending.delete(response.id);
      if (response.error) pending.reject(new Error(response.error));
      else pending.resolve(response.texts);
    } catch {
      /* Ignore diagnostics; only structured responses complete requests. */
    }
  });
  child.stderr.on("data", () => {});
  const fail = () => {
    if (globalWorker.bluTranslationWorker === worker) globalWorker.bluTranslationWorker = undefined;
    for (const p of worker.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error("Tradução local indisponível. Confirme a instalação dos modelos."));
    }
    worker.pending.clear();
  };
  child.on("error", fail);
  child.on("exit", fail);
  return worker;
}
export function translateLocal(items: TranslationItem[], target: Locale): Promise<string[]> {
  if (!items.length) return Promise.resolve([]);
  const worker = getWorker(),
    id = worker.next++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      worker.pending.delete(id);
      reject(new Error("A tradução excedeu o tempo disponível. Tente novamente."));
    }, 300000);
    worker.pending.set(id, { resolve, reject, timer });
    worker.child.stdin.write(JSON.stringify({ id, items, target }) + "\n", (error) => {
      if (error) {
        clearTimeout(timer);
        worker.pending.delete(id);
        reject(error);
      }
    });
  });
}
