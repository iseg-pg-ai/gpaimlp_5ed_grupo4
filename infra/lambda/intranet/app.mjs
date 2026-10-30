import {
  CONTACTED, NOTE_LIMIT, OPEN_STATUSES, QUESTION_LIMIT,
  atRisk, cleanTags, contactDetails, groupsOf, isOverdue, metrics, toLead, toMessage, validLeadId, workerLabel,
} from './model.mjs';
import { CHANNELS, KINDS, NOTIFY, REMINDERS, digitsOnly, lisbonToUtc, parseActivity, plan } from './schedule.mjs';
import { opsItems, opsView } from './ops.mjs';
import { OUTCOMES, OUTCOME_STATUS, SCORE, netPromoter, outcomeRecord, parseOutcome, scorecards, toOutcome } from './partner-score.mjs';
import { CASE_CHANNELS, CASE_STATE, CASE_STATUS, CASE_TYPES, UNLINKED, deadlineState, parseCase, parseCaseUpdate } from './cases.mjs';
import { ATTESTATIONS, AUTO_TYPES, SETTINGS, VALUE_RULES, applyAttestations, currentSettings, parseAttestation, parseSettings, replyState } from './settings.mjs';
import { AUTO_AUTHOR, WHATSAPP_TEST, inboxRecord, parseInboxPost, threadKey, threads, toInboxMessage, whatsappMode } from './whatsapp-test.mjs';
import { checkDraft, decide, draftPrompt, nextActivity, templateReply } from './guardrails.mjs';
import { TEAM_ALERTS, controlSummary, toAlert } from './team-alerts.mjs';
import { ASSISTANT, TABS as ASSISTANT_TABS, assistantPrompt, cleanHistory, leadContext, parseAssistant } from './assistant.mjs';
import { FEED, NO_DUE, TASK_STATE, TASK_STATUS, UNLINKED_TASKS, describeChange, dueState, indexFields, parseTask, parseTaskUpdate, validRecordId } from './tasks.mjs';

// Rotas da intranet. Os acessos AWS chegam injetados em `deps` (index.mjs na AWS,
// simulações nos testes), para que a autorização e a validação sejam testadas sem rede.
export class NotFound extends Error {}

// Papéis (grupos Cognito) e o que cada um pode fazer. Um cofre único de acessos:
// a identidade vive no Cognito, as credenciais de serviço no Secrets Manager.
export const ROLES = {
  founders: { label: 'Fundador(a)', can: ['read', 'leads', 'tasks', 'cases', 'security', 'team-admin', 'feedback'] },
  curators: { label: 'Curador(a)', can: ['read', 'leads', 'tasks', 'cases'] },
  governance: { label: 'Governança', can: ['read', 'tasks', 'cases', 'security'] },
  testers: { label: 'Testes', can: ['read'] },
  // Marketing: o seu trabalho, os totais do painel e o portal de propostas; sem conversas nem contactos de clientes.
  marketing: { label: 'Marketing', can: ['tasks'] },
};
const STAFF = Object.keys(ROLES);
const allowed = (groups, permission) => groups.some(group => ROLES[group]?.can.includes(permission));
// Sem a permissão "read" (marketing), só estas rotas: tarefas, feed, equipa e totais agregados.
const LIMITED_ROUTES = new Set([
  'GET /v1/me', 'GET /v1/work', 'GET /v1/tasks', 'POST /v1/tasks', 'GET /v1/leads/{id}/tasks/{taskId}', 'POST /v1/leads/{id}/tasks/{taskId}',
  'GET /v1/feed', 'GET /v1/team', 'GET /v1/metrics', 'GET /v1/alerts', 'POST /v1/assistant',
]);
const validEmail = email => typeof email === 'string' && email.length <= 254 && /^[^\s@<>()]+@[^\s@<>()]+\.[a-z]{2,}$/i.test(email);

// Feedback da fundadora a uma conversa do chatbot: fica junto do lead, nunca vai para o cliente.
export const FEEDBACK = {
  prefix: 'FEEDBACK#',
  verdicts: { good: 'Boa resposta', improve: 'A melhorar', wrong: 'Errada' },
  noteLimit: 1000,
  recent: 50,
};

export function parseFeedback(body) {
  const verdict = typeof body.verdict === 'string' ? body.verdict : '';
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  if (!FEEDBACK.verdicts[verdict]) return { error: 'Escolha uma avaliação.' };
  if (note.length < 5) return { error: 'Escreva pelo menos uma frase sobre a conversa.' };
  return { record: { verdict, note: note.slice(0, FEEDBACK.noteLimit) } };
}

const str = (item, key) => item[key]?.S ?? '';
const toFeedback = item => ({ verdict: str(item, 'verdict'), note: str(item, 'note'), by: str(item, 'createdBy'), byName: str(item, 'createdByName'), at: str(item, 'createdAt') });
export const toCase = (item, today) => {
  const record = {
    id: str(item, 'caseId'), leadId: str(item, 'conversationId') === UNLINKED ? '' : str(item, 'conversationId'), partition: str(item, 'conversationId'),
    type: str(item, 'type'), title: str(item, 'title'), description: str(item, 'description'), channel: str(item, 'channel'),
    receivedOn: str(item, 'receivedOn'), deadline: str(item, 'deadline'), owner: str(item, 'owner'), priority: str(item, 'priority'),
    caseStatus: str(item, 'caseStatus'), resolution: str(item, 'resolution'), reference: str(item, 'reference'),
    createdBy: str(item, 'createdBy'), createdAt: str(item, 'createdAt'), updatedAt: str(item, 'updatedAt'),
  };
  return { ...record, deadlineState: deadlineState(record, today) };
};
const toCaseLog = item => ({ at: str(item, 'createdAt'), by: str(item, 'createdBy'), text: str(item, 'text') });
const toActivity = item => ({
  id: str(item, 'activityId'), kind: str(item, 'kind'), title: str(item, 'title'), place: str(item, 'place'),
  date: str(item, 'date'), time: str(item, 'time'), repeatUntil: str(item, 'repeatUntil'), people: Number(str(item, 'people') || 0),
  partnerId: str(item, 'partnerId'), travellerChannel: str(item, 'travellerChannel'), partnerChannel: str(item, 'partnerChannel'), notes: str(item, 'notes'), status: str(item, 'status'), createdBy: str(item, 'createdBy'),
  createdAt: str(item, 'createdAt'), reminders: str(item, 'reminders').split(',').filter(Boolean),
});
// O número de destino não sai da API; só se indica se existe.
export const toNotification = item => ({
  conversationId: str(item, 'conversationId'), recordKey: str(item, 'recordKey'), activityId: str(item, 'activityId'),
  audience: str(item, 'audience'), kind: str(item, 'kind'), title: str(item, 'title'), sendAt: str(item, 'followUpAt'),
  occurrenceAt: str(item, 'occurrenceAt'), status: str(item, 'followUpStatus'), reason: str(item, 'reason'),
  hasNumber: Boolean(str(item, 'to')), text: str(item, 'text'), sentAt: str(item, 'sentAt'), channel: str(item, 'channel') || 'whatsapp',
  place: str(item, 'place'), people: Number(str(item, 'people') || 0), partnerName: str(item, 'partnerName'),
  delivery: str(item, 'delivery'), approvedBy: str(item, 'approvedBy'),
});
export const toTask = (item, today) => {
  const partition = str(item, 'conversationId');
  const record = {
    id: str(item, 'taskId'), partition, leadId: partition === UNLINKED_TASKS ? '' : partition, leadLabel: str(item, 'leadLabel'),
    title: str(item, 'title'), note: str(item, 'note'), owner: str(item, 'owner'), due: str(item, 'due'), status: str(item, 'taskStatus'),
    blockedReason: str(item, 'blockedReason'), caseId: str(item, 'caseId'), casePartition: str(item, 'casePartition'), caseTitle: str(item, 'caseTitle'),
    createdBy: str(item, 'createdBy'), createdAt: str(item, 'createdAt'), updatedBy: str(item, 'updatedBy'), updatedAt: str(item, 'updatedAt'),
  };
  return { ...record, dueState: dueState(record, today) };
};
const toFeed = item => ({ at: str(item, 'followUpAt'), by: str(item, 'by'), byName: str(item, 'byName'), text: str(item, 'text'), scope: str(item, 'scope'), taskId: str(item, 'taskId'), partition: str(item, 'taskPartition') });
// Ordem de «O meu trabalho»: risco de desistência, atraso, bloqueio, prazo próximo, resto.
const URGENCY = { risk: 0, overdue: 1, blocked: 2, soon: 3, normal: 4 };
const taskUrgency = task => (task.status === 'blocked' ? 'blocked' : task.dueState === 'overdue' ? 'overdue' : ['today', 'soon'].includes(task.dueState) ? 'soon' : 'normal');
const byUrgency = (a, b) => URGENCY[a.urgency] - URGENCY[b.urgency] || (a.due || NO_DUE).localeCompare(b.due || NO_DUE);
const plusDays = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 864e5).toISOString().slice(0, 10);
// Campos de uma atividade que a equipa pode alterar, com o nome que aparece no feed.
const ACTIVITY_FIELDS = {
  kind: 'tipo', title: 'título', place: 'local', date: 'data', time: 'hora', repeatUntil: 'repetição', people: 'pessoas',
  partnerId: 'parceiro', notes: 'nota', travellerChannel: 'canal do viajante', partnerChannel: 'canal do parceiro', reminders: 'lembretes',
};

const reply = (statusCode, body, cache = 'no-store') => ({
  statusCode,
  headers: { 'content-type': 'application/json', 'cache-control': cache },
  body: body === undefined ? '' : JSON.stringify(body),
});
const fail = (statusCode, error) => reply(statusCode, { error });

function parse(event) {
  if (!event.body) return {};
  try {
    const text = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
    const value = JSON.parse(text);
    return value && typeof value === 'object' ? value : {};
  } catch {
    return null;
  }
}

