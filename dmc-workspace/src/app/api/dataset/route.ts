import { datasetTables, sourceRows } from "@/lib/dataset-source";
import { warehouseRoot } from "@/lib/catalog-store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const root = warehouseRoot();
    const tables = datasetTables(root);
    const table = params.get("table") ?? tables[0];
    if (!table) return Response.json({ tables, rows: [], total: 0, page: 1 });
    if (!tables.includes(table))
      return Response.json({ error: "Folha indisponível." }, { status: 400 });
    const query = (params.get("q") ?? "").slice(0, 200).toLocaleLowerCase();
    const rows = sourceRows(root, table).filter(
      (row) => !query || JSON.stringify(row).toLocaleLowerCase().includes(query),
    );
    const requested = Number(params.get("page") ?? 1);
    const page = Math.min(
      Math.max(1, Math.ceil(rows.length / 25)),
      Number.isSafeInteger(requested) && requested > 0 ? requested : 1,
    );
    return Response.json(
      { tables, table, rows: rows.slice((page - 1) * 25, page * 25), total: rows.length, page },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json({ error: "Dataset indisponível. Execute o ETL." }, { status: 503 });
  }
}
