import {
  CONTACTED, NOTE_LIMIT, OPEN_STATUSES, QUESTION_LIMIT,
  atRisk, cleanTags, contactDetails, groupsOf, metrics, toLead, toMessage, validLeadId,
} from './model.mjs';
import { CHANNELS, KINDS, NOTIFY, REMINDERS, digitsOnly, parseActivity, plan } from './schedule.mjs';
import { CASE_CHANNELS, CASE_STATE, CASE_STATUS, CASE_TYPES, UNLINKED, deadlineState, parseCase, parseCaseUpdate } from './cases.mjs';

// Rotas da intranet. Os acessos AWS chegam injetados em `deps` (index.mjs na AWS,
// simulações nos testes), para que a autorização e a validação sejam testadas sem rede.
export class NotFound extends Error {}

// Papéis (grupos Cognito) e o que cada um pode fazer. Um cofre único de acessos:
// a identidade vive no Cognito, as credenciais de serviço no Secrets Manager.
export const ROLES = {
  founders: { label: 'Fundador(a)', can: ['read', 'leads', 'cases', 'security', 'team-admin'] },
  curators: { label: 'Curador(a)', can: ['read', 'leads', 'cases'] },
  governance: { label: 'Governança', can: ['read', 'cases', 'security'] },
  testers: { label: 'Testes', can: ['read'] },
};
const STAFF = Object.keys(ROLES);
const allowed = (groups, permission) => groups.some(group => ROLES[group]?.can.includes(permission));
const validEmail = email => typeof email === 'string' && email.length <= 254 && /^[^\s@<>()]+@[^\s@<>()]+\.[a-z]{2,}$/i.test(email);

