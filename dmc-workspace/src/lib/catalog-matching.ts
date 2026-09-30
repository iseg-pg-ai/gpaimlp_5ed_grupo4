import { interestOptions, mobilityOptions, dietaryOptions, exclusionOptions, paceOptions, morningPaces, diningPaces } from './brief-options.ts';
import type { CustomerBrief } from '../types/index';

export const matchingOptions = {
  interests: interestOptions, tiers: ['Soft', 'Classic', 'Signature'], paces: paceOptions,
  mornings: morningPaces, diningPaces, mobilitySupported: mobilityOptions,
  dietarySupported: dietaryOptions, excludedBy: exclusionOptions,
};
export const matchingLabels = {
  interests: 'Interesses associados', tiers: 'Níveis de proposta compatíveis', paces: 'Ritmos de viagem compatíveis',
  mornings: 'Preferências de início compatíveis', diningPaces: 'Ritmos de refeição compatíveis',
  mobilitySupported: 'Necessidades de mobilidade verificadas', dietarySupported: 'Restrições alimentares verificadas',
  excludedBy: 'Excluir quando o cliente assinalar',
};
export type MatchingProfile = Record<keyof typeof matchingOptions, string[]> & {
  food: 'unknown' | 'yes' | 'no'; children: 'unknown' | 'allowed' | 'adults_only';
  minAge: number | null; maxGroup: number | null; pricePerPerson: number | null;
  validFrom: string; validUntil: string; verificationNotes: string;
};
export const emptyMatching = (): MatchingProfile => ({ interests: [], tiers: [], paces: [], mornings: [], diningPaces: [], mobilitySupported: [], dietarySupported: [], excludedBy: [], food: 'unknown', children: 'unknown', minAge: null, maxGroup: null, pricePerPerson: null, validFrom: '', validUntil: '', verificationNotes: '' });
export function validateMatching(value: unknown): asserts value is MatchingProfile {
  if (!value || typeof value !== 'object') throw new Error('Perfil de compatibilidade inválido.');
  const p = value as MatchingProfile;
  for (const key of Object.keys(matchingOptions) as (keyof typeof matchingOptions)[]) {
    if (!Array.isArray(p[key]) || p[key].length > matchingOptions[key].length || new Set(p[key]).size !== p[key].length || p[key].some(v => !(matchingOptions[key] as readonly string[]).includes(v))) throw new Error('Opções de compatibilidade inválidas.');
  }
  if (!['unknown', 'yes', 'no'].includes(p.food) || !['unknown', 'allowed', 'adults_only'].includes(p.children)) throw new Error('Indique as condições de alimentação e crianças.');
  for (const key of ['minAge', 'maxGroup', 'pricePerPerson'] as const) if (p[key] !== null && (typeof p[key] !== 'number' || !Number.isFinite(p[key]) || p[key] < (key === 'maxGroup' ? 1 : 0) || p[key] > (key === 'minAge' ? 120 : key === 'maxGroup' ? 200 : 1000000) || (key !== 'pricePerPerson' && !Number.isInteger(p[key])))) throw new Error('Idade, capacidade ou preço inválido.');
  for (const key of ['validFrom', 'validUntil'] as const) if (typeof p[key] !== 'string' || (p[key] && (!/^\d{4}-\d{2}-\d{2}$/.test(p[key]) || !Number.isFinite(Date.parse(p[key])) || new Date(p[key]).toISOString().slice(0, 10) !== p[key]))) throw new Error('Datas de compatibilidade inválidas.');
  if (p.validFrom && p.validUntil && p.validFrom > p.validUntil) throw new Error('O fim do período deve ser posterior ao início.');
  if (typeof p.verificationNotes !== 'string' || p.verificationNotes.length > 4000 || ((p.mobilitySupported.length || p.dietarySupported.length) && !p.verificationNotes.trim())) throw new Error('Documente a fonte e as condições verificadas de mobilidade e alimentação.');
}

export function matchCatalogProfile(p: MatchingProfile, brief: CustomerBrief, date: string, restaurant: boolean) {
  const reasons: string[] = [];
  // The questionnaire does not capture adult ages; do not infer age-21 eligibility.
  if (p.minAge !== null && p.minAge > 18) return null;
  if ((p.validFrom && date < p.validFrom) || (p.validUntil && date > p.validUntil)) return null;
  for (const [key, value] of [['tiers', brief.proposalTier], ['paces', brief.pace], ['mornings', brief.morningPreference]] as const) {
    if (p[key].length && !p[key].includes(value)) return null;
    if (p[key].length) reasons.push(`Compatibilidade configurada: ${value}`);
  }
  if ((restaurant || p.food === 'yes') && p.diningPaces.length && !p.diningPaces.includes(brief.diningPace)) return null;
  if (brief.exclusions.some(v => p.excludedBy.includes(v))) return null;
  if (brief.mobilityRestrictions.some(v => !p.mobilitySupported.includes(v))) return null;
  if (brief.dietaryRestrictions.length) {
    if (!restaurant && p.food === 'unknown') return null;
    if ((restaurant || p.food === 'yes') && brief.dietaryRestrictions.some(v => !p.dietarySupported.includes(v))) return null;
  }
  if (p.maxGroup !== null && brief.adults + brief.children > p.maxGroup) return null;
  if (brief.children) {
    if (p.children !== 'allowed') return null;
    if (p.minAge !== null) {
      if (!/^\s*\d{1,2}(\s*[,;]\s*\d{1,2})*\s*$/.test(brief.childrenAges)) return null;
      const ages = brief.childrenAges.split(/[,;]/).map(Number);
      if (ages.length !== brief.children || ages.some(age => age < p.minAge! || age > 17)) return null;
    }
    reasons.push('Compatibilidade com crianças indicada no catálogo');
  }
  if (brief.mobilityRestrictions.length) reasons.push('Necessidades de mobilidade correspondem às condições registadas');
  if (brief.dietaryRestrictions.length && (restaurant || p.food === 'yes')) reasons.push('Restrições alimentares correspondem às condições registadas; reconfirmar com o fornecedor');
  const matches = brief.interests.filter(v => p.interests.includes(v));
  if (matches.length) reasons.push(`Interesses associados: ${matches.join(', ')}`);
  return { score: matches.length * 20, reasons };
}
