import { portalUrl } from "@/lib/http-client";
import { redirect } from "next/navigation";

// A exploração técnica das fontes fica fora da navegação normal do portal.
export default function ReferencesPage() {
  redirect(portalUrl("/catalog"));
}
