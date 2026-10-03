import { translateLocal } from "@/lib/local-translation";
import { isLocale } from "@/lib/locales";
import { TranslationError } from "@/lib/translation-error";
import { jsonError, noStoreHeaders } from "@/lib/api-response";
export const runtime = "nodejs";
export async function POST(request: Request) {
  let body;
  try {
    const raw = await request.text();
    if (raw.length > 300000) return jsonError("Pedido demasiado grande.", 413);
    body = JSON.parse(raw);
    if (
      !isLocale(body.target) ||
      !Array.isArray(body.items) ||
      body.items.length > 400 ||
      body.items.some(
        (i: { text: unknown; source: unknown }) =>
          !i ||
          typeof i.text !== "string" ||
          i.text.length > 20000 ||
          !["pt", "en"].includes(String(i.source)),
      )
    )
      throw new Error();
  } catch {
    return jsonError("Pedido de tradução inválido.", 400);
  }
  try {
    return Response.json(
      { texts: await translateLocal(body.items, body.target) },
      { headers: noStoreHeaders },
    );
  } catch (error) {
    if (error instanceof TranslationError)
      return Response.json({ error: error.message, code: error.code }, { status: 503 });
    console.error("Translation failed", error);
    return jsonError(
      "Tradução local indisponível. Verifique os modelos linguísticos ou tente novamente.",
      503,
    );
  }
}
