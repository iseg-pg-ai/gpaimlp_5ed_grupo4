import { createHash, timingSafeEqual } from "node:crypto";
import { jsonError, noStoreHeaders } from "./server-http.ts";

// Credencial operacional própria: não reutilizar credenciais AWS no navegador.
// Sem configuração não há acesso, nem sequer de leitura, às novas operações.
export function authorizeOperations(request: Request): { operator: string } | Response {
  const token = process.env.BLU_OPERATIONS_TOKEN;
  const operator = process.env.BLU_OPERATOR_ID;
  if (!token || token.length < 32 || !operator?.trim() || operator.length > 100)
    return jsonError(
      "Operações não configuradas. Defina BLU_OPERATIONS_TOKEN (mínimo 32 caracteres) e BLU_OPERATOR_ID no servidor.",
      503,
      noStoreHeaders,
    );
  const supplied = request.headers.get("authorization") ?? "";
  const digest = (value: string) => createHash("sha256").update(value).digest();
  if (supplied.length > 500 || !timingSafeEqual(digest(supplied), digest(`Bearer ${token}`)))
    return jsonError("Autenticação operacional necessária.", 401, noStoreHeaders);
  return { operator: operator.trim() };
}
