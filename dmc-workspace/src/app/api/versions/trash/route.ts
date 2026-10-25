import { jsonError, noStoreHeaders, publicOrigin, publicUrl } from "@/lib/server-http";
import { checkTripId, VersionStore } from "@/lib/version-store";
import { syncOperationalState } from "@/lib/operational-s3";

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
  const isForm =
    request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ===
    "application/x-www-form-urlencoded";
  const origin = request.headers.get("origin");
  if ((isForm && !origin) || (origin && origin !== publicOrigin(request.url)))
    return jsonError("Origem inválida.", 403, noStoreHeaders);
  const history = (error?: "invalid" | "not-found") =>
    new Response(null, {
      status: 303,
      headers: {
        ...noStoreHeaders,
        Location: publicUrl(`/exports${error ? `?versionActionError=${error}` : ""}`, request.url),
      },
    });
  const fail = (message: string, status: number) =>
    isForm
      ? history(status === 404 ? "not-found" : "invalid")
      : jsonError(message, status, noStoreHeaders);
  let body: { tripId: string; version: number; action: "trash" | "restore" };
  try {
    const raw = await request.text();
    if (raw.length > 10000) return fail("Pedido demasiado grande.", 413);
    if (isForm) {
      const form = new URLSearchParams(raw);
      body = {
        tripId: form.get("tripId") ?? "",
        version: Number(form.get("version")),
        action: form.get("action") as "trash" | "restore",
      };
    } else body = JSON.parse(raw);
    checkTripId(body.tripId);
    if (!Number.isSafeInteger(body.version) || body.version < 1)
      throw new Error("Versão inválida.");
    if (!(["trash", "restore"] as const).includes(body.action)) throw new Error("Ação inválida.");
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Pedido inválido.", 400);
  }

  const store = new VersionStore();
  try {
    const version =
      body.action === "trash"
        ? store.trashVersion(body.tripId, body.version)
        : store.restoreVersion(body.tripId, body.version);
    await syncOperationalState();
    return isForm ? history() : Response.json(version, { headers: noStoreHeaders });
  } catch {
    return fail("Versão não encontrada.", 404);
  } finally {
    store.close();
  }
}
