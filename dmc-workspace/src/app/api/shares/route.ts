import { isLocale } from "@/lib/locales";
import { jsonError, noStoreHeaders } from "@/lib/api-response";
import { checkTripId, VersionStore, type ShareMethod } from "@/lib/version-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  let body: {
    tripId: string;
    version: number;
    locale: string;
    method: ShareMethod;
    recipient: string;
  };
  try {
    const raw = await request.text();
    if (raw.length > 10000) return jsonError("Pedido demasiado grande.", 413);
    body = JSON.parse(raw);
    checkTripId(body.tripId);
    if (!Number.isSafeInteger(body.version) || body.version < 1)
      throw new Error("Versão inválida.");
    if (!isLocale(body.locale)) throw new Error("Idioma inválido.");
    if (!(["document", "link"] as const).includes(body.method))
      throw new Error("Forma de partilha inválida.");
    body.recipient = body.recipient.trim();
    if (body.recipient.length > 320 || !emailPattern.test(body.recipient))
      throw new Error("Email do destinatário inválido.");
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Pedido inválido.", 400);
  }

  const store = new VersionStore();
  try {
    await store.localizedPdf(body.tripId, body.version, body.locale);
    const share = store.createShare(
      body.tripId,
      body.version,
      body.locale,
      body.method,
      body.recipient,
    );
    const configuredOrigin = process.env.BLU_PUBLIC_URL?.replace(/\/$/, "");
    const origin = configuredOrigin || new URL(request.url).origin;
    const path =
      share.method === "document" ? `/api/shares/${share.token}/document` : `/share/${share.token}`;
    return Response.json(
      {
        shareUrl: `${origin}${path}`,
        recipient: share.recipient,
        version: share.version,
        locale: share.locale,
        method: share.method,
      },
      { status: 201, headers: noStoreHeaders },
    );
  } catch (error) {
    console.error("Proposal sharing failed", error);
    return jsonError(
      error instanceof Error && error.message.includes("não encontrada")
        ? error.message
        : "Não foi possível preparar a partilha.",
      error instanceof Error && error.message.includes("não encontrada") ? 404 : 500,
      noStoreHeaders,
    );
  } finally {
    store.close();
  }
}