export function createApp(deps) {
  const now = () => deps.now?.() ?? new Date();
  const lisbonToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(now());

  const loadSettings = async () => currentSettings(await deps.queryRecords(SETTINGS.partition, SETTINGS.prefix));

  // Texto da resposta: o modelo escreve com os factos da reserva e a verificação final decide;
  // sem modelo, com erro ou com um texto que falhe a verificação, vale o modelo fixo.
  const draft = async (intent, facts, text) => {
    const fallback = templateReply(intent, facts, text);
    if (!deps.draftReply || !intent) return { text: fallback, source: 'template' };
    try {
      const checked = checkDraft(await deps.draftReply(draftPrompt(intent, facts, text)), facts);
      return checked.ok ? { text: checked.text, source: 'model' } : { text: fallback, source: 'template' };
    } catch {
      return { text: fallback, source: 'template' };
    }
  };

  // Mensagem recebida (simulada em modo de teste): decide e, se as regras deixarem, responde
  // sozinho. Fica sempre registado o que decidiu e porquê; o resto vai para «O meu trabalho».
  const answer = async (message, at) => {
    const inbox = (await deps.queryRecords(WHATSAPP_TEST.partition, WHATSAPP_TEST.prefix)).map(toInboxMessage);
    const key = threadKey(message);
    const thread = inbox.filter(item => threadKey(item) === key);
    const leadId = message.leadId || thread.findLast(item => item.leadId)?.leadId || '';
    const since = new Date(+at - 864e5).toISOString();
    const autoToday = thread.filter(item => item.author === AUTO_AUTHOR.email && item.at >= since).length;
    const settings = await loadSettings();
    const activities = leadId ? (await deps.queryRecords(leadId, 'ACTIVITY#')).map(toActivity) : [];
    const mine = message.partnerId ? activities.filter(activity => activity.partnerId === message.partnerId) : activities;
    const partnerName = partnerId => deps.partners.find(partner => partner.id === partnerId)?.name ?? (partnerId === 'bolt' ? 'Bolt' : '');
    const facts = nextActivity(mine, partnerName, at);
    const decision = decide({ text: message.text, enabled: settings.auto.replies, facts, autoToday, now: at });
    const suggestion = decision.action === 'stop' ? { text: '' } : await draft(decision.intent, facts, message.text);
    const records = [inboxRecord({
      at: at.toISOString(), id: deps.newId(), ...message, leadId,
      decision: decision.action, reason: decision.reason, suggestion: decision.action === 'person' ? suggestion.text : '',
    })];
    if (decision.action === 'auto') {
      records.push(inboxRecord({
        at: new Date(+at + 1).toISOString(), id: deps.newId(), direction: 'out', to: message.to, partnerId: message.partnerId, leadId,
        text: suggestion.text, author: AUTO_AUTHOR.email, authorName: AUTO_AUTHOR.name, decision: 'auto', reason: decision.reason,
      }));
    }
    await deps.putRecords(WHATSAPP_TEST.partition, records);
    return { decision: decision.action, reason: decision.reason };
  };
  // Relatório legal do deploy com as verificações manuais registadas na intranet.
  const loadReport = async () => {
    const [report, attestations] = await Promise.all([deps.policyReport().catch(() => null), deps.queryRecords(ATTESTATIONS.partition, ATTESTATIONS.prefix)]);
    return applyAttestations(report, attestations, now());
  };

  async function listLeads(filter, settings) {
    const statuses = filter === 'contacted' ? [CONTACTED] : filter === 'all' ? [...OPEN_STATUSES, CONTACTED] : OPEN_STATUSES;
    const [items, rules] = await Promise.all([Promise.all(statuses.map(status => deps.queryStatus(status))).then(lists => lists.flat()), settings ?? loadSettings()]);
    const at = now();
    const leads = items.map(toLead).map(lead => ({ ...lead, atRisk: atRisk(lead), ...replyState(lead, rules.replyHours, at) }));
    // Primeiro quem disse que vai desistir, depois quem passou o prazo de resposta.
    return filter === 'contacted'
      ? leads.sort((a, b) => (b.contactedAt ?? '').localeCompare(a.contactedAt ?? ''))
      : leads.sort((a, b) => b.atRisk - a.atRisk || b.replyLate - a.replyLate || (a.replyDueAt || a.followUpAt).localeCompare(b.replyDueAt || b.followUpAt));
  }

  async function getLead(id) {
    const [records, transcript] = await Promise.all([deps.getRecords(id), deps.getTranscript(id)]);
    const profile = records.find(item => item.recordKey?.S === 'PROFILE');
    if (!profile) throw new NotFound();
    const messages = transcript.map(toMessage).sort((a, b) => a.at.localeCompare(b.at));
    const lead = toLead(profile);
    return { ...lead, atRisk: atRisk(lead), messages, ...contactDetails(messages) };
  }

  const staffEmails = async () => (await deps.listTeam()).map(member => member.email.toLowerCase());
  const namesOf = members => Object.fromEntries(members.map(member => [member.email.toLowerCase(), member.name]));

  // Entrada no feed da equipa. Falhar aqui não desfaz a ação: só fica registado o erro.
  async function announce(user, text, extra = {}) {
    const at = now().toISOString();
    try {
      await deps.putRecords(FEED.partition, [{ recordKey: `FEED#${at}#${deps.newId()}`, followUpStatus: FEED.status, followUpAt: at, text, by: user.email, byName: user.name, ...extra }]);
    } catch (error) {
      console.error(JSON.stringify({ feed: 'not-recorded', error: error?.name ?? 'Error' }));
    }
  }

  // Registos NOTIFY# de uma atividade (criação ou alteração): com os lembretes automáticos
  // desligados ficam preparados para a equipa enviar à mão.
  const notificationRecords = (notifications, activity, partner, settings, user, at) => notifications.map(notification => ({
    ...notification, followUpStatus: settings.auto.reminders ? NOTIFY.pending : NOTIFY.prepared, ...(settings.auto.reminders ? {} : { reason: 'Envio automático desligado: enviar à mão.' }),
    followUpAt: notification.sendAt, kind: activity.kind, title: activity.title, place: activity.place, people: activity.people,
    partnerName: activity.partnerId === 'bolt' ? 'Bolt' : partner?.name ?? '', approvedBy: user.email, createdAt: at,
  }));
  const activityWarnings = (notifications, activity, partner, lead, settings) => {
    const warnings = [];
    if (notifications.some(n => n.audience === 'traveller' && !n.to)) warnings.push(`O viajante não deixou ${activity.travellerChannel === 'email' ? 'email' : 'telefone'}: os lembretes ficam preparados para envio manual.`);
    if (partner && !partner.whatsapp && notifications.some(n => n.audience === 'partner')) warnings.push(`${partner.name} não tem número WhatsApp: os lembretes ao parceiro ficam preparados.`);
    if (!lead.consentAt) warnings.push('Sem consentimento registado: não foram agendados lembretes ao viajante.');
    if (!settings.auto.reminders) warnings.push('Os lembretes automáticos estão desligados: ficam preparados para enviar à mão.');
    return warnings;
  };

  // «O meu trabalho» e a Visão geral contam com as mesmas regras: os dados carregam-se uma vez
  // e a lista de cada pessoa sai de workItems, que a Visão geral aplica a cada membro.
  const loadWork = async ({ cases = true, inbox = true } = {}) => {
    const at = now();
    const today = lisbonToday();
    const [taskItems, allLeads, prepared, openCases, inboxItems, settings, alertItems] = await Promise.all([
      deps.queryStatus(TASK_STATE.open),
      listLeads('all'),
      deps.queryAgenda(NOTIFY.prepared, new Date(at - 7 * 864e5).toISOString(), at.toISOString()),
      cases ? deps.queryStatus(CASE_STATE.open) : Promise.resolve([]),
      inbox ? deps.queryRecords(WHATSAPP_TEST.partition, WHATSAPP_TEST.prefix) : Promise.resolve([]),
      loadSettings(),
      Promise.resolve().then(() => deps.queryAgenda(TEAM_ALERTS.status, new Date(at - 864e5).toISOString(), at.toISOString())).catch(() => []),
    ]);
    // Leads de demonstração não contam em nenhuma vista, nem os lembretes e mensagens desses leads.
    const demo = new Set(allLeads.filter(lead => lead.synthetic).map(lead => lead.id));
    return {
      at, today, settings, demo,
      leads: allLeads.filter(lead => lead.status !== CONTACTED),
      tasks: taskItems.map(item => toTask(item, today)),
      prepared: prepared.map(toNotification).filter(item => !demo.has(item.conversationId)),
      cases: openCases.map(item => toCase(item, today)),
      threads: threads(inboxItems.map(toInboxMessage), deps.partners).filter(thread => !demo.has(thread.leadId)),
      alerts: alertItems.map(toAlert),
    };
  };

  // A lista de uma pessoa: só o que é dela. Leads de demonstração e trabalho sem dono ficam na
  // Visão geral da equipa (mensagens sem responsável, leads sem responsável).
  const workItems = (email, groups, { at, settings, leads, tasks, prepared, cases, threads: inbox, alerts }) => {
    const me = email.toLowerCase();
    const myLeads = leads.filter(lead => !lead.synthetic && lead.assignedTo?.toLowerCase() === me);
    const myLeadIds = new Set(myLeads.map(lead => lead.id));
    // Mensagens à espera de resposta nos leads da pessoa, com a resposta sugerida pronta.
    const waiting = (allowed(groups, 'leads') ? inbox : []).filter(thread => thread.waiting && myLeadIds.has(thread.leadId)).map(thread => {
      const last = thread.messages.at(-1);
      const late = at - Date.parse(last.at) >= settings.replyHours * 36e5;
      return {
        kind: 'message', id: thread.key, partition: thread.leadId, title: thread.name || thread.leadId || `+${thread.to}`, due: last.at.slice(0, 10),
        detail: last.reason || 'Mensagem por responder.', urgency: late ? 'overdue' : 'soon',
        message: { key: thread.key, to: thread.to, partnerId: thread.partnerId, leadId: thread.leadId, audience: thread.audience, text: last.text, at: last.at, suggestion: last.suggestion },
      };
    });
    const myCases = allowed(groups, 'cases') ? cases.filter(item => item.owner === me) : [];
    // Uma linha por lead: se já há uma mensagem à espera desse lead, a linha do lead sai da lista.
    const waitingLeadIds = new Set(waiting.map(item => item.message.leadId).filter(Boolean));
    return [
      ...waiting,
      ...tasks.filter(task => task.owner === me)
        .map(task => ({ kind: 'task', id: task.id, partition: task.partition, title: task.title, due: task.due, urgency: taskUrgency(task), task })),
      ...myLeads.filter(lead => !waitingLeadIds.has(lead.id)).map(lead => ({
        kind: 'lead', id: lead.id, partition: lead.id, title: lead.journey.destination || lead.id, due: lead.followUpAt.slice(0, 10),
        detail: [lead.journey.timeframe, lead.journey.party].filter(Boolean).join(' · '), urgency: lead.atRisk ? 'risk' : lead.replyLate || isOverdue(lead, at) ? 'overdue' : 'normal',
      })),
      ...prepared.filter(item => (item.approvedBy ?? '').toLowerCase() === me || myLeadIds.has(item.conversationId))
        .map(item => ({ kind: 'reminder', id: item.recordKey, partition: item.conversationId, title: item.title, due: item.sendAt.slice(0, 10), detail: `${item.reason || 'Preparado: enviar à mão'}`, urgency: 'overdue' })),
      // Alertas que não têm já um item próprio acima: escalamentos, bloqueios, lembretes e casos de outros.
      ...alerts.filter(alert => alert.to.includes(me) && /^(escalate|blocked|reminder|case)#/.test(alert.key))
        .filter(alert => !(alert.key.startsWith('case#') && myCases.some(item => alert.key.startsWith(`case#${item.id}#`))))
        .map(alert => ({ kind: 'alert', id: alert.key, partition: alert.leadId, title: alert.text, due: alert.at.slice(0, 10), detail: alert.tab, urgency: alert.level === 'bad' ? 'overdue' : 'soon' })),
      ...myCases.map(item => ({ kind: 'case', id: item.id, partition: item.partition, title: item.title, due: item.deadline, detail: CASE_TYPES[item.type]?.label ?? item.type, urgency: item.deadlineState === 'overdue' ? 'overdue' : item.deadlineState === 'due-soon' ? 'soon' : 'normal' })),
    ].sort(byUrgency);
  };

  const routes = {
    'GET /v1/me': async ({ user }) => reply(200, user),

    'GET /v1/leads': async ({ event }) => {
      const filter = event.queryStringParameters?.status ?? 'open';
      if (!['open', 'contacted', 'all'].includes(filter)) return fail(400, 'Estado inválido.');
      return reply(200, { leads: await listLeads(filter) });
    },

    'GET /v1/leads/{id}': async ({ id }) => reply(200, await getLead(id)),

    'POST /v1/leads/{id}/contacted': async ({ id, user }) => {
      const at = now().toISOString();
      await deps.updateProfile(id, { followUpStatus: CONTACTED, contactedAt: at, contactedBy: user.email, updatedAt: at });
      await announce(user, `marcou o lead ${id} como contactado`);
      return reply(204);
    },

    'POST /v1/leads/{id}/assign': async ({ id, user, body }) => {
      const at = now().toISOString();
      // Libertar marca releasedAt: a atribuição automática volta a contar 1h30 a partir daqui.
      if (body.release === true) {
        await deps.updateProfile(id, { releasedAt: at, updatedAt: at }, ['assignedTo', 'assignedAt', 'assignedBy']);
        await announce(user, `libertou o lead ${id}`);
        return reply(204);
      }
      // Atribuir a outra pessoa (centro de operações): só fundadores, e só a quem segue leads.
      const to = typeof body.to === 'string' ? body.to.trim().toLowerCase() : '';
      if (to && to !== user.email.toLowerCase()) {
        if (!allowed(user.groups, 'team-admin')) return fail(403, 'Só fundadores atribuem leads a outra pessoa.');
        const member = (await deps.listTeam()).find(item => item.enabled && item.email.toLowerCase() === to);
        if (!member || !allowed(member.groups, 'leads')) return fail(400, 'Escolha um curador ou fundador ativo.');
        await deps.updateProfile(id, { assignedTo: member.email, assignedAt: at, assignedBy: user.email, updatedAt: at });
        await announce(user, `atribuiu o lead ${id} a ${member.name}`);
        return reply(204);
      }
      await deps.updateProfile(id, { assignedTo: user.email, assignedAt: at, updatedAt: at }, ['assignedBy']);
      await announce(user, `assumiu o lead ${id}`);
      return reply(204);
    },

    // Só a nota interna. As etiquetas passaram a ser da análise automática (signals.mjs):
    // `tags` no pedido é ignorado e as etiquetas manuais antigas ficam como estavam, sem uso.
    'PUT /v1/leads/{id}/tags': async ({ id, body }) => {
      const at = now().toISOString();
      const note = typeof body.note === 'string' ? body.note.trim().slice(0, NOTE_LIMIT) : '';
      const set = { updatedAt: at };
      const remove = [];
      if (note) set.curatorNote = note; else remove.push('curatorNote');
      await deps.updateProfile(id, set, remove);
      return reply(204);
    },

    'POST /v1/leads/{id}/ask': async ({ id, body }) => {
      const question = typeof body.question === 'string' ? body.question.trim().slice(0, QUESTION_LIMIT) : '';
      if (!question) return fail(400, 'Escreva uma pergunta.');
      const answer = await deps.askRag(id, question);
      return reply(200, { answer: answer.answer, sourceIds: answer.sourceIds ?? [], requiresHumanApproval: true });
    },

    // Conversas mais recentes primeiro, com o feedback já dado, para a fundadora rever o chatbot.
    'GET /v1/conversations': async () => {
      const leads = (await listLeads('all')).sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt)).slice(0, FEEDBACK.recent);
      const feedback = await Promise.all(leads.map(lead => deps.queryRecords(lead.id, FEEDBACK.prefix)));
      return reply(200, {
        verdicts: FEEDBACK.verdicts,
        conversations: leads.map((lead, index) => {
          const given = feedback[index].map(toFeedback).sort((a, b) => b.at.localeCompare(a.at));
          return { id: lead.id, journey: lead.journey, stage: lead.stage, status: lead.status, synthetic: lead.synthetic, messageCount: lead.messageCount, lastActivityAt: lead.lastActivityAt, feedbackCount: given.length, lastFeedback: given[0] ?? null, inferred: lead.aiChatbot ?? null };
        }),
      });
    },

    'GET /v1/leads/{id}/feedback': async ({ id }) => {
      const items = await deps.queryRecords(id, FEEDBACK.prefix);
      return reply(200, { verdicts: FEEDBACK.verdicts, feedback: items.map(toFeedback).sort((a, b) => b.at.localeCompare(a.at)) });
    },

    'POST /v1/leads/{id}/feedback': async ({ id, user, body }) => {
      const parsed = parseFeedback(body);
      if (parsed.error) return fail(400, parsed.error);
      const records = await deps.getRecords(id);
      if (!records.some(item => item.recordKey?.S === 'PROFILE')) throw new NotFound();
      const at = now().toISOString();
      await deps.putRecords(id, [{ recordKey: `${FEEDBACK.prefix}${at}#${deps.newId()}`, ...parsed.record, createdBy: user.email, createdByName: user.name, createdAt: at }]);
      await announce(user, `deu feedback à conversa ${id} (${FEEDBACK.verdicts[parsed.record.verdict].toLowerCase()})`);
      return reply(201, { at });
    },

    // Caixa de WhatsApp de teste: lembretes "enviados" em modo de teste e mensagens escritas pela equipa.
    'GET /v1/whatsapp-test': async () => {
      const items = await deps.queryRecords(WHATSAPP_TEST.partition, WHATSAPP_TEST.prefix);
      const settings = await loadSettings();
      return reply(200, { mode: whatsappMode(deps.whatsappMode), autoReplies: settings.auto.replies, threads: threads(items.map(toInboxMessage), deps.partners) });
    },

    'POST /v1/whatsapp-test': async ({ user, body }) => {
      if (whatsappMode(deps.whatsappMode) !== 'test') return fail(409, 'O WhatsApp está em modo real: a caixa de teste só pode ser lida.');
      const parsed = parseInboxPost(body, validLeadId, deps.partners);
      if (parsed.error) return fail(400, parsed.error);
      const at = now();
      const message = { ...parsed.message, author: user.email, authorName: user.name };
      if (message.direction === 'out') {
        const inbox = (await deps.queryRecords(WHATSAPP_TEST.partition, WHATSAPP_TEST.prefix)).map(toInboxMessage);
        if (inbox.some(item => threadKey(item) === threadKey(message) && item.decision === 'stop')) return fail(409, 'Esta pessoa pediu para não receber mais mensagens.');
        await deps.putRecords(WHATSAPP_TEST.partition, [inboxRecord({ at: at.toISOString(), id: deps.newId(), ...message })]);
        return reply(201, { at: at.toISOString() });
      }
      const outcome = await answer(message, at);
      return reply(201, { at: at.toISOString(), decision: outcome.decision, reason: outcome.reason });
    },

    // Assistente: junta o que esta pessoa já pode ver e pede ao modelo uma resposta com ações sugeridas.
    'POST /v1/assistant': async ({ user, body }) => {
      if (!deps.assist) return fail(503, 'O assistente não está ligado neste ambiente.');
      const question = typeof body.question === 'string' ? body.question.trim().slice(0, ASSISTANT.questionLimit) : '';
      if (!question) return fail(400, 'Escreva uma pergunta.');
      const can = permission => allowed(user.groups, permission);
      // «O meu» responde sobre o trabalho da pessoa; «Equipa» sobre o de todos (quem segue leads).
      const team = body.scope === 'team' && can('read');
      // As mesmas rotas que a pessoa abriria; uma que falhe fica de fora do contexto.
      const view = async (key, show = true, query = {}) => {
        if (!show) return null;
        try {
          const result = await routes[key]({ user, event: { queryStringParameters: query }, body: {} });
          return result.statusCode === 200 ? JSON.parse(result.body) : null;
        } catch {
          return null;
        }
      };
      const [work, alerts, metrics, settings, leads, control, agenda] = await Promise.all([
        view('GET /v1/work'), view('GET /v1/alerts'), view('GET /v1/metrics'), view('GET /v1/settings', can('read')),
        can('read') ? listLeads('open').catch(() => []) : Promise.resolve([]), view('GET /v1/control', can('team-admin')),
        view('GET /v1/agenda', team, { scope: 'team', days: '7' }),
      ]);
      const tabs = Object.keys(ASSISTANT_TABS).filter(tab => ['work', 'dashboard'].includes(tab) || (can('read') && (
        tab === 'control' ? can('team-admin') : tab === 'cases' ? can('cases') : tab === 'security' ? can('security') : true)));
      const leadList = leads.slice(0, 60).map(leadContext);
      const items = work?.items ?? [];
      const owners = Object.fromEntries((agenda?.plan?.team?.people ?? []).map(person => [person.email, person.name]));
      const nameOfOwner = owner => (owner ? owners[owner.toLowerCase()] ?? 'outra pessoa' : 'sem responsável');
      const context = {
        today: lisbonToday(), scope: team ? 'team: answer about the whole team, by person' : 'mine: answer about my own work', me: { name: user.name, roles: user.groups.map(group => ROLES[group]?.label ?? group) }, tabs,
        // Emails tapados no prompt: a equipa aparece pelo nome.
        team: agenda?.plan ? { whoHasWhat: { people: (agenda.plan.team?.people ?? []).map(({ email, ...person }) => person), unassigned: agenda.plan.team?.unassigned }, next7Days: agenda.plan.items.map(day => ({ day: day.day, items: day.items.slice(0, 30).map(item => ({ kind: item.kind, title: item.title, owner: nameOfOwner(item.owner), urgency: item.urgency, unassigned: Boolean(item.unassigned), leadId: item.partition || '' })) })) } : null,
        work: items.slice(0, 40).map(item => ({ kind: item.kind, title: item.title, due: item.due, urgency: item.urgency, status: item.status, leadId: item.leadId || item.partition || '' })),
        alerts: alerts?.alerts ?? [], metrics, leads: leadList,
        settings: settings ? { replyHours: settings.replyHours, auto: settings.auto } : null,
        control: control ? { followUps: control.followUps, breaking: control.breaking, people: control.people } : null,
      };
      const leadIds = [...new Set([...leadList.map(lead => lead.id), ...context.work.map(item => item.leadId)].filter(validLeadId))];
      const text = await deps.assist(assistantPrompt({ question, history: cleanHistory(body.history), context }));
      return reply(200, parseAssistant(text, { leadIds, tabs, canTasks: can('tasks'), canLeads: can('leads') }));
    },

    'GET /v1/metrics': async () => {
      const settings = await loadSettings();
      const leads = await listLeads('all', settings);
      return reply(200, { ...metrics(leads, now()), replyLate: leads.filter(lead => !lead.synthetic && lead.replyLate).length, replyHours: settings.replyHours }, 'private, max-age=60');
    },

    'GET /v1/settings': async () => reply(200, { ...(await loadSettings()), types: AUTO_TYPES }),

    'POST /v1/settings': async ({ user, body }) => {
      const current = await loadSettings();
      const parsed = parseSettings(body, current);
      if (parsed.error) return fail(400, parsed.error);
      const at = now().toISOString();
      await deps.putRecords(SETTINGS.partition, [{ recordKey: `${SETTINGS.prefix}${at}#${deps.newId()}`, settingsJson: JSON.stringify(parsed.settings), updatedBy: user.email, updatedAt: at }]);
      const switched = Object.keys(AUTO_TYPES).filter(type => parsed.settings.auto[type] !== current.auto[type]).map(type => `${AUTO_TYPES[type].toLowerCase()}: ${parsed.settings.auto[type] ? 'ligado' : 'desligado'}`);
      const assign = parsed.settings.autoAssign !== current.autoAssign ? `atribuição automática: ${parsed.settings.autoAssign ? 'ligada' : 'desligada'}` : '';
      const changes = [parsed.settings.replyHours !== current.replyHours ? `prazo de resposta: ${parsed.settings.replyHours} h` : '', assign, ...switched].filter(Boolean);
      if (changes.length) await announce(user, `alterou as regras de seguimento (${changes.join('; ')})`);
      return reply(200, { ...parsed.settings, updatedBy: user.email, updatedAt: at, types: AUTO_TYPES });
    },

    // Carga por pessoa (leads e tarefas), para o Painel mostrar quem está sobrecarregado.
    'GET /v1/team': async () => {
      const today = lisbonToday();
      const [members, leads, taskItems] = await Promise.all([deps.listTeam(), listLeads('open'), deps.queryStatus(TASK_STATE.open)]);
      // Mesmas regras da Visão geral: sem leads de demonstração e emails sem maiúsculas.
      const owned = leads.reduce((totals, lead) => {
        if (lead.assignedTo && !lead.synthetic) totals[lead.assignedTo.toLowerCase()] = (totals[lead.assignedTo.toLowerCase()] ?? 0) + 1;
        return totals;
      }, {});
      const tasks = taskItems.map(item => toTask(item, today));
      const ownTasks = email => tasks.filter(task => task.owner === email.toLowerCase());
      return reply(200, { members: members.map(member => ({
        ...member, openLeads: owned[member.email.toLowerCase()] ?? 0, openTasks: ownTasks(member.email).length,
        overdueTasks: ownTasks(member.email).filter(task => task.dueState === 'overdue').length, blockedTasks: ownTasks(member.email).filter(task => task.status === 'blocked').length,
      })) });
    },

    'GET /v1/operations': async () => reply(200, await deps.operations(), 'private, max-age=30'),

    'GET /v1/governance': async () => {
      const [governance, attestations, settings] = await Promise.all([deps.governance(), deps.queryRecords(ATTESTATIONS.partition, ATTESTATIONS.prefix), loadSettings()]);
      // A promessa sobre contactos automáticos segue o interruptor em vigor, não o ficheiro do deploy.
      const automatic = settings.auto.thanks || settings.auto.nudge;
      const manifest = { ...governance.manifest, controls: { ...governance.manifest.controls, automaticCustomerContact: automatic } };
      return reply(200, { ...governance, manifest, policies: applyAttestations(governance.policies, attestations, now()), settings, valueRules: Object.fromEntries(Object.entries(VALUE_RULES).map(([id, rule]) => [id, rule.label])) });
    },

    'POST /v1/governance/attestations': async ({ user, body }) => {
      const report = await deps.policyReport().catch(() => null);
      if (!report) return fail(409, 'O relatório das regras ainda não foi publicado.');
      const parsed = parseAttestation(body, report.policies.map(policy => policy.id));
      if (parsed.error) return fail(400, parsed.error);
      const at = now();
      const validUntil = new Date(+at + ATTESTATIONS.validDays * 864e5).toISOString();
      const title = report.policies.find(policy => policy.id === parsed.record.policyId).title;
      await deps.putRecords(ATTESTATIONS.partition, [{ recordKey: `${ATTESTATIONS.prefix}${parsed.record.policyId}#${at.toISOString()}`, ...parsed.record, createdBy: user.email, createdByName: user.name, createdAt: at.toISOString(), validUntil }]);
      await announce(user, `confirmou a regra «${title}»${parsed.record.value ? ` (${parsed.record.value})` : ''}`, { scope: 'cases' });
      return reply(201, { validUntil });
    },

    'GET /v1/access': async () => reply(200, {
      roles: Object.entries(ROLES).map(([id, role]) => ({ id, ...role })),
      identity: { provider: 'Amazon Cognito', mfa: 'Obrigatório (aplicação de autenticação)', passwordPolicy: 'Mínimo 12 caracteres, maiúsculas, minúsculas e números', selfSignUp: false, session: 'Token de 1 h; sessão máxima de 12 h' },
      secrets: await deps.secrets(),
    }),

    'POST /v1/team/invite': async ({ body }) => {
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : '';
      if (!validEmail(email)) return fail(400, 'Email inválido.');
      if (!name) return fail(400, 'Indique o nome.');
      if (!ROLES[body.role]) return fail(400, 'Papel inválido.');
      const result = await deps.invite({ email, name, role: body.role });
      return result.exists ? fail(409, 'Já existe uma conta com este email.') : reply(201, { username: result.username });
    },

    'POST /v1/team/{username}/role': async ({ user, body, event }) => {
      const username = event.pathParameters.username;
      if (!ROLES[body.role]) return fail(400, 'Papel inválido.');
      if (username === user.username && body.role !== 'founders') return fail(400, 'Não pode retirar o seu próprio papel de fundador(a).');
      await deps.setRole(username, body.role, STAFF);
      return reply(204);
    },

    'POST /v1/team/{username}/status': async ({ user, body, event }) => {
      const username = event.pathParameters.username;
      if (typeof body.enabled !== 'boolean') return fail(400, 'Indique enabled.');
      if (username === user.username && !body.enabled) return fail(400, 'Não pode desativar a sua própria conta.');
      await deps.setEnabled(username, body.enabled);
      return reply(204);
    },

    'GET /v1/cases': async ({ event }) => {
      const filter = event.queryStringParameters?.status ?? 'open';
      if (!['open', 'closed'].includes(filter)) return fail(400, 'Estado inválido.');
      const today = lisbonToday();
      const items = await deps.queryStatus(filter === 'open' ? CASE_STATE.open : CASE_STATE.closed);
      const cases = items.map(item => toCase(item, today)).sort((a, b) => (filter === 'open' ? a.deadline.localeCompare(b.deadline) : b.updatedAt.localeCompare(a.updatedAt)));
      return reply(200, { cases, types: CASE_TYPES, statuses: CASE_STATUS, channels: CASE_CHANNELS, today });
    },

    'POST /v1/cases': async ({ user, body }) => {
      const leadId = typeof body.leadId === 'string' ? body.leadId.trim() : '';
      if (leadId && !validLeadId(leadId)) return fail(400, 'Referência de lead inválida.');
      if (leadId) await getLead(leadId);
      const staff = (await deps.listTeam()).map(member => member.email.toLowerCase());
      const today = lisbonToday();
      const parsed = parseCase(body, { staff, today });
      if (parsed.error) return fail(400, parsed.error);
      const caseId = deps.newId();
      const at = now().toISOString();
      const partition = leadId || UNLINKED;
      await deps.putRecords(partition, [
        { recordKey: `CASE#${caseId}`, caseId, ...parsed.record, followUpStatus: CASE_STATE.open, followUpAt: parsed.record.deadline, createdBy: user.email, createdAt: at, updatedAt: at },
        { recordKey: `CASELOG#${caseId}#${at}`, caseId, text: `Caso aberto (${CASE_TYPES[parsed.record.type].label}); prazo ${parsed.record.deadline}.`, createdBy: user.email, createdAt: at },
      ]);
      await announce(user, `abriu o caso «${parsed.record.title}» (prazo ${parsed.record.deadline})`, { scope: 'cases' });
      return reply(201, { caseId, partition, deadline: parsed.record.deadline });
    },

    'GET /v1/leads/{id}/cases': async ({ id }) => {
      const today = lisbonToday();
      return reply(200, { cases: (await deps.queryRecords(id, 'CASE#')).map(item => toCase(item, today)) });
    },

    'GET /v1/leads/{id}/cases/{caseId}': async ({ id, event }) => {
      const caseId = event.pathParameters.caseId;
      const [records, log] = await Promise.all([deps.queryRecords(id, `CASE#${caseId}`), deps.queryRecords(id, `CASELOG#${caseId}#`)]);
      if (!records.length) return fail(404, 'Caso não encontrado.');
      return reply(200, { ...toCase(records[0], lisbonToday()), log: log.map(toCaseLog).sort((a, b) => b.at.localeCompare(a.at)) });
    },

    'POST /v1/leads/{id}/cases/{caseId}': async ({ id, user, body, event }) => {
      const caseId = event.pathParameters.caseId;
      const [record] = await deps.queryRecords(id, `CASE#${caseId}`);
      if (!record) return fail(404, 'Caso não encontrado.');
      const staff = (await deps.listTeam()).map(member => member.email.toLowerCase());
      const current = toCase(record, lisbonToday());
      const parsed = parseCaseUpdate(body, current, { staff });
      if (parsed.error) return fail(400, parsed.error);
      const at = now().toISOString();
      const changes = [
        parsed.set.caseStatus ? `estado: ${CASE_STATUS[parsed.set.caseStatus]}` : '',
        parsed.set.owner !== undefined ? `responsável: ${parsed.set.owner || 'ninguém'}` : '',
        parsed.set.deadline ? `prazo: ${parsed.set.deadline}` : '',
        parsed.set.resolution !== undefined ? 'resolução atualizada' : '',
      ].filter(Boolean);
      if (Object.keys(parsed.set).length) await deps.setRecord(id, `CASE#${caseId}`, { ...parsed.set, updatedAt: at });
      await deps.putRecords(id, [{ recordKey: `CASELOG#${caseId}#${at}`, caseId, text: [changes.length ? `Alterado — ${changes.join('; ')}.` : '', parsed.note].filter(Boolean).join(' '), createdBy: user.email, createdAt: at }]);
      await announce(user, `atualizou o caso «${current.title}»${changes.length ? ` (${changes.join('; ')})` : ': nova nota'}`, { scope: 'cases' });
      return reply(204);
    },

    // Tudo o que é da pessoa num só sítio: tarefas, leads assumidos, lembretes para enviar
    // à mão e casos de que é responsável, por ordem de urgência.
    'GET /v1/work': async ({ user }) => {
      const data = await loadWork({ cases: allowed(user.groups, 'cases'), inbox: allowed(user.groups, 'leads') });
      return reply(200, { items: workItems(user.email, user.groups, data), statuses: TASK_STATUS, today: data.today });
    },

    'GET /v1/tasks': async ({ event }) => {
      const filter = event.queryStringParameters?.status ?? 'open';
      if (!['open', 'done'].includes(filter)) return fail(400, 'Estado inválido.');
      const today = lisbonToday();
      const tasks = (await deps.queryStatus(filter === 'open' ? TASK_STATE.open : TASK_STATE.done)).map(item => toTask(item, today));
      return reply(200, {
        tasks: filter === 'open'
          ? tasks.map(task => ({ ...task, urgency: taskUrgency(task) })).sort(byUrgency)
          : tasks.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, FEED.limit),
        statuses: TASK_STATUS, today,
      });
    },

    'POST /v1/tasks': async ({ user, body }) => {
      const leadId = typeof body.leadId === 'string' ? body.leadId.trim() : '';
      if (leadId && !validLeadId(leadId)) return fail(400, 'Referência de lead inválida.');
      const lead = leadId ? await getLead(leadId) : null;
      const members = await deps.listTeam();
      const parsed = parseTask(body, { staff: members.map(member => member.email.toLowerCase()), user });
      if (parsed.error) return fail(400, parsed.error);
      const { record } = parsed;
      const casePartition = record.caseId ? leadId || UNLINKED : '';
      let caseTitle = '';
      if (record.caseId) {
        if (!allowed(user.groups, 'cases')) return fail(403, 'Sem acesso a reclamações e litígios.');
        const [found] = await deps.queryRecords(casePartition, `CASE#${record.caseId}`);
        if (!found) return fail(404, 'Caso não encontrado.');
        caseTitle = str(found, 'title');
      }
      const taskId = deps.newId();
      const at = now().toISOString();
      const partition = leadId || UNLINKED_TASKS;
      const names = namesOf(members);
      await deps.putRecords(partition, [
        { recordKey: `TASK#${taskId}`, taskId, ...record, leadLabel: lead ? lead.journey.destination || lead.id : '', casePartition, caseTitle, ...indexFields('todo', record.due, at), createdBy: user.email, createdAt: at, updatedBy: user.email, updatedAt: at },
        { recordKey: `TASKLOG#${taskId}#${at}`, taskId, text: `Tarefa criada para ${names[record.owner] ?? record.owner}${record.due ? `; prazo ${record.due}` : ''}.${record.note ? ` ${record.note}` : ''}`, createdBy: user.email, createdAt: at },
      ]);
      await announce(user, record.owner === user.email.toLowerCase() ? `criou «${record.title}»` : `criou «${record.title}» para ${names[record.owner] ?? record.owner}`, { taskId, taskPartition: partition });
      return reply(201, { taskId, partition });
    },

    'GET /v1/leads/{id}/tasks/{taskId}': async ({ id, event }) => {
      const taskId = event.pathParameters.taskId;
      const [records, log] = await Promise.all([deps.queryRecords(id, `TASK#${taskId}`), deps.queryRecords(id, `TASKLOG#${taskId}#`)]);
      if (!records.length) return fail(404, 'Tarefa não encontrada.');
      return reply(200, { ...toTask(records[0], lisbonToday()), log: log.map(toCaseLog).sort((a, b) => b.at.localeCompare(a.at)) });
    },

    'POST /v1/leads/{id}/tasks/{taskId}': async ({ id, user, body, event }) => {
      const taskId = event.pathParameters.taskId;
      const [record] = await deps.queryRecords(id, `TASK#${taskId}`);
      if (!record) return fail(404, 'Tarefa não encontrada.');
      const members = await deps.listTeam();
      const current = toTask(record, lisbonToday());
      const parsed = parseTaskUpdate(body, current, { staff: members.map(member => member.email.toLowerCase()) });
      if (parsed.error) return fail(400, parsed.error);
      const at = now().toISOString();
      const set = { ...parsed.set };
      if (set.taskStatus || set.due !== undefined) Object.assign(set, indexFields(set.taskStatus ?? current.status, set.due ?? current.due, at));
      if (Object.keys(set).length) await deps.setRecord(id, `TASK#${taskId}`, { ...set, updatedBy: user.email, updatedAt: at });
      const change = Object.keys(parsed.set).length ? describeChange(parsed.set, current, namesOf(members)) : `comentou «${current.title}»`;
      await deps.putRecords(id, [{ recordKey: `TASKLOG#${taskId}#${at}`, taskId, text: [`${user.name} ${change}.`, parsed.note].filter(Boolean).join(' '), createdBy: user.email, createdAt: at }]);
      await announce(user, parsed.note && !Object.keys(parsed.set).length ? `${change}: ${parsed.note}` : change, { taskId, taskPartition: id });
      return reply(204);
    },

    // Feed «O que se passa»: últimos 7 dias, mais recente primeiro; casos só para quem os vê.
    'GET /v1/feed': async ({ user }) => {
      const at = now();
      const items = await deps.queryAgenda(FEED.status, new Date(at - FEED.days * 864e5).toISOString(), at.toISOString());
      const seeCases = allowed(user.groups, 'cases');
      const feed = items.map(toFeed).filter(entry => seeCases || entry.scope !== 'cases').sort((a, b) => b.at.localeCompare(a.at)).slice(0, FEED.limit);
      return reply(200, { feed, checkedAt: at.toISOString() }, 'no-store');
    },

    // Alertas que ligam cada problema ao ecrã onde se resolve (campo tab).
    'GET /v1/alerts': async ({ user }) => {
      const at = now();
      const settle = promise => promise.then(value => value, () => null);
      const [ops, report, prepared, failed, missed, leads, openCases] = await Promise.all([
        settle(deps.operations()),
        settle(loadReport()),
        settle(deps.queryAgenda(NOTIFY.prepared, new Date(at - 864e5).toISOString(), at.toISOString())),
        settle(deps.queryAgenda(NOTIFY.failed, new Date(at - 864e5).toISOString(), at.toISOString())),
        settle(deps.queryAgenda(NOTIFY.missed, new Date(at - 864e5).toISOString(), at.toISOString())),
        settle(listLeads('all')),
        allowed(user.groups, 'cases') ? settle(deps.queryStatus(CASE_STATE.open)) : Promise.resolve(null),
      ]);
      const alerts = [];
      const add = (level, text, tab) => alerts.push({ level, text, tab });
      if (!ops) add('warn', 'Não foi possível ler o estado do pipeline.', 'operations');
      if (ops?.queues.failedEvents.waiting) add('bad', `${ops.queues.failedEvents.waiting} evento(s) do chat falharam e estão na fila de erros: verificar o processamento.`, 'operations');
      if (ops?.queues.conversationEvents.waiting > 50) add('warn', `${ops.queues.conversationEvents.waiting} eventos à espera de processamento.`, 'operations');
      for (const worker of ops?.workers.filter(item => item.errors24h) ?? []) add('bad', `${worker.label ?? workerLabel(worker.name.split('-').slice(1).join('-') || worker.name)} teve ${worker.errors24h} erro(s) nas últimas 24 h.`, 'operations');
      if (ops && (!ops.churnReview || at - new Date(ops.churnReview.evaluatedAt) > 36 * 36e5)) add('warn', 'A revisão diária de leads não corre há mais de 36 h.', 'operations');
      const social = leads?.filter(lead => lead.journey.socialSource && at - new Date(lead.lastActivityAt) < 7 * 864e5).length ?? null;
      if (social === 0) add('warn', 'Nenhum lead das redes sociais nos últimos 7 dias: verificar as ligações das campanhas e a ponte /connect.', 'operations');
      // Lembretes de leads de demonstração (sintéticos) não contam, como nos indicadores.
      const demo = new Set(leads?.filter(lead => lead.synthetic).map(lead => lead.id) ?? []);
      const real = list => (list ?? []).filter(item => !demo.has(str(item, 'conversationId')));
      if (real(prepared).length) add('warn', `${real(prepared).length} lembrete(s) preparado(s) para enviar à mão.`, 'agenda');
      if (real(failed).length + real(missed).length) add('bad', `${real(failed).length + real(missed).length} lembrete(s) falharam ou não foram enviados a tempo.`, 'agenda');
      const today = lisbonToday();
      const cases = openCases?.map(item => toCase(item, today)) ?? [];
      if (cases.some(item => item.deadlineState === 'overdue')) add('bad', `${cases.filter(item => item.deadlineState === 'overdue').length} caso(s) de reclamação ou litígio fora do prazo.`, 'cases');
      if (cases.some(item => item.deadlineState === 'due-soon')) add('warn', `${cases.filter(item => item.deadlineState === 'due-soon').length} caso(s) com prazo nos próximos 3 dias úteis.`, 'cases');
      if (report?.summary.fail) add('warn', `${report.summary.fail} política(s) legal(is) em falta.`, 'governance');
      const churning = leads?.filter(lead => !lead.synthetic && lead.atRisk).length ?? 0;
      if (churning) add('bad', `${churning} lead(s) disseram que vão desistir: contactar já.`, 'leads');
      // Um alerta por lead: quem está em risco de desistência já tem o alerta acima.
      const late = leads?.filter(lead => !lead.synthetic && lead.replyLate && !lead.atRisk) ?? [];
      if (late.length) add('bad', `${late.length} lead(s) passaram o prazo de resposta: responder já.`, 'leads');
      const order = { bad: 0, warn: 1 };
      return reply(200, { alerts: alerts.sort((a, b) => order[a.level] - order[b.level]), checkedAt: at.toISOString() }, 'private, max-age=60');
    },

    // Painel da fundadora: seguimentos, pontos de falha e quem tem o quê, numa só vista.
    'GET /v1/control': async () => {
      const at = now();
      const today = lisbonToday();
      const week = new Date(at - 7 * 864e5).toISOString();
      const settle = promise => Promise.resolve().then(() => promise).catch(() => []);
      const [members, leads, work, taskItems, caseItems, alertItems, ...reminderLists] = await Promise.all([
        deps.listTeam(), listLeads('all'), loadWork(), deps.queryStatus(TASK_STATE.open), deps.queryStatus(CASE_STATE.open),
        settle(deps.queryAgenda(TEAM_ALERTS.status, week, at.toISOString())),
        ...['sent', 'prepared', 'failed', 'missed'].map(status => settle(deps.queryAgenda(NOTIFY[status], week, at.toISOString()))),
      ]);
      const demo = new Set(leads.filter(lead => lead.synthetic).map(lead => lead.id));
      const summary = controlSummary({
        leads, members, tasks: taskItems.map(item => toTask(item, today)), cases: caseItems.map(item => toCase(item, today)),
        alerts: alertItems.map(toAlert),
        reminders: Object.fromEntries(['sent', 'prepared', 'failed', 'missed'].map((status, index) => [status, reminderLists[index].filter(item => !demo.has(str(item, 'conversationId'))).length])),
      });
      // Trabalho em aberto da equipa, com as regras de «O meu trabalho»: cada pessoa vê aqui a sua lista,
      // e a equipa conta cada item uma vez, tenha ou não responsável. Os alertas não somam: apontam para
      // trabalho que já está contado.
      const active = new Set(members.filter(member => member.enabled).map(member => member.email.toLowerCase()));
      const ownedBy = email => Boolean(email) && active.has(email.toLowerCase());
      const realOpen = work.leads.filter(lead => !lead.synthetic);
      const ownedLeads = new Set(realOpen.filter(lead => ownedBy(lead.assignedTo)).map(lead => lead.id));
      const waiting = work.threads.filter(thread => thread.waiting);
      const kinds = ['lead', 'task', 'message', 'reminder', 'case'];
      const count = (total, unowned) => ({ total: total.length, unowned: unowned.length });
      const team = {
        lead: count(realOpen, realOpen.filter(lead => !ownedLeads.has(lead.id))),
        task: count(work.tasks, work.tasks.filter(task => !ownedBy(task.owner))),
        message: count(waiting, waiting.filter(thread => !ownedLeads.has(thread.leadId))),
        reminder: count(work.prepared, work.prepared.filter(item => !ownedBy(item.approvedBy) && !ownedLeads.has(item.conversationId))),
        case: count(work.cases, work.cases.filter(item => !ownedBy(item.owner))),
      };
      const people = members.filter(member => member.enabled).map(member => {
        const items = workItems(member.email, member.groups, work);
        return {
          name: member.name, groups: member.groups, total: items.length,
          urgent: items.filter(item => ['risk', 'overdue'].includes(item.urgency)).length,
          ...Object.fromEntries([...kinds, 'alert'].map(kind => [kind, items.filter(item => item.kind === kind).length])),
        };
      }).sort((a, b) => b.urgent - a.urgent || b.total - a.total || a.name.localeCompare(b.name));
      const total = kinds.reduce((sum, kind) => sum + team[kind].total, 0);
      const unowned = kinds.reduce((sum, kind) => sum + team[kind].unowned, 0);
      if (team.message.unowned) summary.breaking.unshift({ level: 'warn', text: `${team.message.unowned} mensagem(ns) por responder sem responsável.`, tab: 'whatsapp' });
      return reply(200, { ...summary, work: { total, unowned, team, people }, unansweredMessages: team.message.unowned, checkedAt: at.toISOString() }, 'private, max-age=60');
    },

    'GET /v1/security': async () => {
      const [members, report, openCases] = await Promise.all([deps.listTeam(), loadReport().catch(() => null), deps.queryStatus(CASE_STATE.open)]);
      const founders = members.filter(member => member.groups.includes('founders') && member.enabled);
      const today = lisbonToday();
      const overdueCases = openCases.map(item => toCase(item, today)).filter(item => item.deadlineState === 'overdue').length;
      const findings = [
        founders.length < 2 ? { level: 'warn', text: `Só ${founders.length} fundador(a) ativo(s): recomenda-se pelo menos 2 para não perder o acesso de gestão.` } : null,
        ...members.filter(member => member.enabled && member.status !== 'CONFIRMED').map(member => ({ level: 'info', text: `${member.name} ainda não aceitou o convite (${member.status}).` })),
        ...(report?.summary.fail ? [{ level: 'warn', text: `${report.summary.fail} política(s) em falta em Governança.`, tab: 'governance' }] : []),
        overdueCases ? { level: 'bad', text: `${overdueCases} caso(s) de reclamação ou litígio fora do prazo.` } : null,
      ].filter(Boolean);
      return reply(200, {
        findings,
        accounts: { total: members.length, active: members.filter(member => member.enabled).length, disabled: members.filter(member => !member.enabled).length, pendingInvites: members.filter(member => member.enabled && member.status !== 'CONFIRMED').length, founders: founders.length },
        policies: report?.summary ?? null,
        controls: [
          { area: 'Identidade', control: 'Login Cognito com MFA obrigatório, sem registo público, sessões de 12 h no máximo', status: 'on' },
          { area: 'Autorização', control: 'Cada rota exige token JWT; papéis verificados no servidor em cada pedido', status: 'on' },
          { area: 'Rede', control: 'HTTPS obrigatório, CORS só do domínio da intranet, limite de 20 pedidos/s', status: 'on' },
          { area: 'Navegador', control: 'Política de segurança de conteúdo estrita, sem scripts de terceiros, sem cookies de rastreio', status: 'on' },
          { area: 'Dados', control: 'Tabelas e buckets cifrados, recuperação pontual e versões retidas; arquivo bruto expira em 90 dias', status: 'on' },
          { area: 'Segredos', control: 'Credenciais de serviço no Secrets Manager; a intranet só vê metadados', status: 'on' },
          { area: 'Registos', control: 'Logs sem texto de mensagens, contactos nem tokens; evidências versionadas', status: 'on' },
          { area: 'Proteção web', control: 'AWS WAF à frente da intranet e da API', status: 'off' },
          { area: 'Auditoria', control: 'AWS CloudTrail com alertas de acessos administrativos', status: 'off' },
        ],
      });
    },

    // Parceiros com a avaliação dos últimos SCORE.windowDays dias (resultados registados na Agenda).
    'GET /v1/partners': async () => {
      const at = now();
      const outcomes = await deps.queryAgenda(OUTCOME_STATUS, new Date(at - SCORE.windowDays * 864e5).toISOString(), at.toISOString()).catch(() => []);
      const results = outcomes.map(toOutcome);
      // NPS da BLU na janela: todas as respostas de recomendação, de qualquer parceiro.
      return reply(200, { partners: deps.partners, reminders: REMINDERS, kinds: KINDS, channels: CHANNELS, outcomes: OUTCOMES, score: SCORE, scorecards: scorecards(deps.partners, results, at), nps: netPromoter(results.map(item => item.recommend)) }, 'private, max-age=60');
    },

    // Resultado de um dia de serviço de um parceiro: um registo por ocorrência, que se pode corrigir.
    'POST /v1/leads/{id}/activities/{activityId}/outcome': async ({ id, user, event, body }) => {
      const activityId = event.pathParameters?.activityId ?? '';
      if (!/^[A-Za-z0-9-]{8,64}$/.test(activityId)) return fail(400, 'Atividade inválida.');
      const activity = (await deps.queryRecords(id, 'ACTIVITY#')).map(toActivity).find(item => item.id === activityId);
      if (!activity) throw new NotFound();
      const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date ?? '') ? body.date : '';
      const inRange = date && date >= activity.date && date <= (activity.repeatUntil || activity.date);
      const occurrenceAt = inRange ? lisbonToUtc(date, activity.time) : null;
      const parsed = parseOutcome(body, activity, occurrenceAt, now());
      if (parsed.error) return fail(400, parsed.error);
      await deps.putRecords(id, [outcomeRecord({ activityId, date, occurrenceAt, activity, outcome: parsed.outcome, user, now: now() })]);
      return reply(201, { result: parsed.outcome.result });
    },

    'GET /v1/leads/{id}/activities': async ({ id }) => {
      const [activities, notifications] = await Promise.all([deps.queryRecords(id, 'ACTIVITY#'), deps.queryRecords(id, 'NOTIFY#')]);
      return reply(200, { activities: activities.map(toActivity), notifications: notifications.map(toNotification) });
    },

    'POST /v1/leads/{id}/activities': async ({ id, user, body }) => {
      const parsed = parseActivity(body, deps.partners, now());
      if (parsed.error) return fail(400, parsed.error);
      const [lead, settings] = await Promise.all([getLead(id), loadSettings()]);
      const activityId = deps.newId();
      const partner = deps.partners.find(item => item.id === parsed.activity.partnerId);
      const notifications = plan(parsed.activity, { activityId, travellerPhone: digitsOnly(lead.phones[0]), travellerEmail: lead.emails[0] ?? '', partner, travellerConsent: Boolean(lead.consentAt), now: now() });
      const at = now().toISOString();
      await deps.putRecords(id, [
        { recordKey: `ACTIVITY#${activityId}`, activityId, ...parsed.activity, reminders: parsed.activity.reminders.join(','), status: 'ACTIVE', createdBy: user.email, createdAt: at, notificationCount: String(notifications.length) },
        ...notificationRecords(notifications, parsed.activity, partner, settings, user, at),
      ]);
      return reply(201, { activityId, notifications: notifications.length, warnings: activityWarnings(notifications, parsed.activity, partner, lead, settings) });
    },

    // Alterar uma atividade: só os campos enviados mudam e o conjunto volta a ser validado por inteiro.
    // Lembretes por enviar são cancelados e planeados de novo (com revisão na chave, para não
    // colidir com os anteriores); os já enviados ficam como evidência.
    'POST /v1/leads/{id}/activities/{activityId}': async ({ id, user, event, body }) => {
      const activityId = event.pathParameters?.activityId ?? '';
      if (!/^[A-Za-z0-9-]{8,64}$/.test(activityId)) return fail(400, 'Atividade inválida.');
      const raw = (await deps.queryRecords(id, 'ACTIVITY#')).find(item => str(item, 'activityId') === activityId);
      if (!raw) throw new NotFound();
      const current = toActivity(raw);
      if (current.status === 'CANCELLED') return fail(409, 'A atividade está cancelada: agende uma nova.');
      const base = { ...current, repeatUntil: current.repeatUntil || current.date, travellerChannel: current.travellerChannel || 'whatsapp', partnerChannel: current.partnerChannel || 'whatsapp' };
      const edits = Object.fromEntries(Object.entries(body).filter(([key, value]) => ACTIVITY_FIELDS[key] && value !== undefined));
      const parsed = parseActivity({ ...base, ...edits }, deps.partners, now());
      if (parsed.error) return fail(400, parsed.error);
      const changed = Object.keys(ACTIVITY_FIELDS).filter(key => JSON.stringify(parsed.activity[key]) !== JSON.stringify(base[key]));
      if (!changed.length) return fail(400, 'Nada para alterar.');
      const [lead, settings, pending] = await Promise.all([
        getLead(id), loadSettings(),
        deps.queryRecords(id, 'NOTIFY#').then(items => items.filter(item => str(item, 'activityId') === activityId && [NOTIFY.pending, NOTIFY.prepared].includes(str(item, 'followUpStatus')))),
      ]);
      const partner = deps.partners.find(item => item.id === parsed.activity.partnerId);
      const at = now().toISOString();
      const revision = Number(str(raw, 'revision') || '0') + 1;
      const notifications = plan(parsed.activity, { activityId, travellerPhone: digitsOnly(lead.phones[0]), travellerEmail: lead.emails[0] ?? '', partner, travellerConsent: Boolean(lead.consentAt), now: now() })
        .map(notification => ({ ...notification, recordKey: `${notification.recordKey}#r${revision}` }));
      await Promise.all(pending.map(item => deps.setRecord(id, str(item, 'recordKey'), { followUpStatus: NOTIFY.cancelled, reason: 'Atividade alterada: lembrete substituído.' }, str(item, 'followUpStatus'))));
      await deps.setRecord(id, `ACTIVITY#${activityId}`, {
        ...Object.fromEntries(Object.entries(parsed.activity).map(([key, value]) => [key, Array.isArray(value) ? value.join(',') : String(value)])),
        revision: String(revision), updatedBy: user.email, updatedAt: at, notificationCount: String(notifications.length),
      });
      if (notifications.length) await deps.putRecords(id, notificationRecords(notifications, parsed.activity, partner, settings, user, at));
      await announce(user, `alterou ${KINDS[parsed.activity.kind].toLowerCase()} «${parsed.activity.title}» (${changed.map(key => ACTIVITY_FIELDS[key]).join(', ')})`, { scope: 'agenda' });
      return reply(200, { activityId, changed, notifications: notifications.length, warnings: activityWarnings(notifications, parsed.activity, partner, lead, settings) });
    },

    'POST /v1/leads/{id}/activities/{activityId}/cancel': async ({ id, event }) => {
      const activityId = event.pathParameters?.activityId ?? '';
      if (!/^[A-Za-z0-9-]{8,64}$/.test(activityId)) return fail(400, 'Atividade inválida.');
      const pending = (await deps.queryRecords(id, 'NOTIFY#')).filter(item => item.activityId?.S === activityId && item.followUpStatus?.S === NOTIFY.pending);
      await deps.setRecord(id, `ACTIVITY#${activityId}`, { status: 'CANCELLED', cancelledAt: now().toISOString() });
      await Promise.all(pending.map(item => deps.setRecord(id, item.recordKey.S, { followUpStatus: NOTIFY.cancelled }, NOTIFY.pending)));
      return reply(204);
    },

    // Agenda: os lembretes (como antes) e o plano do dia, com tudo o que tem data: serviços,
    // tarefas, seguimentos de leads, prazos de casos e lembretes para enviar à mão. «mine» é o
    // trabalho da própria pessoa; «team» é o de toda a equipa. O que passou do prazo fica em «overdue».
    'GET /v1/agenda': async ({ user, event }) => {
      // Centro de operações: o mesmo trabalho de «O meu trabalho» e da Visão geral, com estado, motivo e quem desbloqueia.
      if (event.queryStringParameters?.view === 'ops') {
        const at = now();
        const week = new Date(at - 7 * 864e5).toISOString();
        const dayEnd = new Date(+at + 864e5).toISOString();
        const settle = promise => Promise.resolve().then(() => promise).catch(() => []);
        const [work, members, failedLists, services] = await Promise.all([
          loadWork({ cases: allowed(user.groups, 'cases'), inbox: allowed(user.groups, 'leads') }), deps.listTeam(),
          Promise.all([NOTIFY.failed, NOTIFY.missed].map(status => settle(deps.queryAgenda(status, week, at.toISOString())))),
          settle(deps.queryAgenda(NOTIFY.pending, new Date(at - 864e5).toISOString(), dayEnd)),
        ]);
        const { demo } = work;
        const real = { ...work, leads: work.leads.filter(lead => !lead.synthetic) };
        const failed = failedLists.flat().map(toNotification).filter(item => !demo.has(item.conversationId));
        const items = opsItems({ work: real, failed, services: services.map(toNotification).filter(item => !demo.has(item.conversationId)), members, partners: deps.partners });
        const scope = event.queryStringParameters?.scope === 'team' ? 'team' : 'mine';
        return reply(200, { ...opsView(items, { scope, me: user.email, members }), today: work.today, checkedAt: at.toISOString() });
      }
      const days = Math.min(Math.max(Number.parseInt(event.queryStringParameters?.days ?? '2', 10) || 2, 1), 14);
      const scope = event.queryStringParameters?.scope === 'team' ? 'team' : 'mine';
      const me = user.email.toLowerCase();
      const at = now();
      const today = lisbonToday();
      const horizon = plusDays(today, days);
      const start = new Date(at - 864e5).toISOString();
      const end = new Date(+at + days * 864e5).toISOString();
      const statuses = [NOTIFY.pending, NOTIFY.sent, NOTIFY.prepared, NOTIFY.failed, NOTIFY.missed];
      const [items, outcomes, taskItems, leads, caseItems, members] = await Promise.all([
        Promise.all(statuses.map(status => deps.queryAgenda(status, start, end))).then(lists => lists.flat()),
        deps.queryAgenda(OUTCOME_STATUS, start, end).catch(() => []),
        deps.queryStatus(TASK_STATE.open),
        listLeads('open'),
        allowed(user.groups, 'cases') ? deps.queryStatus(CASE_STATE.open) : Promise.resolve([]),
        scope === 'team' ? Promise.resolve().then(() => deps.listTeam()).catch(() => []) : Promise.resolve([]),
      ]);
      const notifications = items.map(toNotification).sort((a, b) => a.sendAt.localeCompare(b.sendAt));
      const mine = owner => scope === 'team' || (owner ?? '').toLowerCase() === me;
      // Registos antigos podem não ter ocorrência ou data válida: nunca rebentar por isso.
      const lisbon = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' });
      const dayOf = iso => (Number.isNaN(Date.parse(iso ?? '')) ? '' : lisbon.format(Date.parse(iso)));
      const bucket = day => (day < today ? 'overdue' : day);
      // Serviços: uma linha por ocorrência com os seus lembretes; quem agendou é o responsável.
      const services = new Map();
      for (const item of notifications) {
        const key = `${item.activityId}|${item.occurrenceAt}`;
        const service = services.get(key) ?? {
          kind: 'service', id: key, partition: item.conversationId, activityId: item.activityId, occurrenceAt: item.occurrenceAt || item.sendAt, day: dayOf(item.occurrenceAt) || dayOf(item.sendAt) || today,
          title: `${KINDS[item.kind] ?? item.kind}: ${item.title}`, detail: [item.place, item.people ? `${item.people} pessoa(s)` : '', item.partnerName].filter(Boolean).join(' · '),
          owner: item.approvedBy, urgency: 'normal', reminders: [],
        };
        service.reminders.push(item);
        services.set(key, service);
      }
      const serviceItems = [...services.values()].filter(service => mine(service.owner)).map(service => ({
        ...service, urgency: service.reminders.some(r => [NOTIFY.failed, NOTIFY.missed].includes(r.status)) ? 'overdue' : service.day === today ? 'soon' : 'normal',
      }));
      const tasks = taskItems.map(item => toTask(item, today)).filter(task => mine(task.owner) && task.due && task.due <= horizon).map(task => ({
        kind: 'task', id: task.id, partition: task.partition, day: bucket(task.due), due: task.due, title: task.title,
        detail: [TASK_STATUS[task.status], task.blockedReason, task.leadLabel].filter(Boolean).join(' · '), owner: task.owner, urgency: taskUrgency(task),
      }));
      // Na vista da equipa, os leads sem responsável entram sempre (hoje, ou em atraso): são de todos.
      const followUps = leads.filter(lead => !lead.synthetic && mine(lead.assignedTo)).map(lead => {
        const due = (lead.replyLate && lead.replyDueAt ? lead.replyDueAt : lead.followUpAt).slice(0, 10);
        const urgency = lead.atRisk ? 'risk' : lead.replyLate || isOverdue(lead, at) ? 'overdue' : !lead.assignedTo ? 'soon' : 'normal';
        const detail = lead.atRisk ? 'Disse que vai desistir: contactar já' : lead.replyLate ? 'Sem resposta dentro do prazo' : 'Seguimento marcado';
        return {
          kind: 'lead', id: lead.id, partition: lead.id, day: urgency === 'normal' ? bucket(due) : urgency === 'soon' ? today : 'overdue', due, title: lead.journey.destination || lead.id,
          detail: lead.assignedTo ? detail : `Sem responsável: assumir · ${detail}`, owner: lead.assignedTo ?? '', urgency, ...(lead.assignedTo ? {} : { unassigned: true }),
        };
      }).filter(item => item.urgency !== 'normal' || (item.due && item.due <= horizon));
      const cases = caseItems.map(item => toCase(item, today)).filter(item => mine(item.owner) && item.deadline && item.deadline <= horizon).map(item => ({
        kind: 'case', id: item.id, partition: item.partition, day: bucket(item.deadline), due: item.deadline, title: item.title,
        detail: CASE_TYPES[item.type]?.label ?? item.type, owner: item.owner, urgency: item.deadlineState === 'overdue' ? 'overdue' : item.deadlineState === 'due-soon' ? 'soon' : 'normal',
      }));
      const prepared = notifications.filter(item => item.status === NOTIFY.prepared && mine(item.approvedBy)).map(item => ({
        kind: 'reminder', id: item.recordKey, partition: item.conversationId, day: !(Date.parse(item.sendAt) > at) ? 'overdue' : dayOf(item.sendAt), due: item.sendAt.slice(0, 10),
        title: `Enviar à mão: ${item.title}`, detail: item.reason || 'Preparado: enviar à mão', owner: item.approvedBy, urgency: 'overdue',
      }));
      const all = [...serviceItems, ...tasks, ...followUps, ...cases, ...prepared];
      const dayKeys = [...new Set(all.map(item => item.day))].sort((a, b) => (a === 'overdue' ? -1 : b === 'overdue' ? 1 : a.localeCompare(b)));
      const byDay = dayKeys.map(day => ({ day, items: all.filter(item => item.day === day).sort((a, b) => byUrgency(a, b) || (a.occurrenceAt ?? '').localeCompare(b.occurrenceAt ?? '')) }));
      // Vista da equipa: quem tem o quê (todo o trabalho em aberto, não só o deste período).
      const realLeads = leads.filter(lead => !lead.synthetic);
      const openTasks = taskItems.map(item => toTask(item, today));
      const openCases = caseItems.map(item => toCase(item, today));
      const people = members.filter(member => member.enabled).map(member => {
        const email = member.email.toLowerCase();
        return {
          name: member.name, email,
          leads: realLeads.filter(lead => (lead.assignedTo ?? '').toLowerCase() === email).length,
          tasks: openTasks.filter(task => task.owner === email).length,
          cases: openCases.filter(item => (item.owner ?? '').toLowerCase() === email).length,
          services: serviceItems.filter(service => (service.owner ?? '').toLowerCase() === email).length,
        };
      }).sort((a, b) => b.leads + b.tasks + b.cases + b.services - (a.leads + a.tasks + a.cases + a.services) || a.name.localeCompare(b.name));
      const team = scope === 'team' ? { people, unassigned: { leads: realLeads.filter(lead => !lead.assignedTo).length, tasks: openTasks.filter(task => !task.owner).length } } : undefined;
      // Os totais da Agenda seguem a vista: «Só o meu» conta os lembretes que a pessoa aprovou ou dos seus leads.
      const ownLeadIds = new Set(leads.filter(lead => lead.assignedTo?.toLowerCase() === me).map(lead => lead.id));
      const scoped = scope === 'team' ? notifications : notifications.filter(item => mine(item.approvedBy) || ownLeadIds.has(item.conversationId));
      return reply(200, { notifications: scoped, outcomes: outcomes.map(toOutcome), outcomeLabels: OUTCOMES, plan: { today, scope, days, items: byDay, ...(team ? { team } : {}) } });
    },
  };

  const writes = new Set(['POST /v1/leads/{id}/activities/{activityId}/outcome', 'POST /v1/leads/{id}/contacted', 'POST /v1/leads/{id}/assign', 'PUT /v1/leads/{id}/tags', 'POST /v1/leads/{id}/ask', 'POST /v1/leads/{id}/activities', 'POST /v1/leads/{id}/activities/{activityId}', 'POST /v1/leads/{id}/activities/{activityId}/cancel']);
  const admin = new Set(['POST /v1/team/invite', 'POST /v1/team/{username}/role', 'POST /v1/team/{username}/status']);
  const caseRoutes = new Set(['GET /v1/cases', 'POST /v1/cases', 'GET /v1/leads/{id}/cases', 'GET /v1/leads/{id}/cases/{caseId}', 'POST /v1/leads/{id}/cases/{caseId}']);
  const taskWrites = new Set(['POST /v1/tasks', 'POST /v1/leads/{id}/tasks/{taskId}']);

  return async function handler(event) {
    const route = routes[event.routeKey];
    if (!route) return fail(404, 'Rota desconhecida.');
    const claims = event.requestContext?.authorizer?.jwt?.claims ?? {};
    const groups = groupsOf(claims);
    if (!groups.some(group => STAFF.includes(group))) return fail(403, 'Sem acesso à intranet. Peça ao grupo para o adicionar.');
    if (!allowed(groups, 'read') && !LIMITED_ROUTES.has(event.routeKey)) return fail(403, 'O seu perfil não tem acesso a esta secção.');
    if (writes.has(event.routeKey) && !allowed(groups, 'leads')) return fail(403, 'Esta ação é reservada a curadores e fundadores.');
    if (admin.has(event.routeKey) && !allowed(groups, 'team-admin')) return fail(403, 'Só fundadores gerem acessos.');
    if (event.routeKey === 'POST /v1/settings' && !allowed(groups, 'team-admin')) return fail(403, 'Só fundadores alteram as regras de seguimento.');
    if (event.routeKey === 'POST /v1/governance/attestations' && !allowed(groups, 'security')) return fail(403, 'Só fundadores e governança confirmam regras.');
    if (event.routeKey === 'POST /v1/leads/{id}/feedback' && !allowed(groups, 'feedback')) return fail(403, 'Só fundadores dão feedback às conversas.');
    if (event.routeKey === 'POST /v1/whatsapp-test' && !allowed(groups, 'leads')) return fail(403, 'Só curadores e fundadores escrevem na caixa de teste.');
    if (caseRoutes.has(event.routeKey) && !allowed(groups, 'cases')) return fail(403, 'Sem acesso a reclamações e litígios.');
    if (taskWrites.has(event.routeKey) && !allowed(groups, 'tasks')) return fail(403, 'Só curadores, governança e fundadores alteram tarefas.');
    if (event.routeKey.includes('{taskId}') && !validRecordId(event.pathParameters?.taskId)) return fail(400, 'Tarefa inválida.');
    if (event.routeKey === 'GET /v1/control' && !allowed(groups, 'team-admin')) return fail(403, 'Só fundadores veem o painel de controlo.');
    if (event.routeKey === 'GET /v1/security' && !allowed(groups, 'security')) return fail(403, 'Só fundadores e governança veem a segurança.');
    if (event.routeKey.includes('{caseId}') && !/^[A-Za-z0-9-]{8,64}$/.test(event.pathParameters?.caseId ?? '')) return fail(400, 'Caso inválido.');
    const user = { email: String(claims.email ?? ''), name: String(claims.name ?? claims.email ?? ''), username: String(claims['cognito:username'] ?? claims.sub ?? ''), groups };
    if (event.routeKey.includes('{username}') && !/^[\w.@+-]{1,128}$/.test(event.pathParameters?.username ?? '')) return fail(400, 'Utilizador inválido.');
    const id = event.pathParameters?.id;
    if (event.routeKey.includes('{id}') && !validLeadId(id)) return fail(400, 'Referência inválida.');
    const body = parse(event);
    if (body === null) return fail(400, 'Pedido inválido.');
    try {
      return await route({ event, user, id, body });
    } catch (error) {
      if (error instanceof NotFound) return fail(404, 'Contacto não encontrado.');
      // Só a categoria do erro: nunca texto de clientes nem tokens.
      console.error(JSON.stringify({ route: event.routeKey, error: error?.name ?? 'Error' }));
      return fail(500, 'Erro interno. Tente novamente.');
    }
  };
}
