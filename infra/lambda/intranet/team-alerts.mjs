import { atRisk, riskAt } from './model.mjs';
import { replyState } from './settings.mjs';

// Alertas à equipa: o seguimento verifica-se sozinho a cada 5 minutos e avisa quem tem o
// trabalho; sem responsável, avisa todos os curadores e fundadores, para não depender de uma
// só pessoa. Cada alerta tem uma chave fixa e só é enviado uma vez (registo ALERT#).
// O texto nunca leva contactos nem mensagens de clientes: só a referência e o destino.
export const TEAM_ALERTS = { partition: 'TEAM-ALERTS', prefix: 'ALERT#', status: 'TEAM_ALERT', days: 7, escalateHours: 4 };

const lower = email => (email ?? '').toLowerCase();
const unique = emails => [...new Set(emails.filter(Boolean).map(lower))];

/**
 * Lista os alertas em vigor. `members` vem do Cognito; só contas ativas recebem.
 * Um alerta sem destinatário fica com `to: []`, para o painel o mostrar como ponto de falha.
 */
export function teamAlerts({ leads = [], tasks = [], cases = [], reminders = [], members = [], replyHours, now = new Date() }) {
  const active = members.filter(member => member.enabled);
  const emailsOf = role => active.filter(member => member.groups.includes(role)).map(member => member.email);
  const founders = unique(emailsOf('founders'));
  const followUp = unique([...emailsOf('curators'), ...founders]);
  const isActive = email => active.some(member => lower(member.email) === lower(email));
  // Com responsável ativo, só essa pessoa; senão toda a equipa de seguimento.
  const ownerOr = (owner, fallback) => (owner && isActive(owner) ? [lower(owner)] : fallback);
  const label = lead => lead.journey?.destination ? `${lead.journey.destination} (${lead.id})` : lead.id;
  const alerts = [];
  const add = alert => alerts.push({ leadId: '', ...alert, to: unique(alert.to) });

  for (const lead of leads.filter(item => !item.synthetic)) {
    const owner = lead.assignedTo && isActive(lead.assignedTo) ? lower(lead.assignedTo) : '';
    if (atRisk(lead)) {
      add({ key: `risk#${lead.id}#${riskAt(lead)}`, level: 'bad', tab: 'leads', leadId: lead.id, to: [...ownerOr(owner, followUp), ...founders], text: `O cliente do lead ${label(lead)} disse que vai desistir: contactar já.` });
    }
    const { replyDueAt, replyLate } = replyState(lead, replyHours, now);
    if (!replyLate) continue;
    add({ key: `late#${lead.id}#${replyDueAt}`, level: 'bad', tab: 'leads', leadId: lead.id, to: ownerOr(owner, followUp), text: `O lead ${label(lead)} passou o prazo de resposta${owner ? '' : ' e não tem responsável'}.` });
    // Muito tempo depois do prazo, os fundadores também sabem: ninguém fica a descoberto.
    if (now - Date.parse(replyDueAt) >= TEAM_ALERTS.escalateHours * 36e5) {
      add({ key: `escalate#${lead.id}#${replyDueAt}`, level: 'bad', tab: 'leads', leadId: lead.id, to: founders, text: `O lead ${label(lead)} está há mais de ${TEAM_ALERTS.escalateHours} h sem resposta depois do prazo.` });
    }
  }
  for (const task of tasks) {
    if (task.dueState === 'overdue') add({ key: `task#${task.id}#${task.due}`, level: 'warn', tab: 'work', leadId: task.leadId ?? '', to: ownerOr(task.owner, founders), text: `A tarefa «${task.title}» passou o prazo (${task.due}).` });
    if (task.status === 'blocked') add({ key: `blocked#${task.id}#${task.updatedAt}`, level: 'warn', tab: 'work', leadId: task.leadId ?? '', to: founders, text: `A tarefa «${task.title}» está bloqueada: ${task.blockedReason || 'sem motivo indicado'}.` });
  }
  for (const item of cases) {
    if (item.deadlineState === 'overdue') add({ key: `case#${item.id}#${item.deadline}`, level: 'bad', tab: 'cases', leadId: item.leadId ?? '', to: [...ownerOr(item.owner, []), ...founders], text: `O caso «${item.title}» está fora do prazo (${item.deadline}).` });
  }
  for (const reminder of reminders) {
    add({ key: `reminder#${reminder.recordKey}`, level: 'bad', tab: 'agenda', leadId: reminder.conversationId ?? '', to: [...ownerOr(reminder.approvedBy, []), ...founders], text: `O lembrete «${reminder.title || 'agendado'}» não foi enviado: ${reminder.reason || 'falha no envio'}.` });
  }
  return alerts.map(alert => ({ ...alert, at: now.toISOString() }));
}

/** Registo guardado de um alerta (sem texto de clientes), listado em FollowUpIndex. */
export const alertRecord = (alert, delivery) => ({
  recordKey: `${TEAM_ALERTS.prefix}${alert.key}`, followUpStatus: TEAM_ALERTS.status, followUpAt: alert.at,
  level: alert.level, tab: alert.tab, leadId: alert.leadId, text: alert.text, to: alert.to.join(','), delivery,
});