const str = (item, key) => item[key]?.S ?? '';
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
});

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

  async function listLeads(filter) {
    const statuses = filter === 'contacted' ? [CONTACTED] : filter === 'all' ? [...OPEN_STATUSES, CONTACTED] : OPEN_STATUSES;
    const items = (await Promise.all(statuses.map(status => deps.queryStatus(status)))).flat();
    const leads = items.map(toLead).map(lead => ({ ...lead, atRisk: atRisk(lead) }));
    // Quem disse que vai desistir aparece primeiro, para contacto rápido.
    return filter === 'contacted'
      ? leads.sort((a, b) => (b.contactedAt ?? '').localeCompare(a.contactedAt ?? ''))
      : leads.sort((a, b) => b.atRisk - a.atRisk || a.followUpAt.localeCompare(b.followUpAt));
  }

  async function getLead(id) {
    const [records, transcript] = await Promise.all([deps.getRecords(id), deps.getTranscript(id)]);
    const profile = records.find(item => item.recordKey?.S === 'PROFILE');
    if (!profile) throw new NotFound();
    const messages = transcript.map(toMessage).sort((a, b) => a.at.localeCompare(b.at));
    const lead = toLead(profile);
    return { ...lead, atRisk: atRisk(lead), messages, ...contactDetails(messages) };
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
      return reply(204);
    },

    'POST /v1/leads/{id}/assign': async ({ id, user, body }) => {
      const at = now().toISOString();
      if (body.release === true) await deps.updateProfile(id, { updatedAt: at }, ['assignedTo', 'assignedAt']);
      else await deps.updateProfile(id, { assignedTo: user.email, assignedAt: at, updatedAt: at });
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

    'GET /v1/metrics': async () => reply(200, metrics(await listLeads('all'), now()), 'private, max-age=60'),

    'GET /v1/team': async () => {
      const [members, leads] = await Promise.all([deps.listTeam(), listLeads('open')]);
      const owned = leads.reduce((totals, lead) => {
        if (lead.assignedTo) totals[lead.assignedTo] = (totals[lead.assignedTo] ?? 0) + 1;
        return totals;
      }, {});
      return reply(200, { members: members.map(member => ({ ...member, openLeads: owned[member.email] ?? 0 })) });
    },

    'GET /v1/operations': async () => reply(200, await deps.operations(), 'private, max-age=30'),

    'GET /v1/governance': async () => reply(200, await deps.governance(), 'private, max-age=300'),

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
      return reply(204);
    },

    // Alertas que ligam cada problema ao ecrã onde se resolve (campo tab).
    'GET /v1/alerts': async ({ user }) => {
      const at = now();
      const settle = promise => promise.then(value => value, () => null);
      const [ops, report, prepared, failed, missed, leads, openCases] = await Promise.all([
        settle(deps.operations()),
        settle(deps.policyReport()),
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
      const overdueLeads = leads?.filter(lead => !lead.synthetic && lead.status === 'QUEUED_FOR_REVIEW').length ?? 0;
      if (overdueLeads) add('warn', `${overdueLeads} lead(s) em atraso à espera de contacto.`, 'leads');
      const order = { bad: 0, warn: 1 };
      return reply(200, { alerts: alerts.sort((a, b) => order[a.level] - order[b.level]), checkedAt: at.toISOString() }, 'private, max-age=60');
    },

    'GET /v1/security': async () => {
      const [members, report, openCases] = await Promise.all([deps.listTeam(), deps.policyReport().catch(() => null), deps.queryStatus(CASE_STATE.open)]);
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
      const lead = await getLead(id);
      const activityId = deps.newId();
      const partner = deps.partners.find(item => item.id === parsed.activity.partnerId);
      const notifications = plan(parsed.activity, { activityId, travellerPhone: digitsOnly(lead.phones[0]), travellerEmail: lead.emails[0] ?? '', partner, travellerConsent: Boolean(lead.consentAt), now: now() });
      const at = now().toISOString();
      await deps.putRecords(id, [
        { recordKey: `ACTIVITY#${activityId}`, activityId, ...parsed.activity, reminders: parsed.activity.reminders.join(','), status: 'ACTIVE', createdBy: user.email, createdAt: at, notificationCount: String(notifications.length) },
        ...notifications.map(notification => ({ ...notification, followUpStatus: NOTIFY.pending, followUpAt: notification.sendAt, kind: parsed.activity.kind, title: parsed.activity.title, place: parsed.activity.place, people: parsed.activity.people, partnerName: parsed.activity.partnerId === 'bolt' ? 'Bolt' : partner?.name ?? '', approvedBy: user.email, createdAt: at })),
      ]);
      const warnings = [];
      if (notifications.some(n => n.audience === 'traveller' && !n.to)) warnings.push(`O viajante não deixou ${parsed.activity.travellerChannel === 'email' ? 'email' : 'telefone'}: os lembretes ficam preparados para envio manual.`);
      if (partner && !partner.whatsapp && notifications.some(n => n.audience === 'partner')) warnings.push(`${partner.name} não tem número WhatsApp: os lembretes ao parceiro ficam preparados.`);
      if (!lead.consentAt) warnings.push('Sem consentimento registado: não foram agendados lembretes ao viajante.');
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

  return async function handler(event) {
    const route = routes[event.routeKey];
    if (!route) return fail(404, 'Rota desconhecida.');
    const claims = event.requestContext?.authorizer?.jwt?.claims ?? {};
    const groups = groupsOf(claims);
    if (!groups.some(group => STAFF.includes(group))) return fail(403, 'Sem acesso à intranet. Peça ao grupo para o adicionar.');
    if (writes.has(event.routeKey) && !allowed(groups, 'leads')) return fail(403, 'Esta ação é reservada a curadores e fundadores.');
    if (admin.has(event.routeKey) && !allowed(groups, 'team-admin')) return fail(403, 'Só fundadores gerem acessos.');
    if (caseRoutes.has(event.routeKey) && !allowed(groups, 'cases')) return fail(403, 'Sem acesso a reclamações e litígios.');
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
