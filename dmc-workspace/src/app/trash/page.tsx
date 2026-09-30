import { T } from "@/components/LocaleProvider";

export default function TrashPage() {
  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-8 text-[#143F4B]">
      <h1 className="font-serif-blu text-3xl">
        <T text="Lixo" source="pt" />
      </h1>
      <div className="mt-6 rounded-xl border border-[#D5D1C7] bg-white p-5">
        <p>
          <T
            text="A remoção e recuperação de viagens será disponibilizada numa próxima etapa. Ainda não é possível enviar viagens para o lixo."
            source="pt"
          />
        </p>
      </div>
    </main>
  );
}
