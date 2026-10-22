import { validateSnapshot } from "@/lib/snapshot-validation";
import { zipSync } from "fflate";
import { TranslationError } from "@/lib/local-translation";
import { isLocale } from "@/lib/locales";
import { VersionStore, VersionConflict, checkTripId } from "@/lib/version-store";
import { persistVersion, syncPendingVersions } from "@/lib/version-persistence";
import { jsonError, noStoreHeaders } from "@/lib/server-http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { renderItineraryPrompt } from "@/lib/itinerary-prompt";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  let body;
  try {
    const raw = await request.text();
    if (raw.length > 2000000) return jsonError("Roteiro demasiado grande.", 413);
    body = JSON.parse(raw);
    if (typeof body.tripId !== "string") throw new Error("Viagem inválida.");
    checkTripId(body.tripId);
    validateSnapshot(body.snapshot);
    if (!["generated", "edited", "export"].includes(body.reason))
      throw new Error("Motivo inválido.");
    if (
      body.baseVersion !== null &&
      (!Number.isSafeInteger(body.baseVersion) || body.baseVersion < 1)
    )
      throw new Error("Versão de origem inválida.");
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Pedido inválido.", 400);
  }
  try {
    const result = persistVersion({
      tripId: body.tripId,
      snapshot: {
        brief: body.snapshot.brief,
        itinerary: body.snapshot.itinerary,
        pending: body.snapshot.pending,
      },
      reason: body.reason,
      baseVersion: body.baseVersion,
    });
    if (result.queued) return Response.json(result, { status: 202, headers: noStoreHeaders });
    return Response.json(result.record, { headers: noStoreHeaders });
  } catch (e) {
    return jsonError(
      e instanceof VersionConflict
        ? e.message
        : "Não foi possível guardar a versão. Tente novamente.",
      e instanceof VersionConflict ? 409 : 500,
    );
  }
}
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const id = params.get("tripId");
  try {
    if (id !== null) checkTripId(id);
  } catch {
    return jsonError("Viagem inválida.", 400);
  }
  const store = new VersionStore();
  try {
    try {
      syncPendingVersions(store);
    } catch (error) {
      console.error("Pending version synchronization failed", error);
    }
    if (!params.has("version"))
      return Response.json(store.list(id ?? undefined), { headers: noStoreHeaders });
    if (!id) return jsonError("Indique a viagem.", 400);
    const version = Number(params.get("version"));
    let row;
    try {
      row = store.get(id, version);
    } catch {
      return jsonError("Versão não encontrada.", 404);
    }
    const language = params.get("locale") ?? "pt";
    if (!isLocale(language)) return jsonError("Idioma inválido.", 400);
    if (params.get("format") === "prompt") {
      if (row.trashedAt)
        return jsonError(
          "Restaure esta versão do Lixo antes de exportar o TXT.",
          409,
          noStoreHeaders,
        );
      const instructions = await readFile(
        path.resolve(process.cwd(), "../config/prompts/roteiro-visual-canva.txt"),
        "utf8",
      );
      const text = await renderItineraryPrompt(
        JSON.parse(row.snapshot),
        row,
        language,
        instructions,
      );
      const filename = row.filename.replace(/\.pdf$/, `_Canva_${language.toUpperCase()}.txt`);
      return new Response(text, {
        headers: {
          ...noStoreHeaders,
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }
    if (params.get("format") === "bundle") {
      const company = await store.localizedPdf(id, version, "pt");
      const files: Record<string, Uint8Array> = {
        [company.filename]: new Uint8Array(company.bytes),
      };
      if (language !== "pt") {
        const client = await store.localizedPdf(id, version, language);
        files[client.filename] = new Uint8Array(client.bytes);
      }
      const filename = row.filename.replace(
        /\.pdf$/,
        `_PT${language === "pt" ? "" : "-" + language.toUpperCase()}.zip`,
      );
      return new Response(new Uint8Array(zipSync(files)), {
        headers: {
          ...noStoreHeaders,
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }
    if (params.get("format") === "pdf") {
      const pdf = params.has("locale")
        ? await store.localizedPdf(id, version, language)
        : await store.pdf(id, version);
      return new Response(new Uint8Array(pdf.bytes), {
        headers: {
          ...noStoreHeaders,
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${pdf.filename}"`,
        },
      });
    }
    return Response.json(
      {
        meta: store.list(id).find((v) => v.version === version),
        snapshot: JSON.parse(row.snapshot),
      },
      { headers: noStoreHeaders },
    );
  } catch (error) {
    if (error instanceof TranslationError)
      return Response.json(
        { error: error.message, code: error.code },
        { status: 503, headers: noStoreHeaders },
      );
    return jsonError(
      params.get("format") === "prompt"
        ? "Não foi possível exportar o TXT. A versão guardada foi preservada."
        : "Não foi possível gerar ou carregar o PDF. A versão guardada foi preservada.",
      500,
      noStoreHeaders,
    );
  } finally {
    store.close();
  }
}
