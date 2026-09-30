import { T } from "@/components/LocaleProvider";

export default function CatalogPage() {
  return <main className="mx-auto max-w-5xl p-4 sm:p-8 text-[#143F4B]">
    <h1 className="font-serif-blu text-3xl"><T text="Catálogo" source="pt"/></h1>
    <p className="mt-4"><T text="Atividades, restaurantes e experiências" source="pt"/></p>
    <div className="mt-6 rounded-xl border border-[#D5D1C7] bg-white p-5">
      <p><T text="A gestão do catálogo será disponibilizada numa próxima etapa. Por enquanto, os roteiros usam o catálogo importado pelo ETL." source="pt"/></p>
    </div>
  </main>;
}
