// Centro de operações (separador Agenda): tudo o que está em aberto num só formato, com o estado
// (bloqueado, em atraso, sem responsável, cliente a desistir, hoje, falha de envio), o motivo, há
// quanto tempo espera, quem é o responsável e quem pode desbloquear. As regras são fixas e
// explicadas em `why`; não há modelo a decidir. Leads de demonstração já vêm filtrados em loadWork.
import { isOverdue } from './model.mjs';
import { BLOCKERS } from './tasks.mjs';

export const OPS_STATES = {
  blocked: 'Bloqueado', overdue: 'Em atraso', unassigned: 'Sem responsável', risk: 'Cliente a desistir', today: 'Hoje', failed: 'Falha de envio',
};
// Onde se concentram os bloqueios: os tipos das tarefas e os que se deduzem dos outros itens.
export const OPS_BLOCKERS = {
  ...BLOCKERS, owner: 'Sem responsável', response: 'Resposta da equipa', late: 'Tarefa em atraso', case: 'Prazo de reclamação',
};
// Bloqueios antigos sem tipo: deduz-se do motivo escrito, sem adivinhar mais do que isto.
export const guessBlocker = reason => {
  const text = (reason ?? '').toLowerCase();
  if (/parceir|partner|fornecedor|hotel|guia|motorista|transfer/.test(text)) return 'partner';
  if (/client|viajante/.test(text)) return 'client';
  if (/propost|orçament|orcament|preço|preco/.test(text)) return 'proposal';
  if (/agenda|horári|horari|conflit|disponib/.test(text)) return 'schedule';
  if (/whatsapp|mensagem|sms|email|envio/.test(text)) return 'whatsapp';
  return 'other';
};
export const OPS_KINDS = { lead: 'Lead', task: 'Tarefa', message: 'Mensagem', reminder: 'Lembrete', case: 'Caso', service: 'Serviço' };

const lower = value => (value ?? '').toLowerCase();
const can = (groups, ...wanted) => groups.some(group => wanted.includes(group));
const lisbonDay = iso => (Number.isNaN(Date.parse(iso ?? '')) ? '' : new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(Date.parse(iso)));

/**
 * Itens do centro de operações. `failed` são lembretes falhados, não enviados a tempo ou preparados
 * para envio à mão; `services` são os lembretes de hoje (um serviço por ocorrência).
 */
