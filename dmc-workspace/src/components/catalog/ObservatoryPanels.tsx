// Apresenta indicadores, preços, histórico e qualidade a partir dos dados analíticos
// recebidos.
"use client";
import { useState, type ReactNode } from "react";
import {
  comparableMedian,
  display,
  type ObservatoryData,
  type ObservatoryPrice,
  type ObservatoryRecord,
} from "@/lib/observatory";

export function Metrics({ values }: { values: [string, ReactNode, string][] }) {
  return (
    <div className="obs-metrics">
      {values.map(([label, value, note]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{value ?? "—"}</strong>
          <small>{note}</small>
        </div>
      ))}
    </div>
  );
}
export function DataTable({ columns, rows }: { columns: string[]; rows: ReactNode[][] }) {
  return rows.length ? (
    <div className="obs-table-wrap" tabIndex={0} role="region" aria-label={columns.join(", ")}>
      <table className="obs-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c} scope="col">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((v, j) => (
                <td key={j}>{v ?? "Por confirmar"}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <p className="obs-empty">Sem registos para esta seleção.</p>
  );
}
export function Bars({
  rows,
  onSelect,
}: {
  rows: [string, number][];
  onSelect?: (name: string) => void;
}) {
  const maximum = Math.max(1, ...rows.map(([, n]) => n));
  return (
    <div className="obs-bars">
      {rows.map(([name, count]) => (
        <button type="button" key={name} onClick={() => onSelect?.(name)} disabled={!onSelect}>
          <span>{name}</span>
          <div>
            <i style={{ width: `${(count / maximum) * 100}%` }} />
          </div>
          <strong>{count}</strong>
        </button>
      ))}
    </div>
  );
}
const confirmation: Record<string, string> = {
  pendente: "Por confirmar",
  confirmado: "Confirmado",
  estimado: "Estimado",
  contestado: "Contestado",
};
const temporal: Record<string, string> = {
  vigente: "Dentro do prazo",
  expirada: "Expirado",
  não_iniciada: "Ainda não iniciado",
  prazo_desconhecido: "Sem prazo definido",
};
export function RecordDetail({
  record,
  data,
}: {
  record: ObservatoryRecord;
  data: ObservatoryData;
}) {
  const source = record.source;
  let url: string | undefined;
  try {
    const parsed = new URL(source ?? "");
    if (["https:", "http:"].includes(parsed.protocol) && !parsed.username && !parsed.password)
      url = parsed.href;
  } catch {
    /* A fonte textual conserva-se na ficha. */
  }
  return (
    <section className="obs-detail" aria-label="Ficha da oferta">
      <p className="obs-eyebrow">
        {record.kind} / {display(record.destination)}
      </p>
      <h3>{display(record.name)}</h3>
      <p>{display(record.description)}</p>
      <dl className="obs-facts">
        {Object.entries({
          "Localização original": record.location,
          "Âmbito geográfico": record.scope,
          Categoria: record.category,
          ...record.details,
        }).map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{display(value)}</dd>
          </div>
        ))}
      </dl>
      <p className="obs-note">
        Referência de catálogo; confirmar preços, condições e acessibilidade antes de apresentar ao
        cliente.
      </p>
      <p className="obs-note">
        Fonte: {display(source)}{" "}
        {url && (
          <a href={url} target="_blank" rel="noopener noreferrer">
            Consultar fonte ↗
          </a>
        )}
      </p>
      <p className="obs-note">
        {record.historicalRoutes === null
          ? "Sem relação histórica explícita disponível para esta entidade."
          : `${record.historicalRoutes.length} roteiros distintos com relação explícita. Não representa vendas ou procura.`}
      </p>
      <details>
        <summary>Confirmação e validade por campo</summary>
        <DataTable
          columns={["Campo", "Confirmação", "Prazo", "Verificado em", "Fonte"]}
          rows={data.evidence
            .filter((e) => e.entity_key === record.key)
            .map((e) => [
              e.field_label,
              confirmation[e.confirmation] ?? e.confirmation,
              temporal[e.temporal_state] ?? e.temporal_state,
              display(e.verified_on),
              display(e.evidence_source),
            ])}
        />
      </details>
    </section>
  );
}
const options = (values: (string | null)[]) =>
  [...new Set(values.filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b, "pt"));
