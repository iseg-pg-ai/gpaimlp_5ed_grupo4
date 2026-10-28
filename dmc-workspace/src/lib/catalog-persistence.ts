// Mantém a fila durável de escritas do catálogo e reenvia pendências sem perder o controlo
// de versão.
import { createHash } from "node:crypto";
import {
  existsSync,
  linkSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { validateCatalogInput, type CatalogInput, type CatalogRecord } from "./catalog-schema.ts";
import { CatalogConflict, CatalogStore, catalogRoot } from "./catalog-store.ts";
import { PortalPythonError } from "./python-portal.ts";
import { enqueueDataChange } from "./data-s3-outbox.ts";
import { operationalRoot } from "./version-persistence.ts";

type PendingCatalogWrite = {
  schemaVersion: 2;
  operationId: string;
  operationType: "catalog.save";
  entity: string;
  syncState: "pending";
  baseVersion: number | null;
  createdAt: string;
  input: CatalogInput;
};

const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  return JSON.stringify(value);
};

const operationId = (input: unknown) => createHash("sha256").update(canonical(input)).digest("hex");
const pendingRoot = (root: string) => path.join(root, "pending-catalog");

function validatePending(value: unknown): asserts value is PendingCatalogWrite {
  if (!value || typeof value !== "object") throw new Error("Operação de catálogo inválida.");
  const item = value as PendingCatalogWrite;
  validateCatalogInput(item.input);
  if (
    ![1, 2].includes(item.schemaVersion) ||
    !/^[a-f0-9]{64}$/.test(item.operationId) ||
    !Number.isFinite(Date.parse(item.createdAt)) ||
    operationId(item.input) !== item.operationId
  )
    throw new Error("Integridade da operação de catálogo inválida.");
  if (
    item.schemaVersion === 2 &&
    (item.operationType !== "catalog.save" ||
      item.syncState !== "pending" ||
      item.entity !== (item.input.id ?? `new:${item.input.category}`) ||
      item.baseVersion !== item.input.baseRevision)
  )
    throw new Error("Metadados da operação de catálogo inválidos.");
}

function enqueue(item: PendingCatalogWrite, root: string) {
  validatePending(item);
  const directory = pendingRoot(root);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const target = path.join(directory, `${item.operationId}.json`);
  if (existsSync(target)) return target;
  const temporary = path.join(directory, `.${item.operationId}.${process.pid}.tmp`);
  writeFileSync(temporary, `${JSON.stringify(item)}\n`, { flag: "wx", mode: 0o600 });
  try {
    linkSync(temporary, target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  } finally {
    unlinkSync(temporary);
  }
  return target;
}

// Sincronizar pendências com validação e controlo de revisão do catálogo.
export async function syncPendingCatalog(store: CatalogStore, root = operationalRoot()) {
  const directory = pendingRoot(root);
  if (!existsSync(directory)) return 0;
  const entries = readdirSync(directory)
    .filter((name) => /^[a-f0-9]{64}\.json$/.test(name))
    .map((name) => {
      const file = path.join(directory, name);
      const item = JSON.parse(readFileSync(file, "utf8")) as unknown;
      validatePending(item);
      return { file, item };
    })
    .sort(
      (a, b) =>
        (a.item.input.id ?? `new:${a.item.input.category}`).localeCompare(
          b.item.input.id ?? `new:${b.item.input.category}`,
        ) ||
        (a.item.input.baseRevision ?? -1) - (b.item.input.baseRevision ?? -1) ||
        a.item.createdAt.localeCompare(b.item.createdAt),
    );
  for (const { file, item } of entries) {
    const record = await store.save(item.input, item.operationId);
    enqueueDataChange(
      "catalog.save",
      item.operationId,
      item.input.id ?? record.id,
      item.input,
      root,
    );
    unlinkSync(file);
  }
  return entries.length;
}

// Preservar a intenção de escrita quando o destino não permite concluir a operação.
export async function persistCatalog(
  input: unknown,
  options: { catalogRoot?: string; operationalRoot?: string } = {},
): Promise<{ queued: false; record: CatalogRecord } | { queued: true; operationId: string }> {
  validateCatalogInput(input);
  const id = operationId(input);
  const queueRoot = options.operationalRoot ?? operationalRoot();
  const item: PendingCatalogWrite = {
    schemaVersion: 2,
    operationId: id,
    operationType: "catalog.save",
    entity: input.id ?? `new:${input.category}`,
    syncState: "pending",
    baseVersion: input.baseRevision,
    createdAt: new Date().toISOString(),
    input,
  };
  const store = new CatalogStore(options.catalogRoot ?? catalogRoot());
  let pendingFile: string | undefined;
  try {
    await syncPendingCatalog(store, queueRoot);
    // O write-ahead persistente fecha a janela entre o commit SQL e a outbox S3.
    pendingFile = enqueue(item, queueRoot);
    const record = await store.save(input, id);
    enqueueDataChange("catalog.save", id, input.id ?? record.id, input, queueRoot);
    unlinkSync(pendingFile);
    return { queued: false, record };
  } catch (error) {
    if (
      error instanceof CatalogConflict ||
      (error instanceof PortalPythonError && error.code === "CATALOG_INVALID")
    ) {
      if (pendingFile && existsSync(/* turbopackIgnore: true */ pendingFile))
        unlinkSync(pendingFile);
      throw error;
    }
    enqueue(item, queueRoot);
    return { queued: true, operationId: id };
  }
}
