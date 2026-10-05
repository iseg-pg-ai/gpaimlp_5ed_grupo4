import { jsonError, noStoreHeaders } from "@/lib/api-response";
import { checkTripId, VersionStore } from "@/lib/version-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function todayInPortugal() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Lisbon" }).format(new Date());
}

export async function POST(request: Request) {
  let tripIds: string[];
  let confirmedTripIds: string[];
  let confirmedVersions: Array<{ tripId: string; version: number }>;
  try {
    const raw = await request.text();
    if (raw.length > 20000) return jsonError("Pedido demasiado grande.", 413);
    const body = JSON.parse(raw) as {
      tripIds?: unknown;
      confirmedTripIds?: unknown;
      confirmedVersions?: unknown;
    };
    if (!Array.isArray(body.tripIds) || body.tripIds.length > 500)
      throw new Error("Viagens inválidas.");
    tripIds = [...new Set(body.tripIds)];
    if (tripIds.some((id) => typeof id !== "string")) throw new Error("Viagens inválidas.");
    tripIds.forEach(checkTripId);
    confirmedTripIds = Array.isArray(body.confirmedTripIds) ? body.confirmedTripIds : [];
    if (confirmedTripIds.some((id) => typeof id !== "string"))
      throw new Error("Confirmação inválida.");
    confirmedTripIds.forEach(checkTripId);
    confirmedVersions = Array.isArray(body.confirmedVersions)
      ? (body.confirmedVersions as Array<{ tripId: string; version: number }>)
      : [];
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Pedido inválido.", 400);
  }

  const store = new VersionStore();
  try {
    return Response.json(
      store.cleanupExpiredTrash(tripIds, todayInPortugal(), confirmedTripIds, confirmedVersions),
      {
        headers: noStoreHeaders,
      },
    );
  } catch (error) {
    console.error("Trash cleanup failed", error);
    return jsonError("Não foi possível concluir a limpeza automática.", 500, noStoreHeaders);
  } finally {
    store.close();
  }
}
