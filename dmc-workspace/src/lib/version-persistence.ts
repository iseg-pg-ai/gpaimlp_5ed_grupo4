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
import type { Snapshot, VersionMeta } from "./itinerary-pdf.ts";
import { canonicalSnapshot, validateSnapshot } from "./snapshot-validation.ts";
import { checkTripId, VersionConflict, VersionStore } from "./version-store.ts";

export type PendingVersionWrite = {
  schemaVersion: 2;
  operationId: string;
  operationType: "version.save";
  entity: string;
  syncState: "pending";
  createdAt: string;
  tripId: string;
  snapshot: Snapshot;
  reason: "generated" | "edited" | "export";
  baseVersion: number | null;
};

export type DurableVersionResult =
  | { queued: false; record: VersionMeta; synchronized: number }
  | { queued: true; operationId: string; expectedVersion: number };

const versionRoot = () =>
  process.env.BLU_EXPORT_DIR ?? path.resolve(process.cwd(), "../exports/itineraries");

export const operationalRoot = () => {
  if (process.env.BLU_OPERATIONAL_DIR) return path.resolve(process.env.BLU_OPERATIONAL_DIR);
  return path.join(
    path.dirname(path.resolve(/* turbopackIgnore: true */ versionRoot())),
    "portal-persistence",
  );
};

const pendingRoot = (root: string) => path.join(root, "pending-versions");

function operationId(
  input: Pick<PendingVersionWrite, "tripId" | "snapshot" | "reason" | "baseVersion">,
) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        tripId: input.tripId,
        snapshot: canonicalSnapshot(input.snapshot),
        reason: input.reason,
        baseVersion: input.baseVersion,
      }),
    )
    .digest("hex");
}

function validatePending(value: unknown): asserts value is PendingVersionWrite {
  if (!value || typeof value !== "object") throw new Error("Operação pendente inválida.");
  const item = value as PendingVersionWrite;
  if (
    ![1, 2].includes(item.schemaVersion) ||
    !/^[a-f0-9]{64}$/.test(item.operationId) ||
    !Number.isFinite(Date.parse(item.createdAt)) ||
    !["generated", "edited", "export"].includes(item.reason) ||
    (item.baseVersion !== null && (!Number.isSafeInteger(item.baseVersion) || item.baseVersion < 1))
  )
    throw new Error("Operação pendente inválida.");
  if (
    item.schemaVersion === 2 &&
    (item.operationType !== "version.save" ||
      item.entity !== item.tripId ||
      item.syncState !== "pending")
  )
    throw new Error("Metadados da operação pendente inválidos.");
  checkTripId(item.tripId);
  validateSnapshot(item.snapshot);
  if (
    operationId({
      tripId: item.tripId,
      snapshot: item.snapshot,
      reason: item.reason,
      baseVersion: item.baseVersion,
    }) !== item.operationId
  )
    throw new Error("Integridade da operação pendente inválida.");
}

export function queuePendingVersion(item: PendingVersionWrite, root = operationalRoot()) {
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

export function syncPendingVersions(store: VersionStore, root = operationalRoot()) {
  const directory = pendingRoot(root);
  if (!existsSync(directory)) return { synchronized: 0, pending: 0 };
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
        a.item.tripId.localeCompare(b.item.tripId) ||
        (a.item.baseVersion ?? -1) - (b.item.baseVersion ?? -1) ||
        a.item.createdAt.localeCompare(b.item.createdAt),
    );
  let synchronized = 0;
  for (const { file, item } of entries) {
    store.save(
      item.tripId,
      item.snapshot,
      item.reason,
      item.baseVersion,
      undefined,
      item.operationId,
    );
    unlinkSync(file);
    synchronized += 1;
  }
  return { synchronized, pending: entries.length - synchronized };
}

export function persistVersion(
  input: Pick<PendingVersionWrite, "tripId" | "snapshot" | "reason" | "baseVersion">,
  options: { versionRoot?: string; operationalRoot?: string } = {},
): DurableVersionResult {
  checkTripId(input.tripId);
  validateSnapshot(input.snapshot);
  const id = operationId(input);
  const item: PendingVersionWrite = {
    schemaVersion: 2,
    operationId: id,
    operationType: "version.save",
    entity: input.tripId,
    syncState: "pending",
    createdAt: new Date().toISOString(),
    ...input,
  };
  let store: VersionStore | undefined;
  try {
    store = new VersionStore(options.versionRoot ?? versionRoot());
    const synchronized = syncPendingVersions(store, options.operationalRoot);
    const record = store.save(
      input.tripId,
      input.snapshot,
      input.reason,
      input.baseVersion,
      undefined,
      id,
    );
    return { queued: false, record, synchronized: synchronized.synchronized };
  } catch (error) {
    if (error instanceof VersionConflict) throw error;
    queuePendingVersion(item, options.operationalRoot);
    return {
      queued: true,
      operationId: id,
      expectedVersion: (input.baseVersion ?? 0) + 1,
    };
  } finally {
    store?.close();
  }
}
