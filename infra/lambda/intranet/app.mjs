import {
  CONTACTED, NOTE_LIMIT, OPEN_STATUSES, QUESTION_LIMIT,
  cleanTags, contactDetails, groupsOf, metrics, toLead, toMessage, validLeadId,
} from './model.mjs';

// Rotas da intranet. Os acessos AWS chegam injetados em `deps` (index.mjs na AWS,
// simulações nos testes), para que a autorização e a validação sejam testadas sem rede.
export class NotFound extends Error {}

const STAFF = ['curators', 'governance'];

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
  };

  const writes = new Set(['POST /v1/leads/{id}/contacted', 'POST /v1/leads/{id}/assign', 'PUT /v1/leads/{id}/tags', 'POST /v1/leads/{id}/ask']);

  return async function handler(event) {
    const route = routes[event.routeKey];
    if (!route) return fail(404, 'Rota desconhecida.');
    const claims = event.requestContext?.authorizer?.jwt?.claims ?? {};
    const groups = groupsOf(claims);
    if (!groups.some(group => STAFF.includes(group))) return fail(403, 'Sem acesso à intranet. Peça ao grupo para o adicionar.');
    if (writes.has(event.routeKey) && !groups.includes('curators')) return fail(403, 'Esta ação é reservada a curadores.');
    const user = { email: String(claims.email ?? ''), name: String(claims.name ?? claims.email ?? ''), groups };
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
