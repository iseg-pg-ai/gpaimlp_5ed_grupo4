// Tarefas da equipa e feed «O que se passa». Cada tarefa fica como registo TASK# no perfil
// do lead (ou na partição TASKS-UNLINKED) e é listada por FollowUpIndex com estado
// TASK_OPEN/TASK_DONE e o prazo em followUpAt, como os casos; nada é apagado: «Feito»
// arquiva a tarefa e cada alteração fica em TASKLOG# e no feed (partição TEAM-FEED).
export const UNLINKED_TASKS = 'TASKS-UNLINKED';
export const TASK_STATE = { open: 'TASK_OPEN', done: 'TASK_DONE' };
export const TASK_STATUS = { todo: 'Por fazer', doing: 'Em curso', blocked: 'Bloqueado', done: 'Feito' };
export const FEED = { partition: 'TEAM-FEED', status: 'FEED', days: 7, limit: 100 };
// FollowUpIndex precisa de followUpAt; tarefas sem prazo ficam no fim da ordenação.
export const NO_DUE = '9999-12-31';

const text = (value, maximum) => (typeof value === 'string' ? value.trim().slice(0, maximum) : '');
const isDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value ?? '') && !Number.isNaN(Date.parse(value));
const plusDays = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 864e5).toISOString().slice(0, 10);
export const validRecordId = id => /^[A-Za-z0-9-]{8,64}$/.test(id ?? '');

/** Valida uma tarefa nova; sem responsável indicado, fica para quem a cria. */
export function parseTask(body, { staff, user }) {
  const title = text(body.title, 140);
  const owner = text(body.owner, 254).toLowerCase() || user.email.toLowerCase();
  const due = body.due ? (isDate(body.due) ? body.due : null) : '';
  const caseId = text(body.caseId, 64);
  if (!title) return { error: 'Indique o que há a fazer.' };
  if (!staff.includes(owner)) return { error: 'O responsável tem de ser um membro da equipa.' };
  if (due === null) return { error: 'Prazo inválido.' };
  if (caseId && !validRecordId(caseId)) return { error: 'Caso inválido.' };
  return { record: { title, note: text(body.note, 1000), owner, due, caseId, taskStatus: 'todo' } };
}

/** Atualização: estado, responsável, prazo, título e nota; bloquear exige o motivo. */
export function parseTaskUpdate(body, current, { staff }) {
  const set = {};
  if (body.status !== undefined) {
    if (!TASK_STATUS[body.status]) return { error: 'Estado inválido.' };
    if (body.status !== current.status) set.taskStatus = body.status;
    if (body.status === 'blocked') {
      const reason = text(body.blockedReason, 280);
      if (!reason) return { error: 'Diga o que está a bloquear a tarefa.' };
      set.blockedReason = reason;
    } else if (current.blockedReason) set.blockedReason = '';
  }
  if (body.owner !== undefined) {
    const owner = text(body.owner, 254).toLowerCase();
    if (!staff.includes(owner)) return { error: 'O responsável tem de ser um membro da equipa.' };
    if (owner !== current.owner) set.owner = owner;
  }
  if (body.due !== undefined) {
    if (body.due && !isDate(body.due)) return { error: 'Prazo inválido.' };
    if ((body.due || '') !== current.due) set.due = body.due || '';
  }
  if (body.title !== undefined) {
    const title = text(body.title, 140);
    if (!title) return { error: 'O título não pode ficar vazio.' };
    if (title !== current.title) set.title = title;
  }
  const note = text(body.note, 1000);
  if (!Object.keys(set).length && !note) return { error: 'Nada para atualizar.' };
  return { set, note };
}

/** Campos de índice que acompanham estado e prazo (arquivo quando «Feito»). */
export function indexFields(status, due, at) {
  return status === 'done'
    ? { followUpStatus: TASK_STATE.done, followUpAt: at }
    : { followUpStatus: TASK_STATE.open, followUpAt: due || NO_DUE };
}

/** Situação do prazo para destacar no ecrã (data de Lisboa). */
export function dueState(task, today) {
  if (task.status === 'done') return 'done';
  if (!task.due) return 'none';
  if (task.due < today) return 'overdue';
  if (task.due === today) return 'today';
  if (task.due <= plusDays(today, 2)) return 'soon';
  return 'on-track';
}

/** Frase do feed para uma alteração; sem contactos nem texto de clientes. */
export function describeChange(set, task, owners = {}) {
  const name = email => owners[email] ?? email;
  if (set.taskStatus === 'blocked' || set.blockedReason) return `bloqueou «${task.title}»: ${set.blockedReason}`;
  if (set.taskStatus) return `moveu «${task.title}» para ${TASK_STATUS[set.taskStatus]}`;
  if (set.owner) return `passou «${task.title}» a ${name(set.owner)}`;
  if (set.due !== undefined) return set.due ? `mudou o prazo de «${task.title}» para ${set.due}` : `tirou o prazo de «${task.title}»`;
  if (set.title) return `mudou o título para «${set.title}»`;
  return `comentou «${task.title}»`;
}