export function opsItems({ work, failed = [], services = [], members = [], partners = [], demoIds = new Set() }) {
  const { at, today, settings, leads, tasks, prepared, cases, threads } = work;
  const active = members.filter(member => member.enabled);
  const byEmail = new Map(active.map(member => [lower(member.email), member]));
  const nameOf = email => byEmail.get(lower(email))?.name ?? email ?? '';
  const isActive = email => byEmail.has(lower(email));
  const leadOf = new Map(leads.map(lead => [lead.id, lead]));
  const partnerName = id => partners.find(partner => partner.id === id)?.name ?? '';

  // Carga de cada pessoa ativa (leads, tarefas e casos em aberto): o desbloqueio vai para quem tem menos.
  const load = new Map(active.map(member => [lower(member.email), 0]));
  for (const owner of [...leads.map(lead => lead.assignedTo), ...tasks.map(task => task.owner), ...cases.map(item => item.owner)]) {
    if (load.has(lower(owner))) load.set(lower(owner), load.get(lower(owner)) + 1);
  }
  const leastLoaded = (groups, why) => {
    const [pick] = active.filter(member => can(member.groups, ...groups))
      .sort((a, b) => load.get(lower(a.email)) - load.get(lower(b.email)) || a.name.localeCompare(b.name));
    return pick ? { email: lower(pick.email), name: pick.name, why } : null;
  };
  const person = (email, why) => (isActive(email) ? { email: lower(email), name: nameOf(email), why } : null);
  const leadOwner = id => leadOf.get(id)?.assignedTo ?? '';

  const items = [];
  const add = item => items.push({
    ...item, owner: lower(item.owner), ownerName: item.owner ? nameOf(item.owner) : '',
    states: [...new Set(item.states)].filter(Boolean), demo: demoIds.has(item.partition), partnerName: item.partnerName || (item.partnerId ? partnerName(item.partnerId) : ''),
  });

  for (const lead of leads) {
    const owned = isActive(lead.assignedTo);
    const late = lead.replyLate || isOverdue(lead, at);
    const states = [owned ? '' : 'unassigned', late ? 'overdue' : '', lead.atRisk ? 'risk' : '', lisbonDay(lead.replyDueAt || lead.followUpAt) === today ? 'today' : ''];
    add({
      key: `lead:${lead.id}`, kind: 'lead', id: lead.id, partition: lead.id, title: lead.journey.destination || lead.id,
      detail: [lead.journey.timeframe, lead.journey.party].filter(Boolean).join(' · '), owner: owned ? lead.assignedTo : '', states,
      reason: lead.atRisk ? `Cliente disse que vai desistir${lead.churnSignal ? `: «${lead.churnSignal}»` : ''}.`
        : !owned ? (lead.assignedTo ? 'O responsável já não está ativo.' : 'Ninguém assumiu o lead.')
        : late ? 'Passou o prazo de resposta ao cliente.' : 'Responder hoje.',
      since: (owned ? lead.replyDueAt : lead.lastActivityAt) || lead.followUpAt, due: lead.replyDueAt || lead.followUpAt,
      resolver: owned ? person(lead.assignedTo, 'responsável pelo lead') : leastLoaded(['curators', 'founders'], 'curador(a) ou fundador(a) com menos trabalho em aberto'),
      blocker: lead.atRisk ? 'client' : !owned ? 'owner' : late ? 'response' : '',
    });
  }

  for (const task of tasks) {
    const owned = isActive(task.owner);
    const states = [task.status === 'blocked' ? 'blocked' : '', task.dueState === 'overdue' ? 'overdue' : '', owned ? '' : 'unassigned', task.due === today ? 'today' : ''];
    // Uma tarefa bloqueada desbloqueia-se com quem a pediu; se foi a própria pessoa, com um fundador.
    const resolver = task.status === 'blocked'
      ? (lower(task.createdBy) !== lower(task.owner) && person(task.createdBy, 'pediu esta tarefa')) || leastLoaded(['founders'], 'fundador(a) com menos trabalho em aberto')
      : owned ? person(task.owner, 'responsável pela tarefa') : leastLoaded(['curators', 'founders', 'governance'], 'pessoa da equipa com menos trabalho em aberto');
    add({
      key: `task:${task.id}`, kind: 'task', id: task.id, partition: task.partition, title: task.title,
      detail: [task.leadLabel || task.leadId, task.note].filter(Boolean).join(' · '), owner: owned ? task.owner : '', states,
      reason: task.status === 'blocked' ? task.blockedReason || 'Bloqueada sem motivo.' : task.dueState === 'overdue' ? `Prazo ${task.due} passou.` : !owned ? 'Sem responsável ativo.' : 'Prazo hoje.',
      since: task.status === 'blocked' ? task.updatedAt : task.due ? `${task.due}T00:00:00Z` : task.createdAt, due: task.due,
      resolver, task: { status: task.status, createdBy: lower(task.createdBy), createdByName: nameOf(task.createdBy) },
      blocker: task.status === 'blocked' ? (BLOCKERS[task.blockerType] ? task.blockerType : guessBlocker(task.blockedReason)) : !owned ? 'owner' : task.dueState === 'overdue' ? 'late' : '',
    });
  }

  for (const thread of threads.filter(item => item.waiting)) {
    const last = thread.messages.at(-1);
    const owner = leadOwner(thread.leadId);
    const owned = isActive(owner);
    const late = at - Date.parse(last.at) >= settings.replyHours * 36e5;
    add({
      key: `message:${thread.key}`, kind: 'message', id: thread.key, partition: thread.leadId, title: thread.name || thread.leadId || `+${thread.to}`,
      detail: last.text?.slice(0, 160) ?? '', owner: owned ? owner : '', states: [owned ? '' : 'unassigned', late ? 'overdue' : ''],
      reason: last.reason || 'Mensagem por responder.', since: last.at, due: '', partnerId: thread.partnerId,
      resolver: owned ? person(owner, 'responsável pelo lead') : leastLoaded(['curators', 'founders'], 'curador(a) ou fundador(a) com menos trabalho em aberto'),
      message: { key: thread.key, leadId: thread.leadId, suggestion: last.suggestion ?? '' },
      blocker: owned ? 'response' : 'owner',
    });
  }

  // Lembretes que precisam de uma pessoa: preparados para envio à mão, falhados ou não enviados a tempo.
  const seen = new Set();
  for (const item of [...prepared, ...failed]) {
    if (seen.has(item.recordKey)) continue;
    seen.add(item.recordKey);
    const owner = isActive(item.approvedBy) ? item.approvedBy : leadOwner(item.conversationId);
    add({
      key: `reminder:${item.recordKey}`, kind: 'reminder', id: item.recordKey, partition: item.conversationId, title: item.title,
      detail: [item.channel, item.audience].filter(Boolean).join(' · '), owner: isActive(owner) ? owner : '',
      states: ['failed', isActive(owner) ? '' : 'unassigned', lisbonDay(item.occurrenceAt) === today ? 'today' : ''],
      reason: item.reason || 'Enviar à mão.', since: item.sendAt, due: item.occurrenceAt, partnerName: item.partnerName,
      resolver: isActive(owner) ? person(owner, isActive(item.approvedBy) ? 'agendou o serviço' : 'responsável pelo lead') : leastLoaded(['curators', 'founders'], 'curador(a) ou fundador(a) com menos trabalho em aberto'),
      reminder: { text: item.text ?? '', activityId: item.activityId },
      blocker: 'whatsapp',
    });
  }

  for (const item of cases) {
    const owned = isActive(item.owner);
    const states = [item.deadlineState === 'overdue' ? 'overdue' : '', owned ? '' : 'unassigned', item.deadline === today ? 'today' : ''];
    add({
      key: `case:${item.id}`, kind: 'case', id: item.id, partition: item.partition, title: item.title, detail: item.type,
      owner: owned ? item.owner : '', states,
      reason: item.deadlineState === 'overdue' ? `Prazo legal ${item.deadline} passou.` : !owned ? 'Caso sem responsável.' : 'Prazo hoje.',
      since: item.receivedOn ? `${item.receivedOn}T00:00:00Z` : '', due: item.deadline,
      resolver: owned ? person(item.owner, 'responsável pelo caso') : leastLoaded(['governance', 'founders'], 'governança ou fundador(a) com menos trabalho em aberto'),
      blocker: item.deadlineState === 'overdue' ? 'case' : !owned ? 'owner' : '',
    });
  }

  // Serviços de hoje: uma linha por ocorrência, com o parceiro, para reagendar sem sair da página.
  const occurrences = new Map();
  for (const item of services) {
    const key = `${item.activityId}|${item.occurrenceAt}`;
    if (!occurrences.has(key) && lisbonDay(item.occurrenceAt) === today) occurrences.set(key, item);
  }
  for (const item of occurrences.values()) {
    const owner = isActive(item.approvedBy) ? item.approvedBy : leadOwner(item.conversationId);
    add({
      key: `service:${item.activityId}:${item.occurrenceAt}`, kind: 'service', id: item.activityId, partition: item.conversationId, title: item.title,
      detail: [item.place, item.people ? `${item.people} pessoa(s)` : ''].filter(Boolean).join(' · '), owner: isActive(owner) ? owner : '',
      states: ['today', isActive(owner) ? '' : 'unassigned'], reason: 'Serviço hoje.', since: '', due: item.occurrenceAt, partnerName: item.partnerName,
      resolver: isActive(owner) ? person(owner, 'agendou o serviço') : leastLoaded(['curators', 'founders'], 'curador(a) ou fundador(a) com menos trabalho em aberto'),
      service: { activityId: item.activityId, occurrenceAt: item.occurrenceAt },
    });
  }

  // Mais grave primeiro: bloqueado, desistência, atraso, sem responsável; dentro, o que espera há mais tempo.
  const weight = item => {
    const index = ['blocked', 'risk', 'overdue', 'failed', 'unassigned', 'today'].findIndex(state => item.states.includes(state));
    return index < 0 ? 99 : index;
  };
  return items.sort((a, b) => weight(a) - weight(b) || (a.since || '9').localeCompare(b.since || '9'));
}

/** Totais por estado e a lista para os filtros; «Só o meu» são os itens de que a pessoa é responsável ou pode desbloquear. */
export function opsView(items, { scope, me, members = [] }) {
  const mine = lower(me);
  const shown = scope === 'team' ? items : items.filter(item => item.owner === mine || item.resolver?.email === mine);
  const totals = Object.fromEntries(Object.keys(OPS_STATES).map(state => [state, shown.filter(item => item.states.includes(state)).length]));
  return {
    scope, items: shown, totals, states: OPS_STATES, kinds: OPS_KINDS, blockers: OPS_BLOCKERS,
    people: members.filter(member => member.enabled).map(member => ({ email: lower(member.email), name: member.name, groups: member.groups })),
  };
}
