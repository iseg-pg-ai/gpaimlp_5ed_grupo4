import { readFile } from "node:fs/promises";
import path from "node:path";
import Link from "next/link";
import type { Row } from "@/lib/curation";
export const dynamic = "force-dynamic";
const value = (row: Row, key: string) => String(row[key] ?? "Não indicado");
async function rows(name: string): Promise<Row[]> {
  const data = await readFile(path.resolve(process.cwd(), "../warehouse", `${name}.jsonl`), "utf8");
  return data.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}
export default async function ReferencesPage() {
  let data: Row[][];
  try { data = await Promise.all(["structured_roteiros", "structured_atividades", "structured_experiencias", "structured_precos_propostas", "structured_merge_conflicts"].map(rows)); }
  catch { return <main className="p-8"><Link href="/">Voltar ao workspace</Link><p>Referências indisponíveis. Execute o ETL para importar o dataset complementar.</p></main>; }
  const [routes, activities, experiences, prices, conflicts] = data;
  return <main className="min-h-screen bg-[#F4F0E7] p-8 text-[#143F4B]">
    <Link href="/" className="underline">Voltar ao workspace</Link>
    <h1 className="text-3xl mt-6 mb-3">Referências históricas</h1>
    <p>Fonte: structured_dataset.xlsx · {routes.length} roteiros · {prices.length} preços históricos.</p>
    <p className="my-4 text-amber-900">Estas propostas não comprovam reservas, disponibilidade ou tarifas atuais. Não entram automaticamente no itinerário nem no orçamento do cliente.</p>
    <details className="mb-6 border p-4 rounded"><summary>Divergências do catálogo para revisão ({conflicts.length})</summary>
      {conflicts.map((r, i) => <p key={i} className="mt-2">{value(r, "table")} / {value(r, "record_id")} / {value(r, "field")}: mantido «{value(r, "retained_value")}»; alternativa «{value(r, "supplement_value")}» — {value(r, "_source_sheet")}, linha {value(r, "_source_row")}.</p>)}
    </details>
    {routes.map(route => <details key={value(route, "id_roteiro")} className="bg-white p-4 rounded mb-3">
      <summary className="cursor-pointer font-semibold">{value(route, "id_roteiro")} — {value(route, "titulo_anonimizado")}</summary>
      <p className="mt-3">{value(route, "estado_da_proposta")} · {value(route, "codigo_fonte")}, página {value(route, "pagina_inicial")}</p>
      <p>{value(route, "validacao_pendente")}</p>
      <h2 className="font-semibold mt-3">Menções documentadas</h2>
      <ul className="list-disc pl-5">{[...activities, ...experiences].filter(r => r.id_roteiro === route.id_roteiro).map((r, i) => <li key={i}>{String(r.nome_etapa ?? r.nome_tipo)} — {value(r, "estado_operacional")} · {value(r, "codigo_fonte")}, página {value(r, "pagina")}</li>)}</ul>
      <h2 className="font-semibold mt-3">Preços históricos — confirmar vigência e inclusões</h2>
      <ul className="list-disc pl-5">{prices.filter(r => r.id_roteiro === route.id_roteiro).map(r => <li key={value(r, "id_preco")}>{value(r, "modalidade_ambito")}: {value(r, "valor")} {value(r, "moeda")} / {value(r, "unidade_grupo")} · {value(r, "regra_de_utilizacao")} · {value(r, "codigo_fonte")}, página {value(r, "pagina")}</li>)}</ul>
    </details>)}
  </main>;
}
