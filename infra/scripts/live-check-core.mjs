// Verificação depois de cada deploy, sem AWS para poder ser testada: um lead de demonstração
// permanente (sintético, fora dos indicadores) com uma recolha amanhã, para um ecrã vazio
// significar avaria e não falta de dados; e as regras que decidem se o que está publicado bate certo.
export const DEMO = {
  leadId: 'BLU-DEMOLIVE00000001',
  destination: 'DEMONSTRAÇÃO · verificação do sistema',
  title: 'Recolha de demonstração (verificação)',
  place: 'Hotel de demonstração, Lisboa',
  time: '09:30',
};
export const STACKS = ['BluCostaData', 'BluCostaFrontend', 'BluCostaBackoffice', 'BluCostaIntranet', 'BluCostaPortal'];
export const SITE_FILES = ['index.html', 'app.js', 'styles.css', 'auth.js'];
// Utilizador técnico das invocações diretas da API: só leituras e a recolha de demonstração.
export const CHECKER = { email: 'live-check@blu.internal', name: 'Verificação automática', groups: ['founders'] };

const S = value => ({ S: String(value) });
const lisbonDate = (instant, days = 0) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date(+instant + days * 864e5));

/** Perfil do lead de demonstração: sintético, com consentimento e seguimento já fora do prazo. */
export function demoProfile(now) {
  const ago = days => new Date(+now - days * 864e5).toISOString();
  return {
    conversationId: S(DEMO.leadId), recordKey: S('PROFILE'), followUpStatus: S('PENDING'), followUpAt: S(ago(2)),
    lastActivityAt: S(ago(3)), consentAt: S(ago(3)), lastChannel: S('website'), messageCount: { N: '2' }, synthetic: { BOOL: true },
    journeyStage: S('curator-follow-up'),
    journeyJson: S(JSON.stringify({ destination: DEMO.destination, timeframe: 'sempre amanhã', party: '2 adultos' })),
  };
}

/** Duas mensagens de demonstração (sem contactos: os lembretes ficam preparados, nunca saem). */
export function demoMessages(now) {
  const at = new Date(+now - 3 * 864e5).toISOString();
  return [
    { conversationId: S(DEMO.leadId), occurredAtId: S(`${at}#demo-1`), actor: S('customer'), channel: S('website'), eventType: S('conversation.message.recorded'), text: S('Mensagem de demonstração: viagem fictícia para verificar o sistema.') },
    { conversationId: S(DEMO.leadId), occurredAtId: S(`${at}#demo-2`), actor: S('assistant'), channel: S('website'), eventType: S('conversation.message.recorded'), text: S('Resposta de demonstração.') },
  ];
}

/**
 * Recolha diária a partir de amanhã durante 30 dias, pela mesma rota que um curador usa: um só
 * agendamento mantém a Agenda com conteúdo durante um mês. Sem contactos, os lembretes ficam
 * preparados e nunca saem.
 */
export const demoActivity = now => ({ kind: 'pickup', title: DEMO.title, place: DEMO.place, date: lisbonDate(now, 1), repeatUntil: lisbonDate(now, 30), time: DEMO.time, people: 2, reminders: ['traveller-evening'], notes: 'Demonstração: não é um serviço real.' });

/** Há uma ocorrência futura do lead de demonstração na agenda? */
export const demoScheduled = (notifications, now) => notifications.some(item => item.conversationId === DEMO.leadId && Date.parse(item.occurrenceAt || item.sendAt) >= +now);

/** Evento como o API Gateway o entrega à Lambda, com o utilizador técnico. */
export const apiEvent = (routeKey, { body, query, pathParameters } = {}) => ({
  routeKey,
  pathParameters,
  queryStringParameters: query,
  body: body === undefined ? undefined : JSON.stringify(body),
  requestContext: { authorizer: { jwt: { claims: { email: CHECKER.email, name: CHECKER.name, 'cognito:groups': `[${CHECKER.groups.join(' ')}]` } } } },
});

/** Ficheiros publicados diferentes dos do Git (fins de linha ignorados). */
export const fileMismatches = (live, git) => Object.keys(git).filter(name => (live[name] ?? '').replace(/\r/g, '') !== git[name].replace(/\r/g, ''));

/** Resultado final: cada verificação é { name, ok, detail }; avisos não reprovam. */
export function summary(results) {
  const failed = results.filter(result => result.ok === false);
  const warned = results.filter(result => result.ok === 'warn');
  return { ok: failed.length === 0, failed: failed.length, warned: warned.length, lines: results.map(result => `${result.ok === true ? 'OK ' : result.ok === 'warn' ? 'AVISO' : 'FALHA'} ${result.name}${result.detail ? `: ${result.detail}` : ''}`) };
}
