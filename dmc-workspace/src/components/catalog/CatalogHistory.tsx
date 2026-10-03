"use client";
import { SourceFields } from "../SourceFields";
import type { RefObject } from "react";
import { T } from "@/components/LocaleProvider";
import { CatalogCompatibility } from "@/components/CatalogCompatibility";
import {
  formatPricing,
  statusLabels,
  fieldLabels,
  type CatalogRecord,
  type Fields,
} from "@/lib/catalog-schema";
import { catalogButton as button } from "./styles";
type Props = {
  history: CatalogRecord[];
  onClose: () => void;
  historyRef: RefObject<HTMLElement | null>;
};
export function CatalogHistory({ history, onClose, historyRef }: Props) {
  return (
    <section
      ref={historyRef}
      data-testid="catalog-history"
      className="my-6 rounded-2xl border bg-white p-4 sm:p-6"
    >
      <div className="flex flex-wrap justify-between gap-3">
        <h2 className="text-xl">
          <T text="Histórico de alterações" source="pt" />
        </h2>
        <button className={button} onClick={onClose}>
          <T text="Fechar" source="pt" />
        </button>
      </div>
      <ol className="mt-4 space-y-4">
        {history.map((h) => (
          <li key={h.revision} className="border-t pt-4">
            <p className="break-words font-semibold">
              {h.fields.name} · v{h.revision} · <T text={statusLabels[h.status]} source="pt" />
            </p>
            <p className="my-2 text-sm">
              {new Date(h.updatedAt).toLocaleString()} · {h.reason}
            </p>
            <p className="break-all text-xs">{h.id}</p>
            <details className="mt-2 text-sm">
              <summary className="cursor-pointer py-2">
                <T text="Ver dados desta revisão" source="pt" />
              </summary>
              {h.operational && <SourceFields value={h.operational} />}
              {h.subcategory && (
                <p>
                  <T text="Subcategoria" source="pt" />: <T text={h.subcategory} source="pt" />
                </p>
              )}
              {h.pricing && (
                <p className="my-3">
                  <T text="Preços" source="pt" />: {formatPricing(h.pricing)}
                </p>
              )}
              <dl className="grid gap-3 sm:grid-cols-2">
                {Object.entries(h.fields)
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <div className="min-w-0" key={k}>
                      <dt className="font-semibold">
                        <T text={fieldLabels[k as keyof Fields]} source="pt" />
                      </dt>
                      <dd className="break-words whitespace-pre-wrap">{v}</dd>
                    </div>
                  ))}
              </dl>
              {h.matching && (
                <div className="mt-4">
                  <CatalogCompatibility
                    structuredPricing={Boolean(h.pricing)}
                    value={h.matching}
                    restaurant={h.category === "restaurantes"}
                  />
                </div>
              )}
            </details>
          </li>
        ))}
      </ol>
    </section>
  );
}