export function PricingPanel({ data }: { data: ObservatoryData }) {
  const [filters, setFilters] = useState({ category: "", unit: "", nature: "", rawUnit: "" });
  const filtered = data.prices.filter((p) =>
    Object.entries(filters).every(
      ([key, value]) =>
        !value ||
        (value === "__unknown"
          ? !p[key as keyof typeof filters]
          : p[key as keyof typeof filters] === value),
    ),
  );
  const median = comparableMedian(filtered);
  const keys = ["category", "unit", "nature", "rawUnit"] as const;
  const labels = [
    "Categoria de preço",
    "Unidade harmonizada",
    "Natureza comercial",
    "Condições / unidade original",
  ];
  const money = (value: number | null) =>
    typeof value === "number"
      ? `${value.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`
      : "Por confirmar";
  return (
    <>
      <p className="obs-note">
        Referências descritivas. Valores públicos, custos e referências por validar não constituem
        uma cotação.
      </p>
      <div className="obs-filters">
        {keys.map((key, i) => (
          <label key={key}>
            {labels[i]}
            <select
              aria-label={labels[i]}
              value={filters[key]}
              onChange={(e) => setFilters((v) => ({ ...v, [key]: e.target.value }))}
            >
              <option value="">Todas</option>
              <option value="__unknown">Por confirmar</option>
              {options(data.prices.map((p) => p[key])).map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <Metrics
        values={[
          ["Referências", filtered.length, "registos de preço"],
          [
            "Com valor",
            filtered.filter((p) => typeof p.reference === "number" && Number.isFinite(p.reference))
              .length,
            "referência numérica em EUR",
          ],
          [
            "Mediana comparável",
            median === null ? "—" : money(median),
            "mesma categoria, unidade, condições e natureza",
          ],
        ]}
      />
      {median === null && (
        <p className="obs-notice">
          Não existe um grupo comparável com valores numéricos. Escolha a mesma categoria, unidade,
          natureza e condições; unidades desconhecidas não permitem estatística comparativa.
        </p>
      )}
      <DataTable
        columns={[
          "Modalidade",
          "Destino",
          "Unidade original",
          "Unidade harmonizada",
          "Natureza",
          "Referência",
          "Adulto",
          "Sénior",
          "Criança",
          "Condições",
          "Fonte",
        ]}
        rows={filtered.map((p: ObservatoryPrice) => [
          display(p.name),
          display(p.destination),
          display(p.rawUnit),
          display(p.unit),
          display(p.nature),
          money(p.reference),
          money(p.adult),
          money(p.senior),
          money(p.child),
          display(p.conditions),
          display(p.source),
        ])}
      />
    </>
  );
}
export function HistoryPanel({ data }: { data: ObservatoryData }) {
  const [place, setPlace] = useState("");
  const groups = new Map<string, Set<string>>();
  for (const activity of data.history.activities.filter((a) => !place || a.location === place)) {
    if (!activity.name || !activity.route) continue;
    const set = groups.get(activity.name) ?? new Set();
    set.add(activity.route);
    groups.set(activity.name, set);
  }
  const ranked = [...groups]
    .map(([name, routes]) => [name, routes.size] as [string, number])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);
  return (
    <>
      <Metrics
        values={[
          ["Roteiros", data.history.routeCount, "registos estruturados"],
          ["PDF históricos", data.history.documentCount, "documentos distintos dos roteiros"],
          ["Com data explícita", data.history.datedCount, "sem inferência de evolução temporal"],
        ]}
      />
      {!data.history.available ? (
        <p className="obs-notice">Histórico estruturado indisponível nesta entrega.</p>
      ) : (
        <>
          <label className="obs-single-filter">
            Localização no histórico
            <select
              aria-label="Localização no histórico"
              value={place}
              onChange={(e) => setPlace(e.target.value)}
            >
              <option value="">Todas</option>
              {options(data.history.activities.map((a) => a.location)).map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <Bars rows={ranked} />
          <p className="obs-note">
            Menções em roteiros distintos. A ausência de menções não demonstra ausência de procura.
            Não representa vendas ou satisfação.
          </p>
        </>
      )}
    </>
  );
}
export function QualityPanel({
  data,
  onSelect,
}: {
  data: ObservatoryData;
  onSelect: (key: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [state, setState] = useState("");
  const evidence = data.evidence.filter(
    (e) =>
      (!state || e.confirmation === state) &&
      (e.name + e.field_label).toLocaleLowerCase("pt").includes(query.toLocaleLowerCase("pt")),
  );
  return (
    <>
      <p className="obs-notice">
        {data.validation
          ? data.validation.status === "passed"
            ? "O catálogo passou os controlos de qualidade dos dados."
            : "A entrega tem ocorrências de validação a consultar."
          : "Relatório de validação indisponível."}{" "}
        Integridade e preenchimento não certificam informação comercial.
      </p>
      <Metrics
        values={[
          [
            "Confirmação pendente",
            data.evidence.filter((e) => e.confirmation === "pendente").length,
            "campos sem evidência completa",
          ],
          [
            "Prazo desconhecido",
            data.evidence.filter((e) => e.temporal_state === "prazo_desconhecido").length,
            "campos sem janela temporal completa",
          ],
          [
            "Prazo expirado",
            data.evidence.filter((e) => e.temporal_state === "expirada").length,
            "campos a rever na fonte",
          ],
        ]}
      />
      <h3>Confirmação e validade por campo</h3>
      <div className="obs-filters">
        <label>
          Pesquisar campo ou registo
          <input value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <label>
          Confirmação
          <select aria-label="Confirmação" value={state} onChange={(e) => setState(e.target.value)}>
            <option value="">Todas</option>
            {Object.entries(confirmation).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="obs-note">
        Reavaliado em {data.evaluatedOn}. Confirmação exige evidência vinculada ao mesmo valor;
        validade exige uma janela temporal completa.
      </p>
      <DataTable
        columns={["Registo", "Campo", "Confirmação", "Estado temporal", "Verificado em", "Fonte"]}
        rows={evidence.map((e) => [
          data.records.some((r) => r.key === e.entity_key) ? (
            <button
              type="button"
              className="obs-text-button"
              onClick={() => onSelect(e.entity_key)}
            >
              {e.name}
            </button>
          ) : (
            e.name
          ),
          e.field_label,
          confirmation[e.confirmation] ?? e.confirmation,
          temporal[e.temporal_state] ?? e.temporal_state,
          display(e.verified_on),
          display(e.evidence_source),
        ])}
      />
      <details className="mt-6">
        <summary>Lacunas declaradas na entrega · {data.gaps.length} campos</summary>
        <DataTable
          columns={["Tabela", "Campo", "Em falta", "Registos"]}
          rows={data.gaps.map((g) => [g.table, g.field, g.missing, g.records])}
        />
        <p className="obs-note">
          Camadas distintas: não somar lacunas como entidades únicas. Texto de confirmação também
          exige revisão.
        </p>
      </details>
      <details className="mt-4">
        <summary>Divergências entre fontes · {data.conflicts.length}</summary>
        <DataTable
          columns={["Tabela", "Registo", "Campo"]}
          rows={data.conflicts.map((c) => [c.table, c.record, c.field])}
        />
      </details>
    </>
  );
}
