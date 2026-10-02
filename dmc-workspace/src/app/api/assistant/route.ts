import { validateSnapshot } from "@/lib/snapshot-validation";
import { loadPublishedCatalog } from "@/lib/published-catalog";
import { editWithAssistant } from "@/lib/assistant-editing";
export const runtime = "nodejs";
export async function POST(request: Request) {
  let body;
  try {
    body = await request.json();
    validateSnapshot(body.snapshot);
    if (typeof body.input !== "string" || !body.input.trim() || body.input.length > 4000)
      throw new Error("Pedido inválido.");
  } catch {
    return Response.json({ error: "Pedido ou roteiro inválido." }, { status: 400 });
  }
  try {
    return Response.json(
      editWithAssistant(body.snapshot, body.input, await loadPublishedCatalog()),
    );
  } catch {
    return Response.json(
      {
        error:
          "Não foi possível validar a alteração com o catálogo e as regras atuais. Nada foi alterado.",
      },
      { status: 422 },
    );
  }
}
