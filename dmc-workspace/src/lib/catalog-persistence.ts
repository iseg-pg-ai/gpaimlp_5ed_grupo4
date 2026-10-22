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
import { validateCatalogInput, type CatalogRecord } from "./catalog-schema.ts";
import { CatalogConflict, CatalogStore, catalogRoot } from "./catalog-store.ts";
import { PortalPythonError } from "./python-portal.ts";
import { operationalRoot } from "./version-persistence.ts";

type PendingCatalogWrite = {
  schemaVersion: 1;
  operationId: string;
  createdAt: string;
  input: unknown;
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
    item.schemaVersion !== 1 ||
    !/^[a-f0-9]{64}$/.test(item.operationId) ||
    !Number.isFinite(Date.parse(item.createdAt)) ||
    operationId(item.input) !== item.operationId
  )
    throw new Error("Integridade da operação de catálogo inválida.");
}

function enqueue(item: PendingCatalogWrite, root: string) {
  validatePending(item);
  const directory = pendingRoot(root);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const target = path.join(directory, `${item.operationId}.json`);
  if (existsSync(target)) return;
  const temporary = path.join(directory, `.${item.operationId}.${process.pid}.tmp`);
  writeFileSync(temporary, `${JSON.stringify(item)}\n`, { flag: "wx", mode: 0o600 });
  try {
    linkSync(temporary, target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  } finally {
    unlinkSync(temporary);
  }
}

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
    .sort((a, b) => a.item.createdAt.localeCompare(b.item.createdAt));
  for (const { file, item } of entries) {
    await store.save(item.input, item.operationId);
    unlinkSync(file);
  }
  return entries.length;
}

export async function persistCatalog(
  input: unknown,
  options: { catalogRoot?: string; operationalRoot?: string } = {},
): Promise<{ queued: false; record: CatalogRecord } | { queued: true; operationId: string }> {
  validateCatalogInput(input);
  const id = operationId(input);
  const queueRoot = options.operationalRoot ?? operationalRoot();
  const store = new CatalogStore(options.catalogRoot ?? catalogRoot());
  try {
    await syncPendingCatalog(store, queueRoot);
    return { queued: false, record: await store.save(input, id) };
  } catch (error) {
    if (
      error instanceof CatalogConflict ||
      (error instanceof PortalPythonError && error.code === "CATALOG_INVALID")
    )
      throw error;
    enqueue(
      { schemaVersion: 1, operationId: id, createdAt: new Date().toISOString(), input },
      queueRoot,
    );
    return { queued: true, operationId: id };
  }
}
