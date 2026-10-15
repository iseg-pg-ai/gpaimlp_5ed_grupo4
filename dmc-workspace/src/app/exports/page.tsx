import { portalUrl } from "@/lib/http-client";
import { T } from "@/components/LocaleProvider";
import Link from "next/link";
import { languages } from "@/lib/locales";
import { VersionStore } from "@/lib/version-store";
import { Trash2 } from "lucide-react";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export default async function ExportHistory({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const error = (await searchParams).versionActionError;
  const actionError =
    error === "invalid"
      ? "Pedido inválido."
      : error === "not-found"
        ? "Versão não encontrada."
        : "";
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
      {actionError && (
        <p role="alert" className="mb-4 text-red-800">
          <T text={actionError} source="pt" />
        </p>
      )}
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
            <form
              action={portalUrl("/api/versions")}
              method="get"
              className="flex flex-wrap items-center gap-3 my-3"
              data-testid="export-downloads"
            >
              <input type="hidden" name="tripId" value={v.tripId} />
              <input type="hidden" name="version" value={v.version} />
              <label className="flex flex-wrap items-center gap-2">
                <T text="Idioma do cliente" source="pt" />
                <select
                  name="locale"
                  defaultValue="en"
                  className="rounded border border-[#D5D1C7] bg-white px-2 py-1"
                >
                  {languages.map((language) => (
                    <option key={language.code} value={language.code}>
                      {language.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                name="format"
                value="bundle"
                className="underline cursor-pointer"
              >
                <T text="Descarregar PDFs" source="pt" />
              </button>
              <button
                type="submit"
                name="format"
                value="prompt"
                className="underline cursor-pointer"
              >
                <T text="TXT para Canva" source="pt" />
              </button>
            </form>
            <a
              className="underline"
              href={portalUrl(`/api/versions?tripId=${v.tripId}&version=${v.version}`)}
              target="_blank"
            >
              <T text="Consultar conteúdo guardado" source="pt" />
            </a>
          </div>
          <div className="flex shrink-0 items-center sm:border-l sm:border-[#E6E1D5] sm:pl-4">
            <form
              method="post"
              action={portalUrl("/api/versions/trash")}
              data-testid="version-trash-form"
            >
              <input type="hidden" name="tripId" value={v.tripId} />
              <input type="hidden" name="version" value={v.version} />
              <input type="hidden" name="action" value="trash" />
              <button
                type="submit"
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-[#D5D1C7] px-3 py-2 text-sm text-[#70443E] hover:bg-[#F7E9E6]"
              >
                <Trash2 className="size-4" />
                <T text="Enviar para o Lixo" source="pt" />
              </button>
            </form>
          </div>
        </article>
      ))}
    </main>
  );
}
