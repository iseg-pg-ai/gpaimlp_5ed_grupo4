import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { recordOperationalEvent } from "./operational-telemetry.ts";

export type Dataset = {
  tables: string[];
  table?: string;
  rows: Record<string, unknown>[];
  total: number;
  page: number;
};
export class PortalPythonError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

function agentProcessTimeoutMs() {
  const seconds = Number(process.env.BLU_AGENT_TIMEOUT_SECONDS ?? "35");
  return Number.isFinite(seconds) && seconds >= 5 && seconds <= 120
    ? (seconds + 20) * 1000
    : 55_000;
}

// Processo local sem shell, serviço HTTP adicional ou dependências do agente.
export function portalRequest<T>(operation: string, root: string, params: object): Promise<T> {
  const started = performance.now();
  const repository = path.resolve(process.cwd(), "..");
  const localPython = path.join(
    repository,
    ".venv",
    process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
  );
  const python =
    process.env.BLU_PYTHON ??
    (existsSync(/* turbopackIgnore: true */ localPython)
      ? localPython
      : process.platform === "win32"
        ? "python"
        : "python3");
  return new Promise((resolve, reject) => {
    const child = execFile(
      /* turbopackIgnore: true */ python,
      operation === "agent-plan" || operation === "agent-compile"
        ? [
            "-X",
            "utf8",
            "-B",
            "-m",
            "blu_ai.planner",
            ...(operation === "agent-compile" ? ["--compile-only"] : []),
          ]
        : ["-X", "utf8", "-B", "-m", "portal.data", operation, root],
      {
        cwd: repository,
        timeout: operation === "agent-plan" ? agentProcessTimeoutMs() : 15_000,
        env: {
          ...process.env,
          PYTHONPATH: [path.join(repository, "src"), process.env.PYTHONPATH]
            .filter(Boolean)
            .join(path.delimiter),
        },
        maxBuffer: 16 * 1024 * 1024,
        windowsHide: true,
        encoding: "utf8",
      },
      (error, stdout) => {
        if (error) {
          void recordOperationalEvent({
            component: "portal-python",
            operation,
            outcome: "failed",
            durationMs: performance.now() - started,
            errorCode: "DATASET_UNAVAILABLE",
          });
          return reject(
            new PortalPythonError(
              operation === "agent-plan" || operation === "agent-compile"
                ? error.killed
                  ? "AGENT_TIMEOUT"
                  : "AGENT_PROCESS_UNAVAILABLE"
                : "DATASET_UNAVAILABLE",
              operation === "agent-plan" || operation === "agent-compile"
                ? "Planeador indisponível. Verifique o grupo agent e a configuração do serviço."
                : "Python do portal indisponível. Verifique BLU_PYTHON e a instalação Python.",
            ),
          );
        }
        try {
          const response = JSON.parse(stdout);
          if (!response.ok) {
            void recordOperationalEvent({
              component: "portal-python",
              operation,
              outcome: "failed",
              durationMs: performance.now() - started,
              errorCode: response.code,
            });
            return reject(new PortalPythonError(response.code, response.error));
          }
          void recordOperationalEvent({
            component: "portal-python",
            operation,
            outcome: "success",
            durationMs: performance.now() - started,
          });
          resolve(response.data);
        } catch {
          void recordOperationalEvent({
            component: "portal-python",
            operation,
            outcome: "failed",
            durationMs: performance.now() - started,
            errorCode: "INVALID_PYTHON_RESPONSE",
          });
          reject(
            new PortalPythonError(
              operation === "agent-plan" || operation === "agent-compile"
                ? "AGENT_INVALID_RESPONSE"
                : "DATASET_UNAVAILABLE",
              "Resposta inválida do Python do portal.",
            ),
          );
        }
      },
    );
    child.stdin?.on("error", () => {
      /* O callback execFile trata o encerramento do processo. */
    });
    child.stdin?.end(JSON.stringify(params));
  });
}
export const queryDataset = (root: string, params: object) =>
  portalRequest<Dataset>("query", root, params);
