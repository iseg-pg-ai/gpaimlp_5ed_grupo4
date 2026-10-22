import { CatalogStore } from "../src/lib/catalog-store.ts";
import { syncPendingCatalog } from "../src/lib/catalog-persistence.ts";
import { VersionStore } from "../src/lib/version-store.ts";
import { syncPendingVersions } from "../src/lib/version-persistence.ts";

const catalog = new CatalogStore();
const catalogCount = await syncPendingCatalog(catalog);
const versions = new VersionStore();
let versionCount;
try {
  versionCount = syncPendingVersions(versions).synchronized;
} finally {
  versions.close();
}

console.log(
  JSON.stringify({ status: "ready", synchronized: { catalog: catalogCount, versions: versionCount } }),
);
