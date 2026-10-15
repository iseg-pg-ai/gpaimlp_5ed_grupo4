import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import type { CatalogRecord } from "./catalog-schema";

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

// Processo local sem shell, serviço HTTP adicional ou dependências do agente.
export function portalRequest<T>(operation: string, root: string, params: object): Promise<T> {
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
      ["-X", "utf8", "-B", "-m", "portal.data", operation, root],
      {
        cwd: repository,
        timeout: 15000,
        maxBuffer: 16 * 1024 * 1024,
        windowsHide: true,
        encoding: "utf8",
      },
      (error, stdout) => {
        if (error)
          return reject(
            new PortalPythonError(
              "DATASET_UNAVAILABLE",
              "Python do portal indisponível. Verifique BLU_PYTHON e a instalação Python.",
            ),
          );
        try {
          const response = JSON.parse(stdout);
          if (!response.ok) return reject(new PortalPythonError(response.code, response.error));
          resolve(response.data);
        } catch {
          reject(
            new PortalPythonError("DATASET_UNAVAILABLE", "Resposta inválida do Python do portal."),
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
export const enrichRecords = (root: string, records: CatalogRecord[]) =>
  portalRequest<CatalogRecord[]>("enrich", root, { records });
