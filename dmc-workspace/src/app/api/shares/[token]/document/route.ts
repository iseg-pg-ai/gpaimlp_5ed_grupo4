import { noStoreHeaders } from "@/lib/api-response";
import { VersionStore } from "@/lib/version-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const store = new VersionStore();
  try {
    const share = store.getShare(token);
    const pdf = await store.localizedPdf(share.tripId, share.version, share.locale);
    return new Response(new Uint8Array(pdf.bytes), {
      headers: {
        ...noStoreHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${pdf.filename}"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Partilha não encontrada.", { status: 404, headers: noStoreHeaders });
  } finally {
    store.close();
  }
}
