import { validateConfirmation } from "@/lib/activity-confirmation";
import { zipSync } from "fflate";
import { TranslationError } from "@/lib/translation-error";
import { isLocale } from "@/lib/locales";
import { VersionStore, VersionConflict, checkTripId } from "@/lib/version-store";
import { validateBrief } from "@/lib/curation";
import type { Snapshot } from "@/lib/itinerary-pdf";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
function validateSnapshot(value: unknown): asserts value is Snapshot {
  if (!value || typeof value !== "object") throw new Error("Roteiro inválido.");
  const s = value as Snapshot;
  validateBrief(s.brief);
  const string = (v: unknown, max = 20000) => typeof v === "string" && v.length <= max;
  const list = (v: unknown) => Array.isArray(v) && v.length <= 100 && v.every(x => string(x));
  if (!list(s.pending) || !Array.isArray(s.itinerary) || !s.itinerary.length || s.itinerary.length > 31) throw new Error("Dias ou pendências inválidos.");
  for (const [index, day] of s.itinerary.entries()) {
    if (!day || day.dayNumber !== index + 1 || !string(day.date, 100) || !string(day.title) || !string(day.location) || (day.summary !== undefined && !string(day.summary)) || !Array.isArray(day.items) || day.items.length > 100) throw new Error("Dia inválido.");
    for (const item of day.items) {
      if (!item || !string(item.id) || !string(item.time) || !string(item.title)) throw new Error("Atividade inválida.");
      for (const key of ["description", "location", "duration", "priceNote", "dietaryNotes", "accessibilityNotes", "source"] as const) if (item[key] !== undefined && !string(item[key])) throw new Error("Texto de atividade inválido.");
      for (const key of ["pendingChecks", "appliedRules"] as const) if (item[key] !== undefined && !list(item[key])) throw new Error("Detalhes de atividade inválidos.");
      if (item.confirmation !== undefined) validateConfirmation(item, item.confirmation);
      if (item.catalogDetails && Object.values(item.catalogDetails).some(v => !string(v))) throw new Error('Dados de catálogo inválidos.');
      if (item.transitToNext && [item.transitToNext.fromLocation, item.transitToNext.toLocation, item.transitToNext.mode, item.transitToNext.duration].some(v => !string(v))) throw new Error("Deslocação inválida.");
    }
  }
}
export async function POST(request: Request) {
  let body;
  try {
    const raw = await request.text();
    if (raw.length > 2000000) return Response.json({ error: "Roteiro demasiado grande." }, { status: 413 });
    body = JSON.parse(raw);
    if (typeof body.tripId !== "string") throw new Error("Viagem inválida.");
    checkTripId(body.tripId); validateSnapshot(body.snapshot);
    if (!["generated", "edited", "export"].includes(body.reason)) throw new Error("Motivo inválido.");
    if (body.baseVersion !== null && (!Number.isSafeInteger(body.baseVersion) || body.baseVersion < 1)) throw new Error("Versão de origem inválida.");
  } catch (e) { return Response.json({ error: e instanceof Error ? e.message : "Pedido inválido." }, { status: 400 }); }
  const store = new VersionStore();
  try { return Response.json(store.save(body.tripId, { brief: body.snapshot.brief, itinerary: body.snapshot.itinerary, pending: body.snapshot.pending }, body.reason, body.baseVersion), { headers }); }
  catch (e) { return Response.json({ error: e instanceof VersionConflict ? e.message : "Não foi possível guardar a versão. Tente novamente." }, { status: e instanceof VersionConflict ? 409 : 500 }); }
  finally { store.close(); }
}
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const id = params.get("tripId");
  try { if (id !== null) checkTripId(id); }
  catch { return Response.json({ error: "Viagem inválida." }, { status: 400 }); }
  const store = new VersionStore();
  try {
    if (!params.has("version")) return Response.json(store.list(id ?? undefined), { headers });
    if (!id) return Response.json({ error: "Indique a viagem." }, { status: 400 });
    const version = Number(params.get("version"));
    let row;
    try { row = store.get(id, version); }
    catch { return Response.json({ error: "Versão não encontrada." }, { status: 404 }); }
    const language=params.get("locale") ?? "pt";
    if(!isLocale(language))return Response.json({error:"Idioma inválido."},{status:400});
    if(params.get("format")==="bundle") {
      const company=await store.localizedPdf(id,version,"pt");
      const files:Record<string,Uint8Array>={[company.filename]:new Uint8Array(company.bytes)};
      if(language!=="pt") {
        const client=await store.localizedPdf(id,version,language);
        files[client.filename]=new Uint8Array(client.bytes);
      }
      const filename=row.filename.replace(/\.pdf$/,`_PT${language==="pt"?"":"-"+language.toUpperCase()}.zip`);
      return new Response(new Uint8Array(zipSync(files)),{headers:{...headers,"Content-Type":"application/zip","Content-Disposition":`attachment; filename="${filename}"`}});
    }
    if (params.get("format") === "pdf") {
      const pdf = params.has("locale") ? await store.localizedPdf(id, version, language) : await store.pdf(id, version);
      return new Response(new Uint8Array(pdf.bytes), { headers: { ...headers, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${pdf.filename}"` } });
    }
    return Response.json({ meta: store.list(id).find(v => v.version === version), snapshot: JSON.parse(row.snapshot) }, { headers });
  } catch (error) {
    if (error instanceof TranslationError) return Response.json({ error: error.message, code: error.code }, { status: 503, headers });
    console.error("PDF export failed", error);
    return Response.json({ error: "Não foi possível gerar ou carregar o PDF. A versão guardada foi preservada." }, { status: 500, headers });
  }
  finally { store.close(); }
}
