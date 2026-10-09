import { jsonError, noStoreHeaders } from "@/lib/api-response";
import { checkTripId, VersionStore } from "@/lib/version-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  const store = new VersionStore();
  try {
    return Response.json(store.listTrash(), { headers: noStoreHeaders });
  } finally {
    store.close();
  }
}

export async function POST(request: Request) {
  let body: { tripId: string; version: number; action: "trash" | "restore" };
  try {
    const raw = await request.text();
    if (raw.length > 10000) return jsonError("Pedido demasiado grande.", 413);
    body = JSON.parse(raw);
    checkTripId(body.tripId);
    if (!Number.isSafeInteger(body.version) || body.version < 1)
      throw new Error("Versão inválida.");
    if (!(["trash", "restore"] as const).includes(body.action)) throw new Error("Ação inválida.");
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Pedido inválido.", 400);
  }

  const store = new VersionStore();
  try {
    const version =
      body.action === "trash"
        ? store.trashVersion(body.tripId, body.version)
        : store.restoreVersion(body.tripId, body.version);
    return Response.json(version, { headers: noStoreHeaders });
  } catch {
    return jsonError("Versão não encontrada.", 404, noStoreHeaders);
  } finally {
    store.close();
  }
}
