import path from "node:path";
import { portalRequest, PortalPythonError } from "./python-portal.ts";
import {
  emptyFields,
  validateCatalogInput,
  type CatalogRecord,
  type Category,
} from "./catalog-schema.ts";

export const projectRoot = () => path.resolve(process.cwd(), "..");
export const dataRoot = () => process.env.BLU_DATA_DIR ?? path.join(projectRoot(), "data");
export const catalogRoot = () => path.join(dataRoot(), "portal");
export const warehouseRoot = () =>
  process.env.BLU_WAREHOUSE_DIR ?? path.join(projectRoot(), "warehouse");
export const legacyId = (category: Category, row: Record<string, unknown>) =>
  portalRequest<string>("catalog-id", "", { category, row });
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
  async save(input: unknown): Promise<CatalogRecord> {
    validateCatalogInput(input);
    const allowed = emptyFields();
    const normalized = {
      ...input,
      fields: Object.fromEntries(
        Object.entries(input.fields)
          .filter(([key]) => Object.hasOwn(allowed, key))
          .map(([key, value]) => [key, value.trim()]),
      ),
    };
    try {
      return await portalRequest<CatalogRecord>("catalog-save", this.root, { input: normalized });
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
  publishedFlags(rows: Record<string, unknown>[]) {
    return portalRequest<boolean[]>("catalog-published", this.root, { rows });
  }
}
