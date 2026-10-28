// Coordena o acesso ao catálogo operacional e propaga conflitos em vez de substituir
// revisões silenciosamente.
import path from "node:path";
import type { Catalog } from "./curation";
import { portalRequest, PortalPythonError } from "./python-portal.ts";
import { emptyFields, validateCatalogInput, type CatalogRecord } from "./catalog-schema.ts";

export const projectRoot = () => path.resolve(process.cwd(), "..");
export const dataRoot = () =>
  path.resolve(/* turbopackIgnore: true */ projectRoot(), process.env.BLU_DATA_DIR ?? "data");
export const catalogRoot = () => path.join(dataRoot(), "portal");
export const warehouseRoot = () =>
  path.resolve(
    /* turbopackIgnore: true */ projectRoot(),
    process.env.BLU_WAREHOUSE_DIR ?? "warehouse",
  );
export class CatalogConflict extends Error {}

// As ligações SQLite pertencem ao processo Python e fecham no fim de cada operação.
export class CatalogStore {
  root: string;
  constructor(root = catalogRoot()) {
    this.root = root;
  }
  list() {
    return portalRequest<CatalogRecord[]>("catalog-list", this.root, {});
  }
  history(id: string) {
    return portalRequest<CatalogRecord[]>("catalog-history", this.root, { id });
  }
  importWarehouse(warehouse = warehouseRoot()) {
    return portalRequest<void>("catalog-import", this.root, { warehouse });
  }
  async save(input: unknown, operationId?: string): Promise<CatalogRecord> {
    validateCatalogInput(input);
    const allowed = emptyFields();
    const normalized = {
      ...input,
      reason: input.reason.trim(),
      fields: Object.fromEntries(
        Object.entries(input.fields)
          .filter(([key]) => Object.hasOwn(allowed, key))
          .map(([key, value]) => [key, value.trim()]),
      ),
    };
    try {
      return await portalRequest<CatalogRecord>("catalog-save", this.root, {
        input: normalized,
        operationId,
      });
    } catch (error) {
      if (error instanceof PortalPythonError && error.code === "CATALOG_CONFLICT")
        throw new CatalogConflict(error.message);
      throw error;
    }
  }
  async isPublished(row: Record<string, unknown>) {
    const [published] = await portalRequest<boolean[]>("catalog-published", this.root, {
      rows: [row],
    });
    return published;
  }
}

export function loadPublishedCatalog(): Promise<Catalog> {
  return portalRequest("catalog-load-published", catalogRoot(), {
    warehouse: warehouseRoot(),
    overrides: path.join(projectRoot(), "config/curation_rule_overrides.json"),
  });
}
