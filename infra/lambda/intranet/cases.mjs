// Registo de feedback, reclamações, Livro de Reclamações e litígios. Cada caso fica como
// registo CASE# no perfil do lead (ou na partição CASES-UNLINKED quando não há lead) e é
// listado por FollowUpIndex com estado CASE_OPEN/CASE_CLOSED e o prazo em followUpAt.
export const UNLINKED = 'CASES-UNLINKED';
export const CASE_STATE = { open: 'CASE_OPEN', closed: 'CASE_CLOSED' };
// DL 156/2005, na redação do DL 74/2017: resposta ao Livro de Reclamações em 15 dias úteis.
export const LIVRO_WORKING_DAYS = 15;

export const CASE_TYPES = {
  feedback: { label: 'Feedback', workingDays: 5 },
  complaint: { label: 'Reclamação', workingDays: 15 },
  livro: { label: 'Livro de Reclamações', workingDays: LIVRO_WORKING_DAYS },
  legal: { label: 'Litígio / contencioso', workingDays: null },
};
export const CASE_STATUS = { new: 'Novo', 'in-progress': 'Em curso', 'waiting-customer': 'À espera do cliente', resolved: 'Resolvido', closed: 'Fechado' };
export const CASE_CHANNELS = { email: 'Email', phone: 'Telefone', whatsapp: 'WhatsApp', livro: 'Livro de Reclamações', tripadvisor: 'TripAdvisor', 'in-person': 'Presencial', lawyer: 'Advogado / tribunal', other: 'Outro' };
const CLOSED = new Set(['resolved', 'closed']);

const text = (value, maximum) => (typeof value === 'string' ? value.trim().slice(0, maximum) : '');
const isDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value ?? '') && !Number.isNaN(Date.parse(value));
const iso = date => date.toISOString().slice(0, 10);

function easter(year) {
  // Algoritmo de Meeus/Jones/Butcher (calendário gregoriano).
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  return new Date(Date.UTC(year, month - 1, ((h + l - 7 * m + 114) % 31) + 1));
}

/** Feriados nacionais obrigatórios em Portugal (sem feriados municipais). */
export function portugueseHolidays(year) {
  const fixed = ['01-01', '04-25', '05-01', '06-10', '08-15', '10-05', '11-01', '12-01', '12-08', '12-25'].map(day => `${year}-${day}`);
  const e = easter(year);
  const shift = days => iso(new Date(e.getTime() + days * 864e5));
  return new Set([...fixed, shift(-2), shift(0), shift(60)]);
}

/** Soma dias úteis (sem fins de semana nem feriados nacionais) a uma data AAAA-MM-DD. */
export function addWorkingDays(date, days) {
  let current = new Date(`${date}T00:00:00Z`);
  let left = days;
  while (left > 0) {
    current = new Date(current.getTime() + 864e5);
    const weekday = current.getUTCDay();
    if (weekday !== 0 && weekday !== 6 && !portugueseHolidays(current.getUTCFullYear()).has(iso(current))) left -= 1;
  }
  return iso(current);
}

/** Valida um caso novo; o prazo legal do Livro de Reclamações não pode ser alargado. */
export function parseCase(body, { staff, today }) {
  const type = CASE_TYPES[body.type] ? body.type : '';
  const title = text(body.title, 140);
  const description = text(body.description, 2000);
  const channel = CASE_CHANNELS[body.channel] ? body.channel : 'other';
  const receivedOn = isDate(body.receivedOn) ? body.receivedOn : today;
  const owner = text(body.owner, 254).toLowerCase();
  const priority = body.priority === 'high' ? 'high' : 'normal';
  if (!type) return { error: 'Escolha o tipo de caso.' };
  if (!title) return { error: 'Indique um título.' };
  if (receivedOn > today) return { error: 'A data de receção não pode ser futura.' };
  if (owner && !staff.includes(owner)) return { error: 'O responsável tem de ser um membro da equipa.' };
  const legalDeadline = CASE_TYPES[type].workingDays ? addWorkingDays(receivedOn, CASE_TYPES[type].workingDays) : '';
  let deadline = isDate(body.deadline) ? body.deadline : legalDeadline;
  if (type === 'livro' && deadline > legalDeadline) deadline = legalDeadline;
  if (!deadline) return { error: 'Indique o prazo (por exemplo, a data da audiência ou da resposta ao tribunal).' };
  return { record: { type, title, description, channel, receivedOn, owner, priority, deadline, caseStatus: 'new', reference: text(body.reference, 80) } };
}

/** Atualização: estado, responsável, prazo (exceto alargar o do Livro), resolução e nota. */
export function parseCaseUpdate(body, current, { staff }) {
  const set = {};
  if (body.status !== undefined) {
    if (!CASE_STATUS[body.status]) return { error: 'Estado inválido.' };
    set.caseStatus = body.status;
    set.followUpStatus = CLOSED.has(body.status) ? CASE_STATE.closed : CASE_STATE.open;
  }
  if (body.owner !== undefined) {
    const owner = text(body.owner, 254).toLowerCase();
    if (owner && !staff.includes(owner)) return { error: 'O responsável tem de ser um membro da equipa.' };
    set.owner = owner;
  }
  if (body.deadline !== undefined) {
    if (!isDate(body.deadline)) return { error: 'Prazo inválido.' };
    if (current.type === 'livro' && body.deadline > addWorkingDays(current.receivedOn, LIVRO_WORKING_DAYS)) return { error: 'O prazo legal do Livro de Reclamações (15 dias úteis) não pode ser alargado.' };
    set.deadline = body.deadline;
    set.followUpAt = body.deadline;
  }
  if (body.resolution !== undefined) set.resolution = text(body.resolution, 2000);
  if ((set.caseStatus === 'resolved' || set.caseStatus === 'closed') && !(set.resolution ?? current.resolution)) return { error: 'Descreva a resolução antes de fechar o caso.' };
  const note = text(body.note, 2000);
  if (!Object.keys(set).length && !note) return { error: 'Nada para atualizar.' };
  return { set, note };
}

/** Situação do prazo para destacar no ecrã. */
export function deadlineState(caseItem, today) {
  if (CLOSED.has(caseItem.caseStatus)) return 'closed';
  if (caseItem.deadline < today) return 'overdue';
  if (caseItem.deadline <= addWorkingDays(today, 3)) return 'due-soon';
  return 'on-track';
}
