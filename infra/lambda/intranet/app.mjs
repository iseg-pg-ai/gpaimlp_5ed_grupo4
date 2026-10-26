import {
  CONTACTED, NOTE_LIMIT, OPEN_STATUSES, QUESTION_LIMIT,
  atRisk, cleanTags, contactDetails, groupsOf, isOverdue, metrics, toLead, toMessage, validLeadId,
} from './model.mjs';
import { CHANNELS, KINDS, NOTIFY, REMINDERS, digitsOnly, parseActivity, plan } from './schedule.mjs';
import { CASE_CHANNELS, CASE_STATE, CASE_STATUS, CASE_TYPES, UNLINKED, deadlineState, parseCase, parseCaseUpdate } from './cases.mjs';
import { ATTESTATIONS, AUTO_TYPES, SETTINGS, VALUE_RULES, applyAttestations, currentSettings, parseAttestation, parseSettings, replyState } from './settings.mjs';
import { WHATSAPP_TEST, inboxRecord, parseInboxPost, threads, toInboxMessage, whatsappMode } from './whatsapp-test.mjs';
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
};
const STAFF = Object.keys(ROLES);
const allowed = (groups, permission) => groups.some(group => ROLES[group]?.can.includes(permission));
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
const toCase = (item, today) => {
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
const toNotification = item => ({
  conversationId: str(item, 'conversationId'), recordKey: str(item, 'recordKey'), activityId: str(item, 'activityId'),
  audience: str(item, 'audience'), kind: str(item, 'kind'), title: str(item, 'title'), sendAt: str(item, 'followUpAt'),
  occurrenceAt: str(item, 'occurrenceAt'), status: str(item, 'followUpStatus'), reason: str(item, 'reason'),
  hasNumber: Boolean(str(item, 'to')), text: str(item, 'text'), sentAt: str(item, 'sentAt'), channel: str(item, 'channel') || 'whatsapp',
  place: str(item, 'place'), people: Number(str(item, 'people') || 0), partnerName: str(item, 'partnerName'),
  delivery: str(item, 'delivery'),
});
const toTask = (item, today) => {
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
      if (body.release === true) await deps.updateProfile(id, { updatedAt: at }, ['assignedTo', 'assignedAt']);
      else await deps.updateProfile(id, { assignedTo: user.email, assignedAt: at, updatedAt: at });
      await announce(user, body.release === true ? `libertou o lead ${id}` : `assumiu o lead ${id}`);
      return reply(204);
    },

    'PUT /v1/leads/{id}/tags': async ({ id, body }) => {
      const at = now().toISOString();
      const tags = cleanTags(body.tags);
      const note = typeof body.note === 'string' ? body.note.trim().slice(0, NOTE_LIMIT) : '';
      const set = { taggedAt: at, updatedAt: at };
      const remove = [];
      if (tags.length) set.tags = tags; else remove.push('tags');
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
          return { id: lead.id, journey: lead.journey, stage: lead.stage, status: lead.status, synthetic: lead.synthetic, messageCount: lead.messageCount, lastActivityAt: lead.lastActivityAt, feedbackCount: given.length, lastFeedback: given[0] ?? null };
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
      return reply(200, { mode: whatsappMode(deps.whatsappMode), threads: threads(items.map(toInboxMessage)) });
    },

    'POST /v1/whatsapp-test': async ({ user, body }) => {
      if (whatsappMode(deps.whatsappMode) !== 'test') return fail(409, 'O WhatsApp está em modo real: a caixa de teste só pode ser lida.');
      const parsed = parseInboxPost(body, validLeadId);
      if (parsed.error) return fail(400, parsed.error);
      const at = now().toISOString();
      await deps.putRecords(WHATSAPP_TEST.partition, [inboxRecord({ at, id: deps.newId(), ...parsed.message, author: user.email, authorName: user.name })]);
      return reply(201, { at });
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
      const changes = [parsed.settings.replyHours !== current.replyHours ? `prazo de resposta: ${parsed.settings.replyHours} h` : '', ...switched].filter(Boolean);
      if (changes.length) await announce(user, `alterou as regras de seguimento (${changes.join('; ')})`);
      return reply(200, { ...parsed.settings, updatedBy: user.email, updatedAt: at, types: AUTO_TYPES });
    },

    // Carga por pessoa (leads e tarefas), para o Painel mostrar quem está sobrecarregado.
    'GET /v1/team': async () => {
      const today = lisbonToday();
      const [members, leads, taskItems] = await Promise.all([deps.listTeam(), listLeads('open'), deps.queryStatus(TASK_STATE.open)]);
      const owned = leads.reduce((totals, lead) => {
        if (lead.assignedTo) totals[lead.assignedTo] = (totals[lead.assignedTo] ?? 0) + 1;
        return totals;
      }, {});
      const tasks = taskItems.map(item => toTask(item, today));
      const ownTasks = email => tasks.filter(task => task.owner === email.toLowerCase());
      return reply(200, { members: members.map(member => ({
        ...member, openLeads: owned[member.email] ?? 0, openTasks: ownTasks(member.email).length,
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
      const me = user.email.toLowerCase();
      const at = now();
      const today = lisbonToday();
      const [taskItems, leads, prepared, openCases] = await Promise.all([
        deps.queryStatus(TASK_STATE.open),
        listLeads('open'),
        deps.queryAgenda(NOTIFY.prepared, new Date(at - 7 * 864e5).toISOString(), at.toISOString()),
        allowed(user.groups, 'cases') ? deps.queryStatus(CASE_STATE.open) : Promise.resolve([]),
      ]);
      const myLeads = leads.filter(lead => lead.assignedTo?.toLowerCase() === me);
      const myLeadIds = new Set(myLeads.map(lead => lead.id));
      const items = [
        ...taskItems.map(item => toTask(item, today)).filter(task => task.owner === me)
          .map(task => ({ kind: 'task', id: task.id, partition: task.partition, title: task.title, due: task.due, urgency: taskUrgency(task), task })),
        ...myLeads.map(lead => ({
          kind: 'lead', id: lead.id, partition: lead.id, title: lead.journey.destination || lead.id, due: lead.followUpAt.slice(0, 10),
          detail: [lead.journey.timeframe, lead.journey.party].filter(Boolean).join(' · '), urgency: lead.atRisk ? 'risk' : lead.replyLate || isOverdue(lead, at) ? 'overdue' : 'normal',
        })),
        ...prepared.filter(item => str(item, 'approvedBy').toLowerCase() === me || myLeadIds.has(str(item, 'conversationId'))).map(toNotification)
          .map(item => ({ kind: 'reminder', id: item.recordKey, partition: item.conversationId, title: item.title, due: item.sendAt.slice(0, 10), detail: `${item.reason || 'Preparado: enviar à mão'}`, urgency: 'overdue' })),
        ...(openCases ?? []).map(item => toCase(item, today)).filter(item => item.owner === me)
          .map(item => ({ kind: 'case', id: item.id, partition: item.partition, title: item.title, due: item.deadline, detail: CASE_TYPES[item.type]?.label ?? item.type, urgency: item.deadlineState === 'overdue' ? 'overdue' : item.deadlineState === 'due-soon' ? 'soon' : 'normal' })),
      ].sort(byUrgency);
      return reply(200, { items, statuses: TASK_STATUS, today });
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
      for (const worker of ops?.workers.filter(item => item.errors24h) ?? []) add('bad', `${worker.name.replace(/^BluCosta\w+-/, '')} teve ${worker.errors24h} erro(s) nas últimas 24 h.`, 'operations');
      if (ops && (!ops.churnReview || at - new Date(ops.churnReview.evaluatedAt) > 36 * 36e5)) add('warn', 'A revisão diária de leads não corre há mais de 36 h.', 'operations');
      const social = leads?.filter(lead => lead.journey.socialSource && at - new Date(lead.lastActivityAt) < 7 * 864e5).length ?? null;
      if (social === 0) add('warn', 'Nenhum lead das redes sociais nos últimos 7 dias: verificar as ligações das campanhas e a ponte /connect.', 'operations');
      if (prepared?.length) add('warn', `${prepared.length} lembrete(s) preparado(s) para enviar à mão.`, 'agenda');
      if ((failed?.length ?? 0) + (missed?.length ?? 0)) add('bad', `${(failed?.length ?? 0) + (missed?.length ?? 0)} lembrete(s) falharam ou não foram enviados a tempo.`, 'agenda');
      const today = lisbonToday();
      const cases = openCases?.map(item => toCase(item, today)) ?? [];
      if (cases.some(item => item.deadlineState === 'overdue')) add('bad', `${cases.filter(item => item.deadlineState === 'overdue').length} caso(s) de reclamação ou litígio fora do prazo.`, 'cases');
      if (cases.some(item => item.deadlineState === 'due-soon')) add('warn', `${cases.filter(item => item.deadlineState === 'due-soon').length} caso(s) com prazo nos próximos 3 dias úteis.`, 'cases');
      if (report?.summary.fail) add('warn', `${report.summary.fail} política(s) legal(is) em falta.`, 'governance');
      const churning = leads?.filter(lead => !lead.synthetic && lead.atRisk).length ?? 0;
      if (churning) add('bad', `${churning} lead(s) disseram que vão desistir: contactar já.`, 'leads');
      const late = leads?.filter(lead => !lead.synthetic && lead.replyLate) ?? [];
      if (late.length) add('bad', `${late.length} lead(s) passaram o prazo de resposta: responder já.`, 'leads');
      const order = { bad: 0, warn: 1 };
      return reply(200, { alerts: alerts.sort((a, b) => order[a.level] - order[b.level]), checkedAt: at.toISOString() }, 'private, max-age=60');
    },

    'GET /v1/security': async () => {
      const [members, report, openCases] = await Promise.all([deps.listTeam(), loadReport().catch(() => null), deps.queryStatus(CASE_STATE.open)]);
      const founders = members.filter(member => member.groups.includes('founders') && member.enabled);
      const today = lisbonToday();
      const overdueCases = openCases.map(item => toCase(item, today)).filter(item => item.deadlineState === 'overdue').length;
      const findings = [
        founders.length < 2 ? { level: 'warn', text: `Só ${founders.length} fundador(a) ativo(s): recomenda-se pelo menos 2 para não perder o acesso de gestão.` } : null,
        ...members.filter(member => member.enabled && member.status !== 'CONFIRMED').map(member => ({ level: 'info', text: `${member.name} ainda não aceitou o convite (${member.status}).` })),
        ...(report?.summary.fail ? [{ level: 'warn', text: `${report.summary.fail} política(s) em falta em Governança.` }] : []),
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

    'GET /v1/partners': async () => reply(200, { partners: deps.partners, reminders: REMINDERS, kinds: KINDS, channels: CHANNELS }, 'private, max-age=300'),

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
        // Com os lembretes automáticos desligados, ficam preparados para a equipa enviar à mão.
        ...notifications.map(notification => ({ ...notification, followUpStatus: settings.auto.reminders ? NOTIFY.pending : NOTIFY.prepared, ...(settings.auto.reminders ? {} : { reason: 'Envio automático desligado: enviar à mão.' }), followUpAt: notification.sendAt, kind: parsed.activity.kind, title: parsed.activity.title, place: parsed.activity.place, people: parsed.activity.people, partnerName: parsed.activity.partnerId === 'bolt' ? 'Bolt' : partner?.name ?? '', approvedBy: user.email, createdAt: at })),
      ]);
      const warnings = [];
      if (notifications.some(n => n.audience === 'traveller' && !n.to)) warnings.push(`O viajante não deixou ${parsed.activity.travellerChannel === 'email' ? 'email' : 'telefone'}: os lembretes ficam preparados para envio manual.`);
      if (partner && !partner.whatsapp && notifications.some(n => n.audience === 'partner')) warnings.push(`${partner.name} não tem número WhatsApp: os lembretes ao parceiro ficam preparados.`);
      if (!lead.consentAt) warnings.push('Sem consentimento registado: não foram agendados lembretes ao viajante.');
      if (!settings.auto.reminders) warnings.push('Os lembretes automáticos estão desligados: ficam preparados para enviar à mão.');
      return reply(201, { activityId, notifications: notifications.length, warnings });
    },

    'POST /v1/leads/{id}/activities/{activityId}/cancel': async ({ id, event }) => {
      const activityId = event.pathParameters?.activityId ?? '';
      if (!/^[A-Za-z0-9-]{8,64}$/.test(activityId)) return fail(400, 'Atividade inválida.');
      const pending = (await deps.queryRecords(id, 'NOTIFY#')).filter(item => item.activityId?.S === activityId && item.followUpStatus?.S === NOTIFY.pending);
      await deps.setRecord(id, `ACTIVITY#${activityId}`, { status: 'CANCELLED', cancelledAt: now().toISOString() });
      await Promise.all(pending.map(item => deps.setRecord(id, item.recordKey.S, { followUpStatus: NOTIFY.cancelled }, NOTIFY.pending)));
      return reply(204);
    },

    'GET /v1/agenda': async ({ event }) => {
      const days = Math.min(Math.max(Number.parseInt(event.queryStringParameters?.days ?? '2', 10) || 2, 1), 14);
      const start = new Date(now() - 864e5).toISOString();
      const end = new Date(+now() + days * 864e5).toISOString();
      const statuses = [NOTIFY.pending, NOTIFY.sent, NOTIFY.prepared, NOTIFY.failed, NOTIFY.missed];
      const items = (await Promise.all(statuses.map(status => deps.queryAgenda(status, start, end)))).flat();
      return reply(200, { notifications: items.map(toNotification).sort((a, b) => a.sendAt.localeCompare(b.sendAt)) });
    },
  };

  const writes = new Set(['POST /v1/leads/{id}/contacted', 'POST /v1/leads/{id}/assign', 'PUT /v1/leads/{id}/tags', 'POST /v1/leads/{id}/ask', 'POST /v1/leads/{id}/activities', 'POST /v1/leads/{id}/activities/{activityId}/cancel']);
  const admin = new Set(['POST /v1/team/invite', 'POST /v1/team/{username}/role', 'POST /v1/team/{username}/status']);
  const caseRoutes = new Set(['GET /v1/cases', 'POST /v1/cases', 'GET /v1/leads/{id}/cases', 'GET /v1/leads/{id}/cases/{caseId}', 'POST /v1/leads/{id}/cases/{caseId}']);
  const taskWrites = new Set(['POST /v1/tasks', 'POST /v1/leads/{id}/tasks/{taskId}']);

  return async function handler(event) {
    const route = routes[event.routeKey];
    if (!route) return fail(404, 'Rota desconhecida.');
    const claims = event.requestContext?.authorizer?.jwt?.claims ?? {};
    const groups = groupsOf(claims);
    if (!groups.some(group => STAFF.includes(group))) return fail(403, 'Sem acesso à intranet. Peça ao grupo para o adicionar.');
    if (writes.has(event.routeKey) && !allowed(groups, 'leads')) return fail(403, 'Esta ação é reservada a curadores e fundadores.');
    if (admin.has(event.routeKey) && !allowed(groups, 'team-admin')) return fail(403, 'Só fundadores gerem acessos.');
    if (event.routeKey === 'POST /v1/settings' && !allowed(groups, 'team-admin')) return fail(403, 'Só fundadores alteram as regras de seguimento.');
    if (event.routeKey === 'POST /v1/governance/attestations' && !allowed(groups, 'security')) return fail(403, 'Só fundadores e governança confirmam regras.');
    if (event.routeKey === 'POST /v1/leads/{id}/feedback' && !allowed(groups, 'feedback')) return fail(403, 'Só fundadores dão feedback às conversas.');
    if (event.routeKey === 'POST /v1/whatsapp-test' && !allowed(groups, 'leads')) return fail(403, 'Só curadores e fundadores escrevem na caixa de teste.');
    if (caseRoutes.has(event.routeKey) && !allowed(groups, 'cases')) return fail(403, 'Sem acesso a reclamações e litígios.');
    if (taskWrites.has(event.routeKey) && !allowed(groups, 'tasks')) return fail(403, 'Só curadores, governança e fundadores alteram tarefas.');
    if (event.routeKey.includes('{taskId}') && !validRecordId(event.pathParameters?.taskId)) return fail(400, 'Tarefa inválida.');
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
