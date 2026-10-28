// Regista alterações para publicação posterior, separando a escrita local da confirmação
// remota.
import { existsSync, linkSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

export type DataChangeKind = "catalog.save" | "version.save";

/** Regista uma alteração SQL confirmada para transporte idempotente ao S3. */
export function enqueueDataChange(
  kind: DataChangeKind,
  operationId: string,
  entity: string,
  payload: unknown,
  root: string,
) {
  if (!/^[a-f0-9]{64}$/.test(operationId)) throw new Error("Operação S3 inválida.");
  const directory = path.join(root, "data-s3-outbox");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const target = path.join(directory, `${operationId}.json`);
  if (existsSync(target)) return target;
  const event = {
    schemaVersion: 1,
    operationId,
    operationType: kind,
    entity,
    occurredAt: new Date().toISOString(),
    syncState: "pending",
    payload,
  };
  const temporary = path.join(directory, `.${operationId}.${process.pid}.tmp`);
  writeFileSync(temporary, `${JSON.stringify(event)}\n`, { flag: "wx", mode: 0o600 });
  try {
    linkSync(temporary, target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  } finally {
    unlinkSync(temporary);
  }
  return target;
}
