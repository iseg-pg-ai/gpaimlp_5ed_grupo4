"use client";
import { formatPricing } from "@/lib/catalog-schema";
import { T } from "@/components/LocaleProvider";
import { Button } from "@/components/ui/button";
import { selectStyle } from "@/components/ui/select-style";
import { CatalogEditor } from "@/components/catalog/CatalogEditor";
import { CatalogHistory } from "@/components/catalog/CatalogHistory";
import { catalogControl as control, catalogButton as button } from "@/components/catalog/styles";
import { categories, categoryLabels, statuses, statusLabels } from "@/lib/catalog-schema";
import { useCatalog } from "@/hooks/useCatalog";
const statusColor = {
  draft: "bg-stone-100",
  review: "bg-amber-50",
  approved: "bg-teal-50",
  inactive: "bg-gray-100 text-gray-600",
};
export default function CatalogPage() {
  const {
    category,
    setCategory,
    query,
    setQuery,
    status,
    setStatus,
    location,
    setLocation,
    editing,
    setEditing,
    history,
    setHistory,
    loading,
    busy,
    error,
    notice,
    editorRef,
    historyRef,
    filtered,
    locations,
    edit,
    save,
    showHistory,
    publish,
  } = useCatalog();
  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-8 text-[#143F4B]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif-blu text-3xl">
            <T text="Catálogo" source="pt" />
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6">
            <T
              text="Mantenha a oferta e reveja os dados antes de aprovar. Apenas os aprovados entram em novos roteiros após atualizar o catálogo."
              source="pt"
            />
          </p>
        </div>
        <button className={button} disabled={busy || loading} onClick={publish}>
          <T text="Atualizar catálogo para os roteiros" source="pt" />
        </button>
      </div>
      {error && (
        <p role="alert" className="my-4 rounded-lg bg-red-50 p-4 text-red-900">
          <T text={error} source="pt" />
        </p>
      )}
      {notice && (
        <p role="status" className="my-4 rounded-lg bg-teal-50 p-4">
          <T text={notice} source="pt" />
        </p>
      )}
      {busy && (
        <p role="status" className="my-4">
          <T text="A processar…" source="pt" />
        </p>
      )}
      <div role="tablist" className="my-6 flex flex-wrap gap-2">
        {categories.map((c) => (
          <button
            key={c}
            id={`tab-${c}`}
            role="tab"
            aria-selected={category === c}
            aria-controls="catalog-panel"
            disabled={busy || Boolean(editing)}
            onClick={() => {
              setCategory(c);
              setLocation("");
              setHistory(null);
            }}
            className={`${button} ${category === c ? "bg-[#143F4B] text-white hover:bg-[#205562]" : "bg-white"}`}
          >
            <T text={categoryLabels[c]} source="pt" />
          </button>
        ))}
      </div>
      <section id="catalog-panel" role="tabpanel" aria-labelledby={`tab-${category}`}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm">
            <T text="Pesquisar" source="pt" />
            <input
              data-testid="catalog-search"
              className={`${control} mt-1`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <label className="text-sm">
            <T text="Estado" source="pt" />
            <select
              style={selectStyle}
              className={`${control} mt-1`}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">
                <T text="Todos os estados" source="pt" />
              </option>
              {statuses.map((s) => (
                <option key={s} value={s}>
                  <T text={statusLabels[s]} source="pt" />
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <T text="Localização" source="pt" />
            <select
              style={selectStyle}
              className={`${control} mt-1`}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            >
              <option value="">
                <T text="Todas as localizações" source="pt" />
              </option>
              {locations.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </label>
          <Button
            className="h-auto min-h-[50px] w-full self-end whitespace-normal border border-transparent p-3 text-base"
            disabled={busy || loading || Boolean(editing)}
            onClick={() => edit()}
          >
            <span>+</span>
            <T text="Novo Registo" source="pt" />
          </Button>
        </div>
        {editing && (
          <CatalogEditor
            editing={editing}
            setEditing={setEditing}
            busy={busy}
            save={save}
            editorRef={editorRef}
          />
        )}
        {history && (
          <CatalogHistory
            history={history}
            onClose={() => setHistory(null)}
            historyRef={historyRef}
          />
        )}
        <p role="status" className="my-5 text-sm">
          {loading ? (
            <T text="A carregar catálogo…" source="pt" />
          ) : (
            <>
              {filtered.length} <T text="registos" source="pt" />
            </>
          )}
        </p>
        {!loading && !filtered.length && (
          <p className="rounded-xl border bg-white p-6">
            <T text="Sem registos para estes filtros." source="pt" />
          </p>
        )}
        <div className="grid gap-4 lg:grid-cols-2">
          {filtered.map((r) => (
            <article
              key={r.id}
              data-testid="catalog-record"
              className="min-w-0 rounded-2xl border border-[#D5D1C7] bg-white p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h2 className="break-words text-lg font-semibold">{r.fields.name}</h2>
                <span className={`rounded-full px-3 py-1 text-sm ${statusColor[r.status]}`}>
                  <T text={statusLabels[r.status]} source="pt" />
                </span>
              </div>
              <p className="my-2 break-words text-sm">
                {r.fields.location || "—"} · {r.fields.duration || "—"}
              </p>
              <p className="break-words text-sm leading-6">{r.fields.description}</p>
              <p className="mt-3 text-sm">
                {r.pricing ? formatPricing(r.pricing) : r.fields.price || "—"}
              </p>
              <p className="mt-3 text-sm font-medium">
                <T
                  text={
                    r.published
                      ? "Disponível para novos roteiros"
                      : r.status === "approved"
                        ? "Aguarda atualização do catálogo"
                        : "Fora da geração de roteiros"
                  }
                  source="pt"
                />
              </p>
              <p className="mt-2 break-all text-xs text-[#4A636B]">
                {r.id} · v{r.revision}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  className={button}
                  disabled={busy || Boolean(editing)}
                  onClick={() => edit(r)}
                >
                  <T text="Editar" source="pt" />
                </button>
                <button className={button} disabled={busy} onClick={() => showHistory(r)}>
                  <T text="Histórico" source="pt" />
                </button>
                {r.status !== "inactive" && (
                  <button
                    className={button}
                    disabled={busy || Boolean(editing)}
                    onClick={() =>
                      save({
                        id: r.id,
                        category: r.category,
                        status: "inactive",
                        fields: r.fields,
                        matching: r.matching,
                        baseRevision: r.revision,
                        reason: "Inativação manual no portal",
                      })
                    }
                  >
                    <T text="Inativar" source="pt" />
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
