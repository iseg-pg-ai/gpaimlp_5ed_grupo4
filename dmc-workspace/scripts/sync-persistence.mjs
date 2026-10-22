import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { CatalogStore } from "../src/lib/catalog-store.ts";
import { syncPendingCatalog } from "../src/lib/catalog-persistence.ts";
import { VersionStore } from "../src/lib/version-store.ts";
import { operationalRoot, syncPendingVersions } from "../src/lib/version-persistence.ts";

const statusPath = path.join(operationalRoot(), "sync-status.json");
const writeStatus = (payload) => {
  mkdirSync(path.dirname(statusPath), { recursive: true, mode: 0o700 });
  const temporary = `${statusPath}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify({ at: new Date().toISOString(), ...payload })}\n`, {
    mode: 0o600,
  });
  renameSync(temporary, statusPath);
};

try {
  const catalog = new CatalogStore();
  const catalogCount = await syncPendingCatalog(catalog);
  const versions = new VersionStore();
  let versionCount;
  try {
    versionCount = syncPendingVersions(versions).synchronized;
  } finally {
    versions.close();
  }

  const result = { status: "ready", synchronized: { catalog: catalogCount, versions: versionCount } };
  writeStatus(result);
  console.log(JSON.stringify(result));
} catch (error) {
  writeStatus({ status: "failed", errorCode: error?.constructor?.name ?? "Error" });
  throw error;
}
