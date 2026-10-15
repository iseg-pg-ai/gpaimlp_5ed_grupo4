import { enrichRecords, PortalPythonError } from "@/lib/python-portal";
import { publicOrigin, jsonError, noStoreHeaders } from "@/lib/server-http";
import { CatalogStore, CatalogConflict, warehouseRoot } from "@/lib/catalog-store";
import { categories } from "@/lib/catalog-schema";
import { readFileSync } from "node:fs";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const store = new CatalogStore();
  try {
    await store.importWarehouse();
    const id = new URL(request.url).searchParams.get("id");
    if (id) return Response.json(await store.history(id), { headers: noStoreHeaders });
    const published = new Map<string, number>();
    for (const category of categories) {
      for (const line of readFileSync(path.join(warehouseRoot(), `${category}.jsonl`), "utf8")
        .split(/\r?\n/)
        .filter(Boolean)) {
        const row = JSON.parse(line);
        if (row._catalog_status === "approved")
          published.set(row._catalog_id, row._catalog_revision);
      }
    }
    const records = await enrichRecords(warehouseRoot(), await store.list());
    return Response.json(
      records.map((record) => ({
        ...record,
        published: record.status === "approved" && published.get(record.id) === record.revision,
      })),
      { headers: noStoreHeaders },
    );
  } catch {
    return jsonError(
      "Não foi possível ler o catálogo. Verifique o warehouse e execute o ETL inicial.",
      503,
    );
  }
}
export async function POST(request: Request) {
  if (request.headers.get("origin") && request.headers.get("origin") !== publicOrigin(request.url))
    return jsonError("Origem inválida.", 403);
  let input;
  try {
    const body = await request.text();
    if (body.length > 100000) return jsonError("Registo demasiado grande.", 413);
    input = JSON.parse(body);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Registo inválido.", 400);
  }
  const store = new CatalogStore();
  try {
    return Response.json(await store.save(input), { headers: noStoreHeaders });
  } catch (e) {
    return jsonError(
      e instanceof Error ? e.message : "Não foi possível guardar.",
      e instanceof CatalogConflict
        ? 409
        : e instanceof PortalPythonError && e.code !== "CATALOG_INVALID"
          ? 503
          : 400,
    );
  }
}
