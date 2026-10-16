import type { Snapshot } from "./itinerary-pdf";
import { isLocale } from "./locales.ts";
import { translateLocal } from "./local-translation.ts";
export async function prepareCommunication(
  snapshot: Snapshot,
  locale: unknown,
  kind: unknown = "client",
) {
  if (!isLocale(locale)) throw new Error("Idioma inválido.");
  // Lista explícita: nunca copiar contactos, referências, notas internas ou preços não validados.
  if (!["client", "supplier"].includes(String(kind)))
    throw new Error("Tipo de comunicação inválido.");
  const text =
    kind === "supplier"
      ? [
          `Pedido de informação · ${snapshot.brief.destination}`,
          `${snapshot.brief.startDate} — ${snapshot.brief.endDate}`,
          "Solicitamos informação para preparar uma proposta. Este pedido não confirma nem autoriza qualquer reserva.",
          ...snapshot.itinerary.flatMap((day) =>
            day.items
              .filter(
                (item) =>
                  item.category !== "free_time" && item.confirmation?.status !== "confirmed",
              )
              .map(
                (item) =>
                  `Dia ${day.dayNumber} · ${item.title} · horário proposto ${item.time}. Agradecemos confirmação de disponibilidade, preço, unidade, condições de cancelamento e acessibilidade.`,
              ),
          ),
          "A contratação depende de aprovação posterior. Aguardamos a informação para revisão.",
        ]
      : [
          `Proposta de viagem · ${snapshot.brief.destination}`,
          `${snapshot.brief.startDate} — ${snapshot.brief.endDate}`,
          "Enviamos a proposta para a sua revisão. Horários, disponibilidade e reservas estão sujeitos a confirmação.",
          ...snapshot.itinerary.flatMap((day) => [
            `Dia ${day.dayNumber} · ${day.location}`,
            ...day.items.map((item) => `${item.time} · ${item.title}`),
          ]),
          "Aguardamos os seus comentários antes de confirmar os serviços.",
        ];
  const translated =
    locale === "pt"
      ? text
      : await translateLocal(
          text.map((text) => ({ text, source: "pt" as const })),
          locale,
        );
  return { locale, draft: translated.join("\n\n"), requiresReview: true, sent: false };
}
