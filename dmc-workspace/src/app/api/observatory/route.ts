// Endpoint: fornece os dados analíticos do Observatório integrado sem permitir escrita no
// warehouse.
import { portalRequest } from "@/lib/python-portal";
import { warehouseRoot } from "@/lib/catalog-store";
import { jsonError, noStoreHeaders } from "@/lib/server-http";
import type { ObservatoryData } from "@/lib/observatory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return Response.json(await portalRequest<ObservatoryData>("observatory", warehouseRoot(), {}), {
      headers: noStoreHeaders,
    });
  } catch {
    return jsonError(
      "A entrega analítica está indisponível. Pode continuar a gerir o catálogo.",
      503,
      noStoreHeaders,
    );
  }
}
