import type { CustomerBrief } from "../types/index";

// Propostas já guardadas que servem a um lead: pontuação determinística e explicável, sem modelo.
// O pedido do lead vem de leadToBrief (journeyJson); os candidatos são versões de propostas do DMC.
export type MatchBrief = Pick<
  CustomerBrief,
  | "customerName"
  | "destination"
  | "startDate"
  | "endDate"
  | "adults"
  | "children"
  | "budget"
  | "currency"
  | "interests"
>;
export type MatchCandidate = { tripId: string; version: number; brief: MatchBrief };
export type ProposalMatch = {
  tripId: string;
  version: number;
  destination: string;
  score: number;
  reasons: string[];
};

export const MATCH = { top: 2, minScore: 50, own: 10 } as const;

const fold = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const words = (value: string) => [
  ...new Set(
    fold(value)
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 2),
  ),
];
const days = (brief: MatchBrief) =>
  brief.startDate && brief.endDate
    ? Math.round((Date.parse(brief.endDate) - Date.parse(brief.startDate)) / 864e5) + 1
    : 0;

export function rankProposals(
  leadId: string,
  wanted: MatchBrief,
  candidates: MatchCandidate[],
): ProposalMatch[] {
  const place = words(wanted.destination);
  const matches: ProposalMatch[] = [];
  for (const { tripId, version, brief } of candidates) {
    const there = words(brief.destination);
    const hit = place.filter((word) => there.includes(word));
    if (!hit.length) continue;
    // Duas moedas diferentes nunca se comparam: um orçamento noutra moeda não serve.
    if (wanted.budget && brief.budget && wanted.currency !== brief.currency) continue;
    const reasons = [`Destino: ${brief.destination}`];
    let score = Math.round((40 * hit.length) / place.length);
    const people = wanted.adults + wanted.children;
    const offPeople = Math.abs(people - (brief.adults + brief.children));
    if (offPeople === 0) {
      score += 20;
      reasons.push(`Mesmo grupo: ${people} pessoas`);
    } else if (offPeople === 1) score += 10;
    const offDays = Math.abs(days(wanted) - days(brief));
    if (days(brief) && offDays <= 1) {
      score += 15;
      reasons.push(`Duração: ${days(brief)} dias`);
    } else if (days(brief) && offDays <= 2) score += 8;
    if (wanted.budget && brief.budget) {
      const gap = Math.abs(wanted.budget - brief.budget) / wanted.budget;
      if (gap <= 0.2) {
        score += 15;
        reasons.push(`Orçamento dentro de 20% (${brief.budget} ${brief.currency})`);
      } else if (gap <= 0.4) score += 7;
    }
    const shared = wanted.interests.filter((item) => brief.interests.includes(item));
    if (wanted.interests.length && shared.length) {
      score += Math.round((10 * shared.length) / wanted.interests.length);
      reasons.push(`Interesses: ${shared.join(", ")}`);
    }
    if (brief.customerName === `Lead ${leadId}`) {
      score += MATCH.own;
      reasons.push("Já criada para este lead");
    }
    if (score >= MATCH.minScore)
      matches.push({
        tripId,
        version,
        destination: brief.destination,
        score: Math.min(score, 100),
        reasons,
      });
  }
  return matches
    .sort((a, b) => b.score - a.score || a.tripId.localeCompare(b.tripId) || b.version - a.version)
    .slice(0, MATCH.top);
}