export const toAlert = item => ({
  key: (item.recordKey?.S ?? '').slice(TEAM_ALERTS.prefix.length), at: item.followUpAt?.S ?? '', level: item.level?.S ?? '', tab: item.tab?.S ?? '',
  leadId: item.leadId?.S ?? '', text: item.text?.S ?? '', to: (item.to?.S ?? '').split(',').filter(Boolean), delivery: item.delivery?.S ?? '',
});

/**
 * Painel da fundadora: estado dos seguimentos, pontos de falha e quem tem o quê.
 * Recebe leads (com atRisk e replyLate), tarefas, casos, membros, alertas recentes e as
 * contagens de lembretes; devolve só totais, nomes da equipa e referências de leads.
 */
export function controlSummary({ leads = [], tasks = [], cases = [], members = [], alerts = [], reminders = {} }) {
  const real = leads.filter(lead => !lead.synthetic);
  const open = real.filter(lead => lead.status !== 'CONTACTED');
  const owner = email => lower(email);
  const active = new Set(members.filter(member => member.enabled).map(member => lower(member.email)));
  const orphan = lead => !lead.assignedTo || !active.has(owner(lead.assignedTo));
  const followUps = {
    open: open.length,
    onTime: open.filter(lead => !lead.replyLate && !lead.atRisk).length,
    late: open.filter(lead => lead.replyLate).length,
    atRisk: real.filter(lead => lead.atRisk).length,
    unassigned: open.filter(orphan).length,
  };
  const people = members.map(member => {
    const me = lower(member.email);
    const leadsOf = open.filter(lead => owner(lead.assignedTo) === me);
    const tasksOf = tasks.filter(task => owner(task.owner) === me);
    const casesOf = cases.filter(item => owner(item.owner) === me);
    return {
      name: member.name, email: member.email, groups: member.groups, enabled: member.enabled,
      openLeads: leadsOf.length, lateLeads: leadsOf.filter(lead => lead.replyLate || lead.atRisk).length,
      openTasks: tasksOf.length, overdueTasks: tasksOf.filter(task => task.dueState === 'overdue').length, blockedTasks: tasksOf.filter(task => task.status === 'blocked').length,
      openCases: casesOf.length, overdueCases: casesOf.filter(item => item.deadlineState === 'overdue').length,
    };
  }).filter(person => person.enabled || person.openLeads || person.openTasks || person.openCases);
  const breaking = [];
  const add = (level, text, tab) => breaking.push({ level, text, tab });
  const orphanLate = open.filter(lead => orphan(lead) && (lead.replyLate || lead.atRisk)).length;
  if (orphanLate) add('bad', `${orphanLate} lead(s) atrasados ou em risco sem responsável.`, 'leads');
  for (const person of people.filter(item => !item.enabled)) add('bad', `${person.name} tem a conta desativada mas ainda tem trabalho atribuído.`, 'team');
  const unowned = tasks.filter(task => !task.owner || !active.has(owner(task.owner))).length;
  if (unowned) add('warn', `${unowned} tarefa(s) sem responsável ativo.`, 'work');
  const blocked = tasks.filter(task => task.status === 'blocked').length;
  if (blocked) add('warn', `${blocked} tarefa(s) bloqueadas.`, 'work');
  const lateCases = cases.filter(item => item.deadlineState === 'overdue').length;
  if (lateCases) add('bad', `${lateCases} caso(s) de reclamação ou litígio fora do prazo.`, 'cases');
  if ((reminders.failed ?? 0) + (reminders.missed ?? 0)) add('bad', `${(reminders.failed ?? 0) + (reminders.missed ?? 0)} lembrete(s) falharam ou não saíram a tempo nos últimos 7 dias.`, 'agenda');
  const silent = alerts.filter(alert => !alert.to.length).length;
  if (silent) add('bad', `${silent} alerta(s) sem ninguém a quem avisar: falta um fundador ou curador ativo.`, 'team');
  const failedEmail = alerts.filter(alert => alert.delivery === 'email-failed').length;
  if (failedEmail) add('warn', `${failedEmail} alerta(s) não chegaram por email: verificar o remetente SES.`, 'operations');
  const followers = members.filter(member => member.enabled && member.groups.some(group => ['curators', 'founders'].includes(group)));
  if (followers.length < 2) add('warn', `Só ${followers.length} pessoa(s) ativa(s) seguem leads: o seguimento depende de uma pessoa.`, 'team');
  // Carga desigual: alguém com o dobro dos leads da média e pelo menos 3.
  const loads = people.filter(person => person.enabled).map(person => person.openLeads);
  const average = loads.length ? loads.reduce((sum, value) => sum + value, 0) / loads.length : 0;
  for (const person of people.filter(item => item.enabled && item.openLeads >= 3 && item.openLeads >= 2 * average)) add('warn', `${person.name} tem ${person.openLeads} leads em aberto, o dobro da média: redistribuir.`, 'leads');
  const order = { bad: 0, warn: 1 };
  return {
    followUps, breaking: breaking.sort((a, b) => order[a.level] - order[b.level]),
    people: people.sort((a, b) => (b.lateLeads + b.overdueTasks + b.blockedTasks + b.overdueCases) - (a.lateLeads + a.overdueTasks + a.blockedTasks + a.overdueCases) || a.name.localeCompare(b.name)),
    alerts: [...alerts].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 50),
    reminders: { sent: reminders.sent ?? 0, prepared: reminders.prepared ?? 0, failed: reminders.failed ?? 0, missed: reminders.missed ?? 0 },
  };
}
