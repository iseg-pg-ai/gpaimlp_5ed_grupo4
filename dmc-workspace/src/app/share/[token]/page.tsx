import { portalUrl } from "@/lib/http-client";
import { notFound } from "next/navigation";
import { VersionStore } from "@/lib/version-store";

export const dynamic = "force-dynamic";

export default async function SharedProposalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const store = new VersionStore();
  let share;
  try {
    share = store.getShare(token);
  } catch {
    notFound();
  } finally {
    store.close();
  }
  return (
    <main className="portal-page min-h-full bg-[var(--portal-bg-f4f0e7)] text-[var(--portal-text-143f4b)]">
      <article className="mx-auto max-w-2xl rounded-2xl border border-[var(--portal-line-d5d1c7)] bg-[var(--portal-white)] p-6 shadow-sm sm:p-10">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--portal-text-896225)]">
          BLU Costa Travel
        </p>
        <h1 className="mt-4 font-serif-blu text-3xl">Proposta de viagem</h1>
        <p className="mt-2 text-lg">{share.customerName}</p>
        <dl className="mt-8 grid gap-5 rounded-xl bg-[var(--portal-bg-faf8f3)] p-5 sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-[var(--portal-text-6a8288)]">
              Destino
            </dt>
            <dd className="mt-1 font-semibold">{share.destination}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-[var(--portal-text-6a8288)]">
              Versão
            </dt>
            <dd className="mt-1 font-semibold">v{String(share.version).padStart(3, "0")}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-[var(--portal-text-6a8288)]">
              Datas
            </dt>
            <dd className="mt-1 font-semibold">
              {share.startDate} — {share.endDate}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-[var(--portal-text-6a8288)]">
              Idioma
            </dt>
            <dd className="mt-1 font-semibold">{share.locale.toUpperCase()}</dd>
          </div>
        </dl>
        <a
          href={portalUrl(`/api/shares/${share.token}/document`)}
          className="mt-8 inline-flex min-h-11 items-center rounded-lg bg-[var(--portal-bg-143f4b)] px-5 py-3 font-semibold text-white hover:bg-[var(--portal-bg-2d5b67)]"
        >
          Abrir proposta em PDF
        </a>
        <p className="mt-6 text-sm leading-6 text-[var(--portal-text-4a636b)]">
          Esta ligação apresenta a versão indicada acima. Alterações posteriores ao roteiro ou ao
          catálogo não modificam este documento.
        </p>
      </article>
    </main>
  );
}
