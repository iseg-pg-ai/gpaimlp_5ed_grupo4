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
    <main className="min-h-full bg-[#F4F0E7] px-4 py-10 text-[#143F4B]">
      <article className="mx-auto max-w-2xl rounded-2xl border border-[#D5D1C7] bg-white p-6 shadow-sm sm:p-10">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#896225]">
          BLU Costa Travel
        </p>
        <h1 className="mt-4 font-serif-blu text-3xl">Proposta de viagem</h1>
        <p className="mt-2 text-lg">{share.customerName}</p>
        <dl className="mt-8 grid gap-5 rounded-xl bg-[#FAF8F3] p-5 sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-[#6A8288]">Destino</dt>
            <dd className="mt-1 font-semibold">{share.destination}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-[#6A8288]">Versão</dt>
            <dd className="mt-1 font-semibold">v{String(share.version).padStart(3, "0")}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-[#6A8288]">Datas</dt>
            <dd className="mt-1 font-semibold">
              {share.startDate} — {share.endDate}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-[#6A8288]">Idioma</dt>
            <dd className="mt-1 font-semibold">{share.locale.toUpperCase()}</dd>
          </div>
        </dl>
        <a
          href={`/api/shares/${share.token}/document`}
          className="mt-8 inline-flex min-h-11 items-center rounded-lg bg-[#143F4B] px-5 py-3 font-semibold text-white hover:bg-[#2D5B67]"
        >
          Abrir proposta em PDF
        </a>
        <p className="mt-6 text-sm leading-6 text-[#4A636B]">
          Esta ligação apresenta a versão indicada acima. Alterações posteriores ao roteiro ou ao
          catálogo não modificam este documento.
        </p>
      </article>
    </main>
  );
}
