// Liga os filtros e os dados do Observatório à apresentação analítica no portal.
"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Maximize2, RefreshCw, Compass, MapPin, Layers } from "lucide-react";
import { portalFetch, responseJson } from "@/lib/http-client";
import { display, type ObservatoryData, type ObservatoryRecord } from "@/lib/observatory";
import { ObservatoryMap } from "./ObservatoryMap";
import {
  Bars,
  DataTable,
  HistoryPanel,
  Metrics,
  PricingPanel,
  QualityPanel,
  RecordDetail,
} from "./ObservatoryPanels";

const views = ["Panorama", "Explorar oferta", "Destinos", "Preços", "Histórico", "Qualidade"];
const titles = [
  "Um território de possibilidades.",
  "Encontre a próxima descoberta.",
  "Um destino, muitas perspetivas.",
  "Cada preço tem um contexto.",
  "Conhecimento que merece continuar.",
  "Saber o que ainda não sabemos.",
];
const options = (values: (string | null)[]) =>
  [...new Set(values.filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b, "pt"));
export function CatalogObservatory() {
  const [data, setData] = useState<ObservatoryData | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState(0);
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("");
  const [place, setPlace] = useState("");
  const [category, setCategory] = useState("");
  const [selection, setSelection] = useState<string[]>([]);
  const [compared, setCompared] = useState<string[]>([]);
  const [fullscreen, setFullscreen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    portalFetch("/api/observatory", { signal: controller.signal, cache: "no-store" })
      .then(responseJson<ObservatoryData>)
      .then((result) => {
        if (active) setData(result);
      })
      .catch(() => {
        if (active)
          setError("A entrega analítica está indisponível. Pode continuar a gerir o catálogo.");
      })
      .finally(() => {
        window.clearTimeout(timeout);
        if (active) setRefreshing(false);
      });
    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [attempt]);
  useEffect(() => {
    const change = () => setFullscreen(document.fullscreenElement === root.current);
    document.addEventListener("fullscreenchange", change);
    return () => document.removeEventListener("fullscreenchange", change);
  }, []);
  const filtered = useMemo(
    () =>
      data?.records.filter(
        (r) =>
          (!kind || r.kind === kind) &&
          (!place || (place === "__unknown" ? !r.destination : r.destination === place)) &&
          (!category || r.category === category) &&
          `${r.name ?? ""} ${r.description ?? ""} ${r.location ?? ""}`
            .toLocaleLowerCase("pt")
            .includes(search.toLocaleLowerCase("pt")),
      ) ?? [],
    [data, kind, place, category, search],
  );
  const selected = data?.records.find((r) => selection.includes(r.key));
  const comparison = data?.records.filter((r) => compared.includes(r.key)) ?? [];
  const choose = (keys: string[]) => {
    setSelection(keys);
  };
  const toggleCompare = (key: string) =>
    setCompared((values) =>
      values.includes(key)
        ? values.filter((k) => k !== key)
        : values.length < 4
          ? [...values, key]
          : values,
    );
  if (!data)
    return (
      <div className="obs-loading" role="status">
        <Compass className="size-9" aria-hidden="true" />
        <h2>{error ? "Observatório indisponível" : "A preparar o Observatório…"}</h2>
        <p>{error || "A consultar a entrega publicada."}</p>
        {error && (
          <button
            type="button"
            className="obs-button"
            onClick={() => {
              setError("");
              setAttempt((v) => v + 1);
            }}
          >
            <RefreshCw className="size-4" /> Tentar novamente
          </button>
        )}
      </div>
    );
  const counts = (rows: ObservatoryRecord[]) =>
    ["Atração", "Restaurante", "Experiência"].map(
      (type) =>
        [type, rows.filter((r) => r.kind === type).length, "registos na seleção"] as [
          string,
          number,
          string,
        ],
    );
  const locations = new Map<string, number>();
  for (const r of filtered) {
    const name = r.destination ?? "Por harmonizar";
    locations.set(name, (locations.get(name) ?? 0) + 1);
  }
  const ranked = [...locations].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const filterControls = (
    <div className="obs-filters">
      <label>
        Pesquisar oferta
        <input
          aria-label="Pesquisar oferta"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Nome, descrição ou localização…"
        />
      </label>
      <label>
        Tipo de oferta
        <select aria-label="Tipo de oferta" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">Todos</option>
          {options(data.records.map((r) => r.kind)).map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </label>
      <label>
        Destino harmonizado
        <select
          aria-label="Destino harmonizado"
          value={place}
          onChange={(e) => setPlace(e.target.value)}
        >
          <option value="">Todos</option>
          {options(data.records.map((r) => r.destination)).map((v) => (
            <option key={v}>{v}</option>
          ))}
          <option value="__unknown">Por harmonizar</option>
        </select>
      </label>
      <label>
        Categoria da oferta
        <select
          aria-label="Categoria da oferta"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">Todas</option>
          {options(data.records.map((r) => r.category)).map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="obs-text-button"
        onClick={() => {
          setSearch("");
          setKind("");
          setPlace("");
          setCategory("");
        }}
      >
        Limpar filtros
      </button>
    </div>
  );
  const map = <ObservatoryMap records={filtered} outlines={data.outlines} onSelect={choose} />;
  const recordsList = (
    <div className="obs-record-list" aria-label="Oferta publicada">
      {filtered.map((record) => (
        <article key={record.key} className={selection.includes(record.key) ? "is-selected" : ""}>
          <button
            type="button"
            className="obs-record-open"
            aria-pressed={selection.includes(record.key)}
            onClick={() => choose([record.key])}
          >
            <span className="obs-eyebrow">
              {record.kind} · {display(record.destination)}
            </span>
            <strong>{display(record.name)}</strong>
            <small>{display(record.category)}</small>
            <ArrowUpRight className="size-4" aria-hidden="true" />
          </button>
          <label className="obs-compare-check">
            <input
              type="checkbox"
              aria-label={`Comparar ${record.name}`}
              checked={compared.includes(record.key)}
              disabled={!compared.includes(record.key) && compared.length >= 4}
              onChange={() => toggleCompare(record.key)}
            />{" "}
            Comparar
          </label>
        </article>
      ))}
      {!filtered.length && (
        <p className="obs-empty">Nenhum resultado. Retire um filtro para continuar.</p>
      )}
    </div>
  );
  return (
    <div ref={root} className="obs-dashboard" data-testid="native-observatory">
      <div className="obs-heading">
        <div>
          <p className="obs-eyebrow">
            <span /> BLU / INTELLIGENCE ATLAS
          </p>
          <h2>{titles[view]}</h2>
          <p>Conhecimento para decidir melhor. Consulta da entrega publicada, só de leitura.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="obs-button"
            disabled={refreshing}
            onClick={() => {
              setError("");
              setRefreshing(true);
              setAttempt((value) => value + 1);
            }}
          >
            <RefreshCw className="size-4" />
            {refreshing ? "A atualizar…" : "Atualizar análise"}
          </button>
          <button
            type="button"
            className="obs-button"
            onClick={() => {
              if (document.fullscreenElement) void document.exitFullscreen();
              else if (root.current?.requestFullscreen)
                void root.current
                  .requestFullscreen()
                  .catch(() =>
                    setError("O navegador não permitiu abrir a apresentação em ecrã inteiro."),
                  );
            }}
          >
            <Maximize2 className="size-4" /> {fullscreen ? "Sair da apresentação" : "Apresentação"}
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="obs-notice">
          {error}
        </p>
      )}
      <div className="obs-navigation" role="group" aria-label="Áreas do Observatório">
        {views.map((label, index) => (
          <button
            type="button"
            key={label}
            aria-pressed={view === index}
            onClick={() => setView(index)}
          >
            <span>{String(index + 1).padStart(2, "0")}</span>
            {label}
          </button>
        ))}
      </div>
      {view <= 2 && (
        <>
          {filterControls}
          <Metrics
            values={
              view === 0
                ? [
                    [
                      "Oferta publicada",
                      filtered.length,
                      `${data.records.length} registos na entrega`,
                    ],
                    [
                      "Destinos",
                      new Set(filtered.map((r) => r.destination).filter(Boolean)).size,
                      "destinos harmonizados",
                    ],
                    ["PDF históricos", data.history.documentCount, "documentos, não reservas"],
                  ]
                : counts(filtered)
            }
          />
          <p className="obs-note">
            {filtered.length} de {data.records.length} registos. Localizações originais preservadas;
            desconhecido não significa disponibilidade ou compatibilidade.
          </p>
          {view === 0 ? (
            <div className="obs-two-columns">
              <section className="obs-aligned-panel">
                <h3>
                  <MapPin className="size-4" /> A geografia da curadoria
                </h3>
                {map}
              </section>
              <section className="obs-aligned-panel">
                <h3>Oferta por destino</h3>
                <div className="obs-ranking-body">
                  <p className="obs-note">Selecione um destino para explorar a oferta.</p>
                  <Bars
                    rows={ranked}
                    onSelect={(name) => {
                      setPlace(name === "Por harmonizar" ? "__unknown" : name);
                      setView(2);
                    }}
                  />
                  <p className="obs-note">
                    Oito destinos com mais registos nesta seleção. Destinos regionais não são
                    apresentados como cidades.
                  </p>
                </div>
              </section>
            </div>
          ) : (
            <>
              <div className="obs-two-columns">
                <section className="obs-aligned-panel">
                  <h3>
                    <MapPin className="size-4" />{" "}
                    {view === 2 ? "O território e a sua oferta" : "Explorar no mapa"}
                  </h3>
                  {map}
                </section>
                <section className="obs-aligned-panel">
                  <h3>
                    <Layers className="size-4" /> Oferta na seleção
                  </h3>
                  {recordsList}
                </section>
              </div>
              {view === 2 && (
                <div className="obs-surface mt-5">
                  <h3>Categorias no destino selecionado</h3>
                  <Bars
                    rows={options(filtered.map((r) => r.category))
                      .map(
                        (c) =>
                          [c, filtered.filter((r) => r.category === c).length] as [string, number],
                      )
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 10)}
                  />
                </div>
              )}
            </>
          )}
        </>
      )}
      {view === 3 && <PricingPanel data={data} />}
      {view === 4 && <HistoryPanel data={data} />}
      {view === 5 && (
        <QualityPanel
          data={data}
          onSelect={(key) => {
            choose([key]);
          }}
        />
      )}
      {!!selection.length && (
        <section className="mt-6" aria-label="Seleção no mapa">
          {selection.length > 1 && (
            <div className="obs-group-members">
              <span>Registos no grupo:</span>
              {selection.map((key) => (
                <button
                  type="button"
                  key={key}
                  className="obs-button"
                  onClick={() => choose([key])}
                >
                  {display(data.records.find((r) => r.key === key)?.name)}
                </button>
              ))}
            </div>
          )}
          {selected && (
            <>
              <RecordDetail record={selected} data={data} />
              <button
                type="button"
                className="obs-button mt-3"
                disabled={!compared.includes(selected.key) && compared.length >= 4}
                onClick={() => toggleCompare(selected.key)}
              >
                {compared.includes(selected.key)
                  ? "Retirar da comparação"
                  : "Adicionar à comparação"}
              </button>
              <button type="button" className="obs-text-button ml-4" onClick={() => choose([])}>
                Fechar ficha
              </button>
            </>
          )}
        </section>
      )}
      {!!comparison.length && (
        <section className="obs-comparison">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3>Comparar oferta · {comparison.length}/4</h3>
            <button type="button" className="obs-text-button" onClick={() => setCompared([])}>
              Limpar comparação
            </button>
          </div>
          {comparison.length < 2 ? (
            <p className="obs-note">
              Escolha entre duas e quatro opções. Não é calculado um vencedor ou preço agregado.
            </p>
          ) : (
            <DataTable
              columns={["Campo", ...comparison.map((r) => display(r.name))]}
              rows={[
                "Tipo",
                "Destino",
                "Localização original",
                "Duração",
                "Preço",
                "Condições",
                "Acessibilidade",
                "Fonte",
              ].map((field) => [
                field,
                ...comparison.map((r) =>
                  display(
                    field === "Tipo"
                      ? r.kind
                      : field === "Destino"
                        ? r.destination
                        : field === "Localização original"
                          ? r.location
                          : field === "Fonte"
                            ? r.source
                            : r.details[field],
                  ),
                ),
              ])}
            />
          )}
        </section>
      )}
      <footer className="obs-note obs-bottom-note">
        Reavaliado em {data.evaluatedOn} · Fontes e evidência preservadas · Revisão humana
        necessária
      </footer>
    </div>
  );
}
