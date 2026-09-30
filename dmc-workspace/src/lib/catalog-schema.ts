export const categories = ['atracoes', 'restaurantes', 'experiencias'] as const;
export type Category = typeof categories[number];
export const statuses = ['draft', 'review', 'approved', 'inactive'] as const;
export type CatalogStatus = typeof statuses[number];
export const categoryLabels = { atracoes: 'Atividades', restaurantes: 'Restaurantes', experiencias: 'Experiências' };
export const statusLabels = { draft: 'Rascunho', review: 'Em revisão', approved: 'Aprovado', inactive: 'Inativo' };
export const fieldLabels = {
  name: 'Nome', location: 'Localização / cidade', address: 'Morada', description: 'Descrição',
  duration: 'Duração', price: 'Preço de referência (EUR e unidade)', contacts: 'Contactos',
  accessibility: 'Acessibilidade e condições', source: 'Fonte', effort: 'Esforço físico',
  kind: 'Tipo de atividade', hours: 'Horários e encerramentos', cuisine: 'Tipo de cozinha',
  dietary: 'Opções alimentares e alergénios', provider: 'Fornecedor', modality: 'Modalidade da experiência',
} as const;
export type Fields = Record<keyof typeof fieldLabels, string>;
export type CatalogRecord = { id: string; category: Category; status: CatalogStatus; revision: number; fields: Fields; raw: Record<string, unknown>; updatedAt: string; reason: string };
export type CatalogInput = { id?: string; category: Category; status: CatalogStatus; baseRevision: number | null; fields: Fields; reason: string };
export const emptyFields = (): Fields => Object.fromEntries(Object.keys(fieldLabels).map(k => [k, ''])) as Fields;
export function validateCatalogInput(value: unknown): asserts value is CatalogInput {
  if (!value || typeof value !== 'object') throw new Error('Registo inválido.');
  const v = value as CatalogInput;
  if (!categories.includes(v.category) || !statuses.includes(v.status)) throw new Error('Categoria ou estado inválido.');
  if (v.id !== undefined && (typeof v.id !== 'string' || !/^cat-[a-z0-9-]{16,64}$/.test(v.id))) throw new Error('Identificador inválido.');
  if (v.id ? !Number.isSafeInteger(v.baseRevision) || Number(v.baseRevision) < 1 : v.baseRevision !== null) throw new Error('Revisão inválida.');
  if (!v.fields || Object.keys(fieldLabels).some(k => typeof v.fields[k as keyof Fields] !== 'string' || v.fields[k as keyof Fields].length > 4000)) throw new Error('Campos inválidos (máximo 4000 caracteres).');
  if (!v.fields.name.trim() || v.fields.name.length > 200) throw new Error('Indique um nome até 200 caracteres.');
  if (typeof v.reason !== 'string' || !v.reason.trim() || v.reason.length > 500) throw new Error('Indique o motivo da alteração (até 500 caracteres).');
  if (v.status === 'approved' && !['Baixo', 'Moderado', 'Alto', 'Por confirmar'].includes(v.fields.effort)) throw new Error('Escolha um nível de esforço antes de aprovar.');
  if (v.status === 'approved' && ['location', 'description', 'duration', 'price', 'source', 'accessibility', 'effort'].some(k => !v.fields[k as keyof Fields].trim())) throw new Error('Para aprovar, preencha localização, descrição, duração, preço, fonte, acessibilidade e esforço.');
}
