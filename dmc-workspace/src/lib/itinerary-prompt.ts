import { outstandingChecks } from "./activity-confirmation.ts";
import { proposalBudget } from "./proposal-budget.ts";
import { languages, type Locale } from "./locales.ts";
import type { Snapshot, VersionMeta } from "./itinerary-pdf";

export function renderItineraryPrompt(
  snapshot: Snapshot,
  meta: Pick<VersionMeta, "tripId" | "version" | "createdAt" | "snapshotHash">,
  locale: Locale,
  instructions: string,
) {
  const budget = proposalBudget(snapshot);
  const amount = (cents: number | null) => (cents === null ? null : cents / 100);
  const proposal = {
    formato: "blu-roteiro-canva/1.1.0",
    versao: {
      viagem: meta.tripId,
      numero: meta.version,
      criadaEm: meta.createdAt,
      hashSnapshot: meta.snapshotHash,
    },
    estado: "Proposta preliminar para revisão do curador",
    idiomaSaida: languages.find((language) => language.code === locale)?.name,
    codigoIdioma: locale,
    modeloVisual: {
      url: "https://canva.link/5u8zxudd1vkcbth",
      designId: "DAHDpPXVRsU",
      titulo: "LISBON IN PERSPECTIVE",
      baseConteudo: "PDFs de proposta do DMC Workspace",
    },
    cliente: snapshot.brief.customerName,
    destino: snapshot.brief.destination,
    datas: { inicio: snapshot.brief.startDate, fim: snapshot.brief.endDate },
    participantes: { adultos: snapshot.brief.adults, criancas: snapshot.brief.children },
    chegada: snapshot.brief.arrivalLocation,
    partida: snapshot.brief.departureLocation,
    nivel: snapshot.brief.proposalTier,
    ritmo: snapshot.brief.pace,
    esforco: snapshot.brief.physicalEffort,
    inicioPreferido: snapshot.brief.morningPreference,
    interesses: snapshot.brief.interests,
    restricoes: {
      mobilidade: snapshot.brief.mobilityRestrictions,
      alimentacao: snapshot.brief.dietaryRestrictions,
      exclusoes: snapshot.brief.exclusions,
    },
    alojamento: snapshot.brief.accommodation,
    ritmoRefeicoes: snapshot.brief.diningPace,
    personalizacao: snapshot.brief.personalization
      ? {
          imperdiveis: snapshot.brief.personalization.mustHave,
          evitar: snapshot.brief.personalization.avoid,
          flexibilidadeOrcamentoPercentagem: snapshot.brief.personalization.budgetFlex,
          pausasExtra: snapshot.brief.personalization.extraBreaks,
          acompanhamento: snapshot.brief.personalization.accompaniment,
          idiomaGuia: snapshot.brief.personalization.guideLanguage,
        }
      : null,
    dias: snapshot.itinerary.map((day) => ({
      numero: day.dayNumber,
      data: day.date,
      titulo: day.title,
      local: day.location,
      resumo: day.summary ?? "",
      nivel: day.tier ?? snapshot.brief.proposalTier,
      capacidadeDiaria: day.dailyCapacity ?? null,
      resumoDeslocacoes: day.routeSummary
        ? {
            tempoTotal: day.routeSummary.totalTransitTime,
            distanciaTotal: day.routeSummary.totalDistance,
            numeroPercursos: day.routeSummary.legsCount,
            distanciaAPe: day.routeSummary.walkingDistance,
            sequencia: day.routeSummary.routePath,
            estadoOtimizacao: day.routeSummary.algorithmStatus,
            ressalva:
              "Estimativa guardada; não confirma trânsito, acessibilidade ou disponibilidade",
          }
        : null,
      atividades: day.items.map((item) => ({
        id: item.id,
        horario: item.time || "Por agendar",
        titulo: item.title,
        descricao: item.description ?? "",
        categoria: item.category,
        local: item.location ?? "",
        duracao: item.duration ?? "",
        preco: item.confirmation ? item.confirmation.price : (item.priceNote ?? ""),
        estado:
          item.confirmation?.status === "confirmed" ? "Confirmado pelo curador" : "Por confirmar",
        protegida: Boolean(item.isLocked),
        fonte: item.source ?? "Não indicada",
        notasAcessibilidade: item.accessibilityNotes ?? "",
        notasAlimentares: item.dietaryNotes ?? "",
        pendencias: outstandingChecks(item),
        deslocacao: item.transitToNext
          ? {
              origem: item.transitToNext.fromLocation,
              destino: item.transitToNext.toLocation,
              modo: item.transitToNext.mode,
              duracao: item.transitToNext.duration,
              distancia: item.transitToNext.distance ?? "",
              margemMinutos: item.transitToNext.bufferMinutes ?? null,
              nota: item.transitToNext.routeNote ?? "",
              estado: "Estimativa; percurso não verificado",
            }
          : null,
      })),
    })),
    orcamento: {
      disponivel: { valor: snapshot.brief.budget, moeda: snapshot.brief.currency },
      discriminacao: budget.lines.map((line) => ({
        descricao: line.description,
        quantidade: line.quantity,
        unidade: line.unit,
        valorUnitario: amount(line.unitCents),
        subtotal: amount(line.subtotalCents),
        moeda: line.currency,
        estado: line.status,
        nota: line.notes,
      })),
      totaisPorMoeda: Object.fromEntries(
        Object.entries(budget.totals).map(([currency, totals]) => [
          currency,
          { confirmado: amount(totals.confirmed), estimado: amount(totals.estimated) },
        ]),
      ),
      incompleto: budget.incomplete,
      condicoes: budget.terms,
    },
    pendencias: snapshot.pending,
  };
  return `${instructions.trim()}\n\n${JSON.stringify(proposal, null, 2)}\n`;
}
