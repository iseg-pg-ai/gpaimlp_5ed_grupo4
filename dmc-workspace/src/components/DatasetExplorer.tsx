"use client";
import { useEffect, useState } from "react";
import { T } from "./LocaleProvider";
import { SourceFields } from "./SourceFields";
import { responseJson } from "@/lib/http-client";
type Data = {
  tables: string[];
  table?: string;
  rows: Record<string, unknown>[];
  total: number;
  page: number;
};
export function DatasetExplorer() {
  const [table, setTable] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Data>();
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(
        `/api/dataset?${new URLSearchParams({ ...(table ? { table } : {}), q: query, page: String(page) })}`,
        { signal: controller.signal },
      )
        .then(responseJson<Data>)
        .then((value) => {
          setData(value);
          setError("");
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError(e.message);
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [table, query, page]);
  return (
    <section className="my-6 rounded-xl border bg-white p-4" data-testid="dataset-explorer">
      <h2 className="text-xl">
        <T text="Todas as folhas do dataset" source="pt" />
      </h2>
      <p className="my-3 text-sm">
        <T
          text="Consulta das fontes importadas pelo ETL. Informação histórica não confirma disponibilidade, preços ou reservas atuais."
          source="pt"
        />
      </p>
      <div className="flex flex-wrap gap-3">
        <label className="min-w-0">
          <T text="Folha" source="pt" />
          <select
            className="block max-w-full border rounded p-2"
            value={table || data?.table || ""}
            onChange={(e) => {
              setTable(e.target.value);
              setPage(1);
            }}
          >
            {data?.tables.map((t) => (
              <option key={t} value={t}>
                {t.replace("structured_", "").replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label>
          <T text="Pesquisar nos dados" source="pt" />
          <input
            className="block w-full border rounded p-2"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
          />
        </label>
      </div>
      {error && <p role="alert">{error}</p>}
      <p className="my-3">
        <T text="Registos" source="pt" />: {data?.total ?? 0}
      </p>
      {data?.rows.map((row, index) => (
        <details key={`${data.table}:${data.page}:${index}`} className="border-t py-3">
          <summary className="cursor-pointer break-words">
            {String(
              row.nome_da_atracao ??
                row.estabelecimento ??
                row.nome_da_experiencia ??
                row.id ??
                row.id_roteiro ??
                row._source_sheet ??
                data.table,
            )}{" "}
            · {String(row._source_row ?? index + 1)}
          </summary>
          <SourceFields value={row} />
        </details>
      ))}
      <div className="mt-4 flex gap-3 items-center">
        <button
          type="button"
          disabled={!data || data.page <= 1}
          onClick={() => setPage((data?.page ?? 1) - 1)}
        >
          <T text="Anterior" source="pt" />
        </button>
        <span>
          {data?.page ?? 1} / {Math.max(1, Math.ceil((data?.total ?? 0) / 25))}
        </span>
        <button
          type="button"
          disabled={!data || data.page * 25 >= data.total}
          onClick={() => setPage((data?.page ?? 1) + 1)}
        >
          <T text="Seguinte" source="pt" />
        </button>
      </div>
    </section>
  );
}
