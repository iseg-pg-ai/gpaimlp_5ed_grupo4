import {
  CONTACTED, NOTE_LIMIT, OPEN_STATUSES, QUESTION_LIMIT,
  cleanTags, contactDetails, groupsOf, metrics, toLead, toMessage, validLeadId,
} from './model.mjs';
import { CHANNELS, KINDS, NOTIFY, REMINDERS, digitsOnly, parseActivity, plan } from './schedule.mjs';

// Rotas da intranet. Os acessos AWS chegam injetados em `deps` (index.mjs na AWS,
// simulações nos testes), para que a autorização e a validação sejam testadas sem rede.
export class NotFound extends Error {}

// Papéis (grupos Cognito) e o que cada um pode fazer. Um cofre único de acessos:
// a identidade vive no Cognito, as credenciais de serviço no Secrets Manager.
export const ROLES = {
  founders: { label: 'Fundador(a)', can: ['read', 'leads', 'team-admin'] },
  curators: { label: 'Curador(a)', can: ['read', 'leads'] },
  governance: { label: 'Governança', can: ['read'] },
  testers: { label: 'Testes', can: ['read'] },
};
const STAFF = Object.keys(ROLES);
const allowed = (groups, permission) => groups.some(group => ROLES[group]?.can.includes(permission));
const validEmail = email => typeof email === 'string' && email.length <= 254 && /^[^\s@<>()]+@[^\s@<>()]+\.[a-z]{2,}$/i.test(email);

const str = (item, key) => item[key]?.S ?? '';
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

  async function listLeads(filter) {
    const statuses = filter === 'contacted' ? [CONTACTED] : filter === 'all' ? [...OPEN_STATUSES, CONTACTED] : OPEN_STATUSES;
    const items = (await Promise.all(statuses.map(status => deps.queryStatus(status)))).flat();
    const leads = items.map(toLead);
    return filter === 'contacted'
      ? leads.sort((a, b) => (b.contactedAt ?? '').localeCompare(a.contactedAt ?? ''))
      : leads.sort((a, b) => a.followUpAt.localeCompare(b.followUpAt));
  }

  async function getLead(id) {
    const [records, transcript] = await Promise.all([deps.getRecords(id), deps.getTranscript(id)]);
    const profile = records.find(item => item.recordKey?.S === 'PROFILE');
    if (!profile) throw new NotFound();
    const messages = transcript.map(toMessage).sort((a, b) => a.at.localeCompare(b.at));
    return { ...toLead(profile), messages, ...contactDetails(messages) };
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

  return async function handler(event) {
    const route = routes[event.routeKey];
    if (!route) return fail(404, 'Rota desconhecida.');
    const claims = event.requestContext?.authorizer?.jwt?.claims ?? {};
    const groups = groupsOf(claims);
    if (!groups.some(group => STAFF.includes(group))) return fail(403, 'Sem acesso à intranet. Peça ao grupo para o adicionar.');
    if (writes.has(event.routeKey) && !allowed(groups, 'leads')) return fail(403, 'Esta ação é reservada a curadores e fundadores.');
    if (admin.has(event.routeKey) && !allowed(groups, 'team-admin')) return fail(403, 'Só fundadores gerem acessos.');
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
