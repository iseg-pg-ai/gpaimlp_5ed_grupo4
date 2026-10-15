import { portalUrl } from "@/lib/http-client";
import { datasetRequest, type Dataset } from "@/lib/dataset-source";
import { warehouseRoot } from "@/lib/catalog-store";
import { T } from "./LocaleProvider";

export async function DatasetExplorer({ params }: { params: Record<string, string> }) {
  let data: Dataset & { html: string };
  try {
    data = await datasetRequest("explore", warehouseRoot(), params);
  } catch (error) {
    return (
      <section className="my-6 rounded-xl border bg-white p-4" data-testid="dataset-explorer">
        <p role="alert">
          <T
            text={error instanceof Error ? error.message : "Dataset indisponível. Execute o ETL."}
            source="pt"
          />
        </p>
      </section>
    );
  }
  const query = (params.q ?? "").slice(0, 200);
  const pageUrl = (page: number) =>
    portalUrl(
      `/references?${new URLSearchParams({ ...(data.table ? { table: data.table } : {}), q: query, page: String(page) })}`,
    );
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
      <form
        action={portalUrl("/references")}
        method="get"
        className="flex flex-wrap items-end gap-3"
      >
        <label className="min-w-0">
          <T text="Folha" source="pt" />
          <select
            name="table"
            className="block max-w-full border rounded p-2"
            defaultValue={data.table}
          >
            {data.tables.map((table) => (
              <option key={table} value={table}>
                {table.replace("structured_", "").replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label>
          <T text="Pesquisar nos dados" source="pt" />
          <input
            name="q"
            type="search"
            maxLength={200}
            className="block w-full border rounded p-2"
            defaultValue={query}
          />
        </label>
        <button type="submit" className="rounded border px-3 py-2">
          <T text="Filtrar" source="pt" />
        </button>
      </form>
      <p className="my-3">
        <T text="Registos" source="pt" />: {data.total}
      </p>
      {/* HTML de template local; fontes são escapadas no renderer Python. */}
      <div dangerouslySetInnerHTML={{ __html: data.html }} />
      <nav aria-label="Paginação do dataset" className="mt-4 flex gap-3 items-center">
        {data.page > 1 ? (
          <a className="underline" href={pageUrl(data.page - 1)}>
            <T text="Anterior" source="pt" />
          </a>
        ) : (
          <span aria-disabled="true">
            <T text="Anterior" source="pt" />
          </span>
        )}
        <span>
          {data.page} / {Math.max(1, Math.ceil(data.total / 25))}
        </span>
        {data.page * 25 < data.total ? (
          <a className="underline" href={pageUrl(data.page + 1)}>
            <T text="Seguinte" source="pt" />
          </a>
        ) : (
          <span aria-disabled="true">
            <T text="Seguinte" source="pt" />
          </span>
        )}
      </nav>
    </section>
  );
}
