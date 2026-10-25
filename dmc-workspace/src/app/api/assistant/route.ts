// Compatibilidade: o endpoint anterior usa a mesma validação e aceitação explícita.
import { POST as plan } from "./plan/route";
export const runtime = "nodejs";
export const POST = plan;
