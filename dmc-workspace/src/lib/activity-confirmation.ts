import type { ActivityItem } from '../types/index';
export type ActivityConfirmation = {
  catalogDetails?: ActivityItem['catalogDetails'];
  status: 'pending' | 'confirmed'; time: string; location: string; price: string;
  supplier: string; reference: string; contact: string; notes: string;
  checks: { label: string; resolved: boolean; details: string }[];
  confirmedAt: string | null;
};
export const confirmationFields = { time: 'Horário', location: 'Local / ponto de encontro', price: 'Preço e unidade (validar para esta viagem)', supplier: 'Fornecedor', reference: 'Referência da reserva', contact: 'Contacto do fornecedor', notes: 'Evidência da confirmação ou motivo de dispensa de reserva' };
export function initialConfirmation(item: ActivityItem): ActivityConfirmation {
  // Saved trip-specific edits always win, including deliberately cleared fields.
  if (item.confirmation) return item.confirmation;
  const data = item.catalogDetails;
  const referencePrice = data?.price ?? (item.priceNote ?? '').replace(/^Referência, confirmar:\s*/i, '').replace(/^Referência:\s*/i, '');
  const price = /^(por confirmar|sem preço|não indicado|a confirmar)$/i.test(referencePrice.trim()) ? '' : referencePrice;
  return { status: 'pending', time: /^\d{2}:\d{2}$/.test(item.time) ? item.time : '', location: data?.location || item.location || '', price, supplier: data?.supplier ?? '', reference: '', contact: data?.contact ?? '', notes: '', confirmedAt: null, checks: [...new Set(item.pendingChecks ?? [])].map(label => ({ label, resolved: false, details: /preço/i.test(label) ? price : /acessibilidade/i.test(label) ? data?.accessibility || item.accessibilityNotes || '' : /alimenta/i.test(label) ? data?.dietary || item.dietaryNotes || '' : /desloca|encontro/i.test(label) ? data?.location || '' : '' })) };
}
export function outstandingChecks(item: ActivityItem) {
  return (item.pendingChecks ?? []).filter(label => !item.confirmation?.checks.some(c => c.label === label && c.resolved));
}
export function validateConfirmation(item: ActivityItem, value: unknown): asserts value is ActivityConfirmation {
  if (!value || typeof value !== 'object') throw new Error('Confirmação inválida.');
  const c = value as ActivityConfirmation;
  if (c.catalogDetails && Object.values(c.catalogDetails).some(v => typeof v !== 'string' || v.length > 20000)) throw new Error('Dados de catálogo inválidos.');
  if (!['pending', 'confirmed'].includes(c.status)) throw new Error('Estado de confirmação inválido.');
  for (const key of Object.keys(confirmationFields) as (keyof typeof confirmationFields)[]) if (typeof c[key] !== 'string' || c[key].length > 4000) throw new Error('Dados de confirmação inválidos.');
  if (c.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(c.time)) throw new Error('Indique um horário válido.');
  const labels = [...new Set(item.pendingChecks ?? [])];
  if (!Array.isArray(c.checks) || c.checks.length !== labels.length || new Set(c.checks.map(check => check?.label)).size !== labels.length || c.checks.some(check => !check || !labels.includes(check.label) || typeof check.resolved !== 'boolean' || typeof check.details !== 'string' || check.details.length > 4000 || (check.resolved && !check.details.trim()))) throw new Error('Registe os dados de cada pendência antes de a marcar como resolvida.');
  if (c.status === 'confirmed') {
    if (!c.time || !c.location.trim() || !c.price.trim() || (!c.notes.trim() && !c.checks.some(check => check.details.trim())) || c.checks.some(check => !check.resolved)) throw new Error('Para confirmar, preencha os dados em falta e resolva as pendências. A evidência pode ficar nas pendências ou nas notas, sem repetir informação.');
    if (typeof c.confirmedAt !== 'string' || !Number.isFinite(Date.parse(c.confirmedAt))) throw new Error('Data de confirmação inválida.');
  } else if (c.confirmedAt !== null) throw new Error('Uma atividade pendente não pode manter a data de confirmação.');
}
export function applyConfirmation(item: ActivityItem, confirmation: ActivityConfirmation): ActivityItem {
  if (item.isLocked) throw new Error('Desproteja a atividade antes de editar as confirmações.');
  validateConfirmation(item, confirmation);
  return { ...item, catalogDetails: confirmation.catalogDetails ?? item.catalogDetails, confirmation, time: confirmation.time || 'Por agendar', location: confirmation.location };
}
