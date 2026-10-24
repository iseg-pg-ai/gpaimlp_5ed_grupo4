import { publicUrl, jsonError, noStoreHeaders, publicOrigin } from "@/lib/server-http";
import { isLocale } from "@/lib/locales";

import { checkTripId, VersionStore, type ShareMethod } from "@/lib/version-store";
import { syncOperationalState } from "@/lib/operational-s3";

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
    consent: boolean;
    retentionDays: 7 | 30 | 90;
  };
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== publicOrigin(request.url))
      return jsonError("Origem inválida.", 403, noStoreHeaders);
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
    if (body.consent !== true) throw new Error("Confirme a autorização para partilhar.");
    if (![7, 30, 90].includes(body.retentionDays)) throw new Error("Prazo de acesso inválido.");
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
      body.retentionDays,
    );
    await syncOperationalState();
    const path =
      share.method === "document" ? `/api/shares/${share.token}/document` : `/share/${share.token}`;
    return Response.json(
      {
        shareUrl: publicUrl(path, request.url),
        recipient: share.recipient,
        version: share.version,
        locale: share.locale,
        method: share.method,
        expiresAt: share.expiresAt,
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

export async function DELETE(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== publicOrigin(request.url))
    return jsonError("Origem inválida.", 403, noStoreHeaders);
  try {
    const raw = await request.text();
    if (raw.length > 1000) return jsonError("Pedido demasiado grande.", 413, noStoreHeaders);
    const token = (JSON.parse(raw) as { token?: unknown }).token;
    if (typeof token !== "string") throw new Error("Partilha inválida.");
    const store = new VersionStore();
    try {
      const share = store.revokeShare(token);
      await syncOperationalState();
      return Response.json(share, { headers: noStoreHeaders });
    } finally {
      store.close();
    }
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Pedido inválido.",
      400,
      noStoreHeaders,
    );
  }
}
