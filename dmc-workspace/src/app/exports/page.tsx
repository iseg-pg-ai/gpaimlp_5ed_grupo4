import { T, ExportLanguageLinks } from "@/components/LocaleProvider";
import Link from "next/link";
import { VersionStore } from "@/lib/version-store";
import { VersionTrashButton } from "@/components/VersionTrashButton";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export default function ExportHistory() {
  const store = new VersionStore();
  const versions = store.list();
  store.close();
  return (
    <main className="min-h-screen bg-[#F4F0E7] p-8 text-[#143F4B]">
      <Link href="/" className="underline">
        <T text="Voltar ao workspace" source="pt" />
      </Link>
      <h1 className="text-3xl my-6">
        <T text="Histórico de versões dos roteiros" source="pt" />
      </h1>
      <p className="mb-6">
        <T
          text="Cada versão preserva o roteiro desse momento. Exportar novamente mantém o PDF original."
          source="pt"
        />
      </p>
      {!versions.length && (
        <p>
          <T text="Ainda não existem versões guardadas." source="pt" />
        </p>
      )}
      {versions.map((v) => (
        <article
          key={`${v.tripId}-${v.version}`}
          className="mb-3 flex flex-col gap-4 rounded bg-white p-4 break-words sm:flex-row sm:items-stretch"
        >
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{v.filename}</p>
            <p className="text-sm my-2">
              {v.createdAt} ·{" "}
              <T
                text={
                  v.reason === "generated"
                    ? "Geração"
                    : v.reason === "edited"
                      ? "Alteração"
                      : "Exportação inicial"
                }
                source="pt"
              />{" "}
              ·{" "}
              <T
                text={
                  v.parentVersion
                    ? `Anterior: v${String(v.parentVersion).padStart(3, "0")}`
                    : "Início do histórico"
                }
                source="pt"
              />
            </p>
            <p className="text-sm mb-2">
              <T
                text={
                  v.exportedAt
                    ? `PDF criado em ${v.exportedAt}`
                    : "Versão guardada; PDF ainda não exportado"
                }
                source="pt"
              />
            </p>
            <ExportLanguageLinks tripId={v.tripId} version={v.version} />
            <a
              className="underline"
              href={`/api/versions?tripId=${v.tripId}&version=${v.version}`}
              target="_blank"
            >
              <T text="Consultar conteúdo guardado" source="pt" />
            </a>
          </div>
          <div className="flex shrink-0 items-center sm:border-l sm:border-[#E6E1D5] sm:pl-4">
            <VersionTrashButton tripId={v.tripId} version={v.version} />
          </div>
        </article>
      ))}
    </main>
  );
}
