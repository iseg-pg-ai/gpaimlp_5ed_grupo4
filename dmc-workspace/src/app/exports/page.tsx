import Link from "next/link";
import { VersionStore } from "@/lib/version-store";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export default function ExportHistory() {
  const store = new VersionStore();
  const versions = store.list();
  store.close();
  return <main className="min-h-screen bg-[#F4F0E7] p-8 text-[#143F4B]">
    <Link href="/" className="underline">Voltar ao workspace</Link>
    <h1 className="text-3xl my-6">Histórico de versões dos roteiros</h1>
    <p className="mb-6">Cada versão preserva o roteiro desse momento. Exportar novamente mantém o PDF original.</p>
    {!versions.length && <p>Ainda não existem versões guardadas.</p>}
    {versions.map(v => <article key={`${v.tripId}-${v.version}`} className="bg-white rounded p-4 mb-3 break-words">
      <p className="font-semibold">{v.filename}</p>
      <p className="text-sm my-2">{v.createdAt} · {v.reason === "generated" ? "Geração" : v.reason === "edited" ? "Alteração" : "Exportação inicial"} · {v.parentVersion ? `Anterior: v${String(v.parentVersion).padStart(3,"0")}` : "Início do histórico"}</p>
      <p className="text-sm mb-2">{v.exportedAt ? `PDF criado em ${v.exportedAt}` : "Versão guardada; PDF ainda não exportado"}</p>
      <a className="underline mr-5" href={`/api/versions?tripId=${v.tripId}&version=${v.version}&format=pdf`}>Descarregar PDF</a>
      <a className="underline" href={`/api/versions?tripId=${v.tripId}&version=${v.version}`} target="_blank">Consultar conteúdo guardado</a>
    </article>)}
  </main>;
}
