import { DatasetExplorer } from "@/components/DatasetExplorer";
import { T } from "@/components/LocaleProvider";
import { readFile } from "node:fs/promises";
import path from "node:path";
import Link from "next/link";
import type { Row } from "@/lib/curation";
export const dynamic = "force-dynamic";
const value = (row: Row, key: string) => String(row[key] ?? "Não indicado");
async function rows(name: string): Promise<Row[]> {
  const data = await readFile(path.resolve(process.cwd(), "../warehouse", `${name}.jsonl`), "utf8");
  return data
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}
export default async function ReferencesPage() {
  let data: Row[][];
  try {
    data = await Promise.all(
      [
        "structured_roteiros",
        "structured_atividades",
        "structured_experiencias",
        "structured_precos_propostas",
        "structured_merge_conflicts",
      ].map(rows),
    );
  } catch {
    return (
      <main className="p-8">
        <Link href="/">
          <T text="Voltar ao workspace" source="pt" />
        </Link>
        <p>
          <T
            text="Referências indisponíveis. Execute o ETL para importar o dataset complementar."
            source="pt"
          />
        </p>
      </main>
    );
  }
  const [routes, activities, experiences, prices, conflicts] = data;
  return (
    <main className="min-h-screen bg-[#F4F0E7] p-8 text-[#143F4B]">
      <Link href="/" className="underline">
        <T text="Voltar ao workspace" source="pt" />
      </Link>
      <DatasetExplorer />
      <h1 className="text-3xl mt-6 mb-3">
        <T text="Referências históricas" source="pt" />
      </h1>
      <p>
        <T text="Fonte: structured_dataset.xlsx ·" source="pt" /> {routes.length}
        <T text="roteiros ·" source="pt" /> {prices.length}
        <T text="preços históricos." source="pt" />
      </p>
      <p className="my-4 text-amber-900">
        <T
          text="Estas propostas não comprovam reservas, disponibilidade ou tarifas atuais. Não entram automaticamente no itinerário nem no orçamento do cliente."
          source="pt"
        />
      </p>
      <details className="mb-6 border p-4 rounded">
        <summary>
          <T text="Divergências do catálogo para revisão (" source="pt" />
          {conflicts.length})
        </summary>
        {conflicts.map((r, i) => (
          <p key={i} className="mt-2">
            {value(r, "table")} / {value(r, "record_id")} / {value(r, "field")}
            <T text=": mantido «" source="pt" />
            {value(r, "retained_value")}
            <T text="»; alternativa «" source="pt" />
            {value(r, "supplement_value")}» — {value(r, "_source_sheet")}
            <T text=", linha" source="pt" /> {value(r, "_source_row")}.
          </p>
        ))}
      </details>
      {routes.map((route) => (
        <details key={value(route, "id_roteiro")} className="bg-white p-4 rounded mb-3">
          <summary className="cursor-pointer font-semibold">
            {value(route, "id_roteiro")} — {value(route, "titulo_anonimizado")}
          </summary>
          <p className="mt-3">
            {value(route, "estado_da_proposta")} · {value(route, "codigo_fonte")}
            <T text=", página" source="pt" /> {value(route, "pagina_inicial")}
          </p>
          <p>{value(route, "validacao_pendente")}</p>
          <h2 className="font-semibold mt-3">
            <T text="Menções documentadas" source="pt" />
          </h2>
          <ul className="list-disc pl-5">
            {[...activities, ...experiences]
              .filter((r) => r.id_roteiro === route.id_roteiro)
              .map((r, i) => (
                <li key={i}>
                  {String(r.nome_etapa ?? r.nome_tipo)} — {value(r, "estado_operacional")} ·{" "}
                  {value(r, "codigo_fonte")}
                  <T text=", página" source="pt" /> {value(r, "pagina")}
                </li>
              ))}
          </ul>
          <h2 className="font-semibold mt-3">
            <T text="Preços históricos — confirmar vigência e inclusões" source="pt" />
          </h2>
          <ul className="list-disc pl-5">
            {prices
              .filter((r) => r.id_roteiro === route.id_roteiro)
              .map((r) => (
                <li key={value(r, "id_preco")}>
                  {value(r, "modalidade_ambito")}: {value(r, "valor")} {value(r, "moeda")} /{" "}
                  {value(r, "unidade_grupo")} · {value(r, "regra_de_utilizacao")} ·{" "}
                  {value(r, "codigo_fonte")}
                  <T text=", página" source="pt" /> {value(r, "pagina")}
                </li>
              ))}
          </ul>
        </details>
      ))}
    </main>
  );
}
