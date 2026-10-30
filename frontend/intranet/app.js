import { proposalShareUrl, embedProposalLink, proposalPayload } from './proposal-links.js';
import { challengeFor, claimsOf, expired, loginUrl, logoutUrl, randomString, refreshRequest, tokenRequest } from './auth.js';

// Intranet da equipa. Todo o texto vindo da API é inserido com textContent (nunca HTML).
const config = window.BLU_INTRANET;
// Um só site para a equipa; os grupos Cognito decidem o que cada pessoa vê (aqui e na API).
const SITE = { name: 'BLU Mission Control', start: 'work' };
// Perfis sem leitura geral (marketing) veem só estes separadores; a API aplica a mesma regra.
const LIMITED_TABS = ['work', 'dashboard'];
const session = { idToken: '', refreshToken: '', claims: null };
const $ = id => document.getElementById(id);

// Sinais da análise automática (infra/lambda/intranet/signals.mjs); ninguém os altera à mão.
const SIGNALS = {
  hot: 'Muito interessado', 'proposal-next': 'Preparar proposta', 'needs-info': 'Falta informação',
  'at-risk': 'Risco de perda', 'not-a-fit': 'Fora do âmbito',
};
const SENTIMENTS = { positive: ['Positivo', 'ok'], neutral: ['Neutro', ''], negative: ['Negativo', 'bad'] };
const JOURNEY = {
  destination: 'Destino', timeframe: 'Datas', party: 'Viajantes', budget: 'Orçamento', interests: 'Interesses',
  pace: 'Ritmo', socialSource: 'Origem', campaign: 'Campanha', medium: 'Meio', content: 'Conteúdo', stage: 'Etapa',
};
const STAGES = { exploring: 'A explorar', qualifying: 'A qualificar', 'ready-for-curator': 'Pronto para curador', 'curator-follow-up': 'Consentiu seguimento' };
const NOTIFY_STATUS = {
  NOTIFY_PENDING: ['Agendado', ''], NOTIFY_SENDING: ['A enviar', 'warn'], NOTIFY_SENT: ['Enviado', 'ok'],
  NOTIFY_PREPARED: ['Preparado: enviar à mão', 'warn'], NOTIFY_FAILED: ['Falhou', 'bad'], NOTIFY_MISSED: ['Não enviado (atraso)', 'bad'], NOTIFY_CANCELLED: ['Cancelado', ''],
};
const AUDIENCE = { traveller: 'Viajante', partner: 'Parceiro' };
const KIND = { pickup: 'Recolha', excursion: 'Excursão' };
const lisbonDay = iso => new Intl.DateTimeFormat('pt-PT', { timeZone: 'Europe/Lisbon', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(iso));
const lisbonTime = iso => new Intl.DateTimeFormat('pt-PT', { timeZone: 'Europe/Lisbon', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
let partnerCache;
const loadPartners = async () => (partnerCache ??= await api('GET', '/v1/partners'));
const STATUS = { PENDING: ['Por contactar', 'warn'], QUEUED_FOR_REVIEW: ['Em revisão (atrasado)', 'bad'], CONTACTED: ['Contactado', 'ok'] };

function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = value;
    // Estilos por CSSOM: a política de segurança de conteúdo bloqueia atributos style.
    else if (key === 'style') Object.assign(node.style, value);
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) if (child !== null && child !== undefined && child !== false) node.append(child instanceof Node ? child : String(child));
  return node;
}

const when = iso => (iso ? new Intl.DateTimeFormat('pt-PT', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso)) : '—');
const pill = (text, tone = '') => h('span', { class: `pill ${tone}` }, text);
// Atalhos: cada número ou linha abre o separador certo (no lead, se houver). Sem acesso ao
// separador, fica só o número.
const goTo = (tab, { filter, lead, scope, drill } = {}) => {
  if (tab === 'leads') { if (filter) leadsState.filter = filter; leadsState.selected = lead ?? ''; leadsState.demo = intelDemo.on; }
  if (tab === 'operations' && drill) Object.assign(operationsState, { drill, selected: '', scroll: true });
  if (tab === 'agenda' && scope) agendaState.scope = scope;
  show(tab);
};
const goCard = (value, label, tab, options = {}, tone = '') => {
  const body = [h('div', { class: 'value' }, value ?? '—'), h('div', { class: 'label' }, label)];
  const shade = tone && value ? tone : '';
  return tab && tabVisible(tab) ? h('button', { type: 'button', class: `card go ${shade}`, onclick: () => goTo(tab, options) }, ...body) : h('div', { class: `card ${shade}` }, ...body);
};
const goLink = (tab, options = {}, label = 'Abrir') => (tabVisible(tab) ? h('button', { type: 'button', class: 'link', onclick: () => goTo(tab, options) }, label) : null);
const isRecent = iso => Boolean(iso) && Date.now() - Date.parse(iso) < 864e5;
const VERDICT_TONE = { good: 'ok', improve: 'warn', wrong: 'bad' };
const statusPill = status => pill(...(STATUS[status] ?? [status || '—', '']));
const notifyPill = status => pill(...(NOTIFY_STATUS[status] ?? [status, '']));
const groupsNow = () => session.claims?.['cognito:groups'] ?? [];
// Fundadores e curadores alteram leads e agenda; só fundadores gerem acessos.
const isCurator = () => groupsNow().some(group => ['curators', 'founders'].includes(group));
const isFounder = () => groupsNow().includes('founders');
const ROLE_LABEL = { founders: 'Fundador(a)', curators: 'Curador(a)', governance: 'Governança', testers: 'Testes', marketing: 'Marketing', finance: 'Finanças', auditing: 'Auditoria', legal: 'Jurídico', security: 'Segurança', crm: 'CRM', cloud: 'Cloud', scm: 'SCM (fornecedores)' };
const CHANNEL = { whatsapp: 'WhatsApp', sms: 'SMS', email: 'Email' };
// Governança em linguagem simples: [quando ativo, quando inativo] por controlo do manifest.
const PROMISES = {
  humanApprovalRequired: ['Uma pessoa da equipa aprova antes de qualquer contacto com o cliente.', 'Há contactos com clientes sem aprovação de uma pessoa.'],
  automaticCustomerContact: ['Algumas mensagens são enviadas automaticamente, só a quem deu consentimento.', 'Nenhum cliente recebe mensagens sem aprovação da equipa.'],
  rawTranscriptsExcludedFromKnowledgeBase: ['As conversas completas dos clientes não entram na base de conhecimento do assistente.', null],
  iamProtectedBackofficeInvocation: ['O assistente interno só pode ser usado pela equipa autenticada.', null],
  evidenceVersioning: ['As provas guardam todas as versões; nada se perde.', null],
  syntheticExcludedFromBusinessKpis: ['Dados de demonstração não contam nos números do negócio.', null],
};
const RULE_TOPICS = {
  'Viagens e turismo': ['rnavt-registration', 'partner-licensing', 'package-precontract-info', 'insolvency-protection'],
  'Clientes e reclamações': ['complaints-book', 'complaints-deadline', 'adr-information', 'no-final-prices-by-ai', 'accessibility'],
  'Dados pessoais': ['consent-before-storage', 'storage-limitation', 'reminders-require-consent', 'no-tracking-cookies'],
  'Inteligência artificial e segurança': ['ai-disclosure', 'security-of-processing'],
};
const ACTIONS = {
  'rnavt-registration': 'Indicar o número de registo RNAVT da agência, para aparecer no rodapé do site.',
  'adr-information': 'Escolher a entidade de resolução alternativa de litígios (RAL) e indicá-la no site.',
  'package-precontract-info': 'Confirmar que cada cliente recebe a ficha de informação normalizada antes de pagar.',
  'insolvency-protection': 'Guardar o comprovativo da garantia contra insolvência (Fundo de Garantia de Viagens e Turismo).',
  accessibility: 'Rever a acessibilidade do site e do pedido de reserva.',
};
const EVIDENCE_KIND = { 'churn-followups': 'Revisões de clientes em risco', manifests: 'Configuração das regras e controlos' };
// Espelha ROLES da API: só esconde o que o servidor recusaria de qualquer forma.
const ROLE_PERMS = {
  founders: ['read', 'tasks', 'cases', 'security', 'team-admin', 'feedback', 'operations', 'governance', 'attest'], curators: ['read', 'tasks', 'cases'],
  governance: ['read', 'tasks', 'cases', 'security', 'operations', 'governance', 'attest'], testers: ['read'], marketing: ['tasks'],
  finance: ['read', 'tasks'], auditing: ['read', 'security', 'operations', 'governance'], legal: ['read', 'tasks', 'cases', 'governance', 'attest'],
  security: ['tasks', 'security', 'operations', 'governance'], crm: ['read', 'tasks'], cloud: ['tasks', 'operations', 'security'], scm: ['read', 'tasks'],
};
// Colunas da tabela «Papéis» em Equipa e acessos.
const PERMISSION_LABELS = [['read', 'Dados de clientes'], ['leads', 'Leads e agenda'], ['tasks', 'Tarefas'], ['cases', 'Reclamações'], ['security', 'Segurança'], ['operations', 'Operações'], ['governance', 'Governança'], ['attest', 'Confirmar regras'], ['team-admin', 'Gerir acessos']];
const can = permission => groupsNow().some(group => ROLE_PERMS[group]?.includes(permission));
// Páginas de uma área abrem a quem tem essa permissão, mesmo sem «read» (como na API).
const AREA_TABS = { operations: 'operations', governance: 'governance', security: 'security' };
const tabVisible = tab => can('read') || LIMITED_TABS.includes(tab) || Boolean(AREA_TABS[tab] && can(AREA_TABS[tab]));
// Endereço do portal: uma só fonte, a ligação do menu (index.html).
const portalUrl = (rest = '') => {
  const base = document.getElementById('portal-link')?.href;
  return base ? new URL(rest, base).toString() : '';
};
const DEADLINE = { overdue: ['Fora do prazo', 'bad'], 'due-soon': ['Prazo próximo', 'warn'], 'on-track': ['No prazo', 'ok'], closed: ['Fechado', ''] };
let casePrefill = {};
// Filtro e lead aberto sobrevivem a «Atualizar» e ao regresso ao separador.
// Os leads de demonstração ficam escondidos por defeito, como nos números da Visão geral e do Painel.
const leadsState = { filter: 'open', selected: '', demo: false };
// Conversa com o assistente: só em memória, apaga-se ao recarregar a página.
const whatsappState = { selected: '', leadId: '', proposal: null };

// Proposta enviada pelo portal: #whatsapp?link=…&v=1&dest=… (o fragmento nunca sai do navegador).
// Só aceita ligações de partilha https do portal; o resto é ignorado.
function proposalHandoff() {
  const [tab, query = ''] = location.hash.slice(1).split('?');
  if (tab !== 'whatsapp' || !query) return null;
  const params = new URLSearchParams(query);
  const link = params.get('link') ?? '';
  if (!proposalShareUrl(link, portalUrl())) return null;
  return { link, leadId: (params.get('lead') ?? '').slice(0, 100), version: Math.min(Math.max(Number.parseInt(params.get('v') ?? '1', 10) || 1, 1), 999), destination: (params.get('dest') ?? '').slice(0, 80) };
}

// A mensagem fica preparada para rever: escolhe-se o lead (já sugerido pelo destino) e envia-se.
function handoffPanel(state, leads, rerender) {
  const { proposal } = state;
  const candidates = leads.filter(lead => proposal.destination && lead.journey?.destination?.toLowerCase().includes(proposal.destination.toLowerCase()));
  const guess = proposal.leadId ? leads.find(lead => lead.id === proposal.leadId) : candidates.length === 1 ? candidates[0] : null;
  const holder = h('div', {});
  const who = h('select', { 'aria-label': 'Lead da proposta' }, h('option', { value: '' }, 'Escolher o lead…'),
    leads.filter(lead => !lead.synthetic || intelDemo.on).map(lead => h('option', { value: lead.id, selected: lead.id === guess?.id }, `${lead.journey?.destination || 'Sem destino'} · ${lead.id}`)));
  const load = async () => {
    holder.replaceChildren();
    if (!who.value) return;
    const lead = await api('GET', `/v1/leads/${encodeURIComponent(who.value)}`).catch(() => null);
    if (lead) holder.append(proposalComposer(lead, proposal));
  };
  who.addEventListener('change', load);
  load();
  return h('div', { class: 'panel' },
    h('h3', {}, `Proposta v${String(proposal.version).padStart(3, '0')} recebida do portal`),
    h('p', { class: 'muted' }, 'A mensagem está preparada com o link de acesso temporário. Reveja e envie; se o cliente não responder, escreva uma versão personalizada.'),
    h('label', {}, 'Para o lead', who), holder,
    h('div', { class: 'actions' }, h('button', { type: 'button', class: 'link', onclick: () => { state.proposal = null; rerender(); } }, 'Descartar')));
}
let teamCache;
const loadTeam = async () => (teamCache ??= (await api('GET', '/v1/team')).members);
// «Bloqueado» já aparece no estado da tarefa; a urgência só o usa para ordenar e colorir.
const URGENCY = { risk: ['Risco de desistência', 'bad'], overdue: ['Em atraso', 'bad'], soon: ['Prazo próximo', 'warn'] };
const WORK_KIND = { task: 'Tarefa', lead: 'Lead', reminder: 'Lembrete', case: 'Caso', message: 'WhatsApp', alert: 'Alerta' };
const TASK_TONE = { todo: '', doing: 'ok', blocked: 'warn', done: 'ok' };
// Um toque avança a tarefa: o botão principal é o passo seguinte.
const NEXT_STEP = { todo: ['doing', 'Começar'], doing: ['done', 'Feito'], blocked: ['doing', 'Desbloquear'], done: ['todo', 'Reabrir'] };
const workState = { board: 'open', flash: '' };
// Tipos de trabalho da Visão geral, pela mesma ordem nas contas da equipa e na tabela por pessoa.
const WORK_KINDS = [
  ['lead', 'Leads'], ['task', 'Tarefas'], ['message', 'Mensagens por responder'], ['reminder', 'Lembretes a tratar'], ['case', 'Casos'],
].map(([kind, label]) => [kind, label, 'operations', { drill: { by: 'kind', value: kind, label } }]);
// Agenda: «mine» é o trabalho da própria pessoa; fundadores entram na vista da equipa.
const agendaState = { scope: '', days: 7, mode: 'briefing' };
let taskPrefill = {};

async function api(method, path, body) {
  if (config?.mock) return window.BLU_INTRANET_MOCK(method, path, body);
  if (expired(session.claims) && !(await renew())) return login();
  // Sem rede ou servidor, o navegador só diz «Failed to fetch»; mostra-se uma mensagem útil.
  const response = await fetch(`${config.api}${path}`, {
    method,
    headers: { authorization: `Bearer ${session.idToken}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  }).catch(() => {
    throw new Error('Sem ligação ao servidor da intranet. Verifique a ligação à internet e tente de novo.');
  });
  if (response.status === 401) return login();
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Pedido falhou.');
  return data;
}

async function login() {
  const state = randomString(16);
  const verifier = randomString(48);
  sessionStorage.setItem('blu-intranet-auth', JSON.stringify({ state, verifier, hash: location.hash }));
  location.assign(loginUrl(config, { state, challenge: await challengeFor(verifier) }));
  return new Promise(() => {});
}

async function finishLogin() {
  const params = new URLSearchParams(location.search);
  if (params.get('error')) throw new Error('O login foi cancelado ou recusado.');
  const code = params.get('code');
  if (!code) return false;
  const saved = JSON.parse(sessionStorage.getItem('blu-intranet-auth') || '{}');
  sessionStorage.removeItem('blu-intranet-auth');
  // Depois do login volta-se à secção pedida (ligação partilhada), não ao início.
  history.replaceState(null, '', `${location.pathname}${/^#[\w-]+$/.test(saved.hash ?? '') ? saved.hash : ''}`);
  if (!saved.state || saved.state !== params.get('state')) throw new Error('Sessão de login inválida. Entre novamente.');
  const { url, init } = tokenRequest(config, { code, verifier: saved.verifier });
  const response = await fetch(url, init);
  if (!response.ok) throw new Error('Não foi possível concluir o login.');
  keep(await response.json());
  return true;
}

function keep(tokens) {
  session.idToken = tokens.id_token;
  session.refreshToken = tokens.refresh_token || session.refreshToken;
  session.claims = claimsOf(tokens.id_token);
}

// Pedidos simultâneos partilham a mesma renovação.
let renewing;
function renew() {
  if (!session.refreshToken) return Promise.resolve(false);
  renewing ??= (async () => {
    const { url, init } = refreshRequest(config, session.refreshToken);
    const response = await fetch(url, init).catch(() => null);
    if (!response?.ok) return false;
    keep(await response.json());
    return true;
  })().finally(() => { renewing = undefined; });
  return renewing;
}

// ---------- Secções ----------

// Operações › Inteligência: onde estão os bloqueios, de quem é o trabalho parado, os parceiros com
// problemas e o funil. Cada barra ou número abre os itens desse bloqueio, com o detalhe e as ações
// (atribuir, pedir desbloqueio) na mesma página; os pedidos de desbloqueio mostram o resultado.
const OPS_TONE = { blocked: 'bad', overdue: 'bad', risk: 'bad', failed: 'warn', unassigned: 'warn', today: '' };
const operationsState = { focus: '', drill: null, selected: '', scroll: false };
const DAY_MS = 864e5;

async function opsIntelligence(view, state) {
  // Fundadores começam na equipa; os outros no que é seu ou podem desbloquear.
  state.scope ||= can('team-admin') ? 'team' : 'mine';
  const [data, metrics, partnerData, open, done, work] = await Promise.all([
    api('GET', `/v1/agenda?view=ops&scope=${state.scope}&${demoQuery()}`),
    api('GET', `/v1/metrics?${demoQuery()}`).catch(() => null),
    loadPartners().catch(() => null),
    api('GET', '/v1/tasks?status=open').catch(() => ({ tasks: [] })),
    api('GET', '/v1/tasks?status=done').catch(() => ({ tasks: [] })),
    api('GET', '/v1/work').catch(() => ({ items: [] })),
  ]);
  const alerts = work.items.filter(item => item.kind === 'alert');
  const rerender = () => { view.replaceChildren(); views.operations(view, state).catch(error => view.append(h('p', { class: 'error' }, error.message))); };
  const drillTo = drill => { Object.assign(state, { drill, selected: '', scroll: true }); rerender(); };
  const me = session.claims?.email?.toLowerCase() ?? '';
  const nameOf = email => data.people.find(person => person.email === email)?.name ?? email;
  const age = item => (item.since ? Date.now() - Date.parse(item.since) : 0);
  const stuck = data.items.filter(item => item.blocker);
  const countBy = (list, key) => Object.entries(list.reduce((all, item) => { const value = key(item); all[value] = (all[value] ?? 0) + 1; return all; }, {})).sort((a, b) => b[1] - a[1]);

  // Pedidos de desbloqueio: tarefas «Desbloquear: …»; «Em curso» é o reconhecimento, «Feito» o resultado.
  const requests = [...open.tasks, ...done.tasks.filter(task => Date.now() - Date.parse(task.updatedAt) < 7 * DAY_MS)].filter(task => task.title.startsWith('Desbloquear:'));
  const requestState = task => (task.status === 'done' ? ['Resolvido', 'ok'] : task.status === 'doing' ? ['Reconhecido', 'ok']
    : Date.now() - Date.parse(task.createdAt) > DAY_MS ? ['Sem resposta há mais de 24 h', 'bad'] : ['Enviado', 'warn']);
  const waitingRequests = requests.filter(task => task.status !== 'done');
  const unanswered = waitingRequests.filter(task => task.status !== 'doing' && Date.now() - Date.parse(task.createdAt) > DAY_MS);

  const card = (value, label, tone, onclick) => h('button', { type: 'button', class: `card go ${value ? tone : ''}`, onclick }, h('div', { class: 'value' }, value), h('div', { class: 'label' }, label));
  const blockers = countBy(stuck, item => item.blocker);
  const tallest = blockers[0]?.[1] ?? 1;
  const people = countBy(stuck, item => item.owner || '');
  const widest = people[0]?.[1] ?? 1;

  // Parceiros com problemas nos últimos 90 dias: pontualidade, faltas e NPS, com os serviços a verificar.
  const cards = partnerData?.scorecards ?? [];
  const toCheck = partnerData?.toCheck ?? [];
  const troubled = cards.filter(partner => partner.metrics.noShows || (partner.metrics.punctuality !== null && partner.metrics.punctuality < 0.9) || (partner.metrics.nps !== null && partner.metrics.nps < 0) || toCheck.some(item => item.partnerId === partner.id));
  const percent = value => (value === null || value === undefined ? '—' : `${Math.round(value * 100)}%`);

  // Funil: leads recebidos, em aberto, contactados e serviços realizados (resultados registados).
  const services = cards.reduce((sum, partner) => sum + partner.metrics.services, 0);
  const funnel = metrics ? [['Leads recebidos', metrics.total], ['Em aberto', metrics.open], ['Contactados', metrics.contacted], ['Serviços realizados (90 dias)', services]] : [];
  const funnelTop = Math.max(1, ...funnel.map(([, value]) => value));

  // Itens do bloqueio escolhido: fila à esquerda, detalhe e ações à direita.
  const drill = state.drill ?? { by: 'all', label: 'Todos os itens parados' };
  const inDrill = item => (drill.by === 'all' ? Boolean(item.blocker)
    : drill.by === 'old' ? item.blocker && age(item) > DAY_MS
    : drill.by === 'blocker' ? item.blocker === drill.value
    : drill.by === 'person' ? item.blocker && (item.owner || '') === drill.value
    : drill.by === 'kind' ? item.kind === drill.value : false);
  const queue = data.items.filter(inDrill);
  const detail = h('div', { class: 'panel ops-detail' });
  const select = item => {
    state.selected = item.key;
    for (const row of view.querySelectorAll('li.ops-item')) row.classList.toggle('selected', row.dataset.key === item.key);
    showOpsItem(detail, item, data, { me, nameOf, refresh: rerender });
  };
  const drillPanel = h('div', { class: 'split spaced', id: 'ops-drill' },
    h('div', { class: 'panel' },
      h('div', { class: 'heading-row' }, h('h3', {}, `${drill.label} · ${queue.length}`), h('div', { class: 'actions' },
        queue.length ? h('button', { type: 'button', class: 'link', onclick: () => askAssistant(`Em «${drill.label}» há ${queue.length} item(ns) parado(s): ${queue.slice(0, 8).map(item => `${item.title} (${item.reason})`).join('; ')}. Qual a melhor ordem para os resolver e quem deve agir?`, state.scope) }, 'Perguntar ao assistente') : null,
        state.drill ? h('button', { type: 'button', class: 'link', onclick: () => drillTo(null) }, 'Ver todos') : null)),
      queue.length ? h('ul', { class: 'work-list' }, queue.map(item => h('li', { class: `work-item ops-item clickable${item.key === state.selected ? ' selected' : ''}`, 'data-key': item.key, tabindex: '0', onclick: () => select(item), onkeydown: event => event.key === 'Enter' && select(item) },
        h('div', {}, pill(data.kinds[item.kind] ?? item.kind), ' ', pill(data.blockers[item.blocker] ?? item.blocker, 'warn'), item.demo ? [' ', pill('demo')] : null),
        h('strong', {}, item.title),
        h('div', { class: 'muted' }, [item.ownerName || 'sem responsável', item.since ? `há ${lateBy(item.since)}` : '', item.resolver ? `desbloqueia: ${item.resolver.name}` : ''].filter(Boolean).join(' · ')))))
        : h('p', { class: 'muted' }, 'Nada parado aqui.')),
    detail);

  view.append(...[
    h('div', { class: 'heading-row' }, h('h2', {}, 'Operações'), h('div', { class: 'filters' },
      demoToggle(rerender),
      ...[['mine', 'Só o meu'], ['team', 'Equipa']].map(([key, label]) => h('button', { type: 'button', class: 'secondary', 'aria-pressed': String(state.scope === key), onclick: () => { Object.assign(state, { scope: key, drill: null, selected: '' }); rerender(); } }, label)),
      h('button', { type: 'button', class: 'secondary', onclick: () => askAssistant(`Tenho ${stuck.length} item(ns) parado(s)${blockers.length ? `, sobretudo por «${data.blockers[blockers[0][0]] ?? blockers[0][0]}» (${blockers[0][1]})` : ''}. Qual resolvo primeiro, quem deve agir e qual é o próximo passo?`, state.scope) }, 'Perguntar ao assistente'))),
    // Os alertas da pessoa primeiro: escalamentos, bloqueios, lembretes e casos que lhe foram enviados.
    alerts.length ? fold('ops-alerts', 'Alertas para si', h('ul', { class: 'reminders' }, alerts.map(alert => h('li', {},
      pill(alert.urgency === 'overdue' ? 'Urgente' : 'Atenção', alert.urgency === 'overdue' ? 'bad' : 'warn'), ' ', alert.title, ' ',
      alert.partition && /^BLU-/.test(alert.partition) ? goLink('leads', { filter: 'all', lead: alert.partition }, 'Abrir o lead') : goLink(alert.detail || 'work')))),
    { open: true, count: alerts.length, tone: 'bad' }) : null,
    h('div', { class: 'cards' },
      card(stuck.length, 'Itens parados', 'warn', () => drillTo(null)),
      card(stuck.filter(item => age(item) > DAY_MS).length, 'Parados há mais de 24 h', 'bad', () => drillTo({ by: 'old', label: 'Parados há mais de 24 h' })),
      card(stuck.filter(item => item.blocker === 'owner').length, 'Sem responsável', 'warn', () => drillTo({ by: 'blocker', value: 'owner', label: data.blockers.owner })),
      card(waitingRequests.length, unanswered.length ? `Pedidos de desbloqueio (${unanswered.length} sem resposta)` : 'Pedidos de desbloqueio em aberto', unanswered.length ? 'bad' : '', () => view.querySelector('#ops-requests')?.scrollIntoView({ behavior: 'smooth' }))),
    h('div', { class: 'grid2 spaced' },
      h('div', { class: 'panel' }, h('h3', {}, 'Onde estão os bloqueios'),
        blockers.length ? h('div', { class: 'ops-columns' }, blockers.map(([key, count], index) => h('button', { type: 'button', class: `ops-column${index === 0 ? ' top' : ''}`, 'aria-pressed': String(drill.by === 'blocker' && drill.value === key), onclick: () => drillTo({ by: 'blocker', value: key, label: data.blockers[key] ?? key }) },
          h('strong', {}, count), h('span', { class: 'ops-column-bar', style: { height: `${Math.max(8, Math.round(count / tallest * 100))}%` } }), h('span', { class: 'ops-column-label' }, data.blockers[key] ?? key))))
          : h('p', { class: 'muted' }, 'Nada parado.')),
      h('div', { class: 'panel' }, h('h3', {}, 'Trabalho parado por pessoa'),
        people.length ? h('ul', { class: 'ops-bars' }, people.map(([email, count]) => h('li', {},
          h('button', { type: 'button', class: 'ops-bar', 'aria-pressed': String(drill.by === 'person' && drill.value === email), onclick: () => drillTo({ by: 'person', value: email, label: email ? `Parado de ${nameOf(email)}` : 'Parado sem responsável' }) },
            h('span', { class: 'ops-bar-label' }, email ? nameOf(email) : 'Sem responsável'), h('span', { class: 'ops-bar-track' }, h('span', { class: 'ops-bar-fill', style: { width: `${Math.max(4, Math.round(count / widest * 100))}%` } })), h('strong', {}, count)))))
          : h('p', { class: 'muted' }, 'Ninguém com trabalho parado.'))),
    h('div', { class: 'grid2 spaced' },
      fold('ops-partners', 'Parceiros com problemas', [goLink('partners', {}, 'Abrir Parceiros'),
        troubled.length ? h('table', {},
          h('thead', {}, h('tr', {}, h('th', {}, 'Parceiro'), h('th', {}, 'Pontualidade'), h('th', {}, 'Faltas'), h('th', {}, 'NPS'), h('th', {}, 'A verificar'))),
          h('tbody', {}, troubled.map(partner => h('tr', {}, h('td', {}, partner.name), h('td', {}, percent(partner.metrics.punctuality)), h('td', {}, partner.metrics.noShows),
            h('td', {}, partner.metrics.nps === null || partner.metrics.nps === undefined ? '—' : partner.metrics.nps), h('td', {}, toCheck.filter(item => item.partnerId === partner.id).length)))))
          : h('p', { class: 'muted' }, 'Sem problemas registados nos últimos 90 dias.')], { open: troubled.length > 0, count: troubled.length, tone: 'warn' }),
      fold('ops-funnel', 'Funil',
        funnel.length ? h('ul', { class: 'ops-bars' }, funnel.map(([label, value], index) => h('li', {}, h('div', { class: 'ops-bar' },
          h('span', { class: 'ops-bar-label' }, label), h('span', { class: 'ops-bar-track' }, h('span', { class: 'ops-bar-fill', style: { width: `${Math.max(2, Math.round(value / funnelTop * 100))}%` } })),
          h('strong', {}, index && funnel[0][1] ? `${value} · ${Math.round(value / funnel[0][1] * 100)}%` : value)))))
          : h('p', { class: 'muted' }, 'Sem dados.'))),
    drillPanel,
    fold('ops-requests', 'Pedidos de desbloqueio', [
      requests.length ? h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, 'Pedido'), h('th', {}, 'Para'), h('th', {}, 'Pedido por'), h('th', {}, 'Há'), h('th', {}, 'Estado'))),
        h('tbody', {}, requests.sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(task => h('tr', {},
          h('td', {}, task.title.replace(/^Desbloquear:\s*/, '')), h('td', {}, nameOf(task.owner)), h('td', {}, nameOf(task.createdBy)),
          h('td', {}, lateBy(task.createdAt)), h('td', {}, pill(...requestState(task)))))))
        : h('p', { class: 'muted' }, 'Ainda sem pedidos.')], { id: 'ops-requests', open: waitingRequests.length > 0, count: waitingRequests.length, tone: unanswered.length ? 'bad' : 'warn' }),
    lazyFold('ops-review', 'Conversas do chatbot para rever', async () => conversationReview(await api('GET', '/v1/conversations'), state)),
  ].filter(Boolean));
  const chosen = queue.find(item => item.key === state.selected) ?? queue[0];
  if (chosen) select(chosen); else detail.append(h('p', { class: 'muted' }, 'Escolha um item.'));
  if (state.scroll) { state.scroll = false; drillPanel.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
}

// Pipeline técnico: filas, falhas e workers. Dobrado por defeito; aberto quando se entra por
// «Pipeline técnico» na navegação ou para quem só vê esta área (sem dados de clientes).
function pipelineFold(state, open = false) {
  return lazyFold('ops-pipeline', 'Pipeline técnico', async () => {
    const ops = await api('GET', '/v1/operations');
    const q = ops.queues;
    const queueCard = (depth, label, badWhen) => h('div', { class: 'card' }, h('div', { class: 'value' }, depth.waiting), h('div', { class: 'label' }, label), depth.inFlight ? h('div', { class: 'muted' }, `${depth.inFlight} em processamento`) : null, badWhen && depth.waiting ? pill('Requer atenção', 'bad') : null);
    return [
      h('p', { class: 'muted' }, `Verificado em ${when(ops.checkedAt)}.`),
      h('div', { class: 'cards' },
        queueCard(q.conversationEvents, 'Eventos por processar'), queueCard(q.failedEvents, 'Eventos falhados (DLQ)', true),
        h('div', { class: 'card' }, h('div', { class: 'value' }, ops.churnReview ? ops.churnReview.queued : '—'), h('div', { class: 'label' }, 'Revisão diária: leads em atraso'))),
      h('div', { class: 'table-scroll' }, h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, 'Função'), h('th', {}, 'Stack'), h('th', {}, 'Execuções'), h('th', {}, 'Erros'), h('th', {}, 'Limitações'), h('th', {}, 'Estado'), h('th', {}, 'Atualizada'))),
        h('tbody', {}, ops.workers.map(worker => h('tr', {},
          h('td', {}, worker.name.replace(/^BluCosta\w+-/, '')), h('td', {}, worker.stack.replace('BluCosta', '')),
          h('td', {}, worker.invocations24h), h('td', {}, worker.errors24h), h('td', {}, worker.throttles24h),
          h('td', {}, worker.errors24h ? pill('Com erros', 'bad') : worker.invocations24h ? pill('OK', 'ok') : pill('Sem atividade')),
          h('td', {}, when(worker.lastModified))))))),
    ];
  }, { id: 'ops-pipeline', open: open || state.focus === 'pipeline' });
}

// Detalhe de um item: porquê está parado, de quem é, quem desbloqueia e as ações possíveis ali mesmo.
function showOpsItem(panel, item, data, { me, nameOf, refresh }) {
  const status = h('p', { class: 'muted', role: 'status' });
  const run = async (fn, done) => {
    status.textContent = 'A guardar…';
    try { await fn(); teamCache = undefined; status.textContent = done; setTimeout(refresh, 600); } catch (error) { status.textContent = error.message; }
  };
  const leadId = /^BLU-/.test(item.partition ?? '') ? item.partition : '';
  const peopleSelect = (filter, selected, label) => h('select', { 'aria-label': label }, h('option', { value: '' }, label),
    data.people.filter(filter).map(person => h('option', { value: person.email, selected: person.email === selected }, person.name)));
  const actions = [];
  const extra = [];

  if (item.kind === 'lead' && isCurator()) {
    if (item.owner !== me) actions.push(h('button', { type: 'button', class: 'primary', onclick: () => run(() => api('POST', `/v1/leads/${item.id}/assign`, {}), 'Lead assumido.') }, 'Assumir'));
    if (isFounder()) {
      const to = peopleSelect(person => person.groups.some(group => ['curators', 'founders'].includes(group)), item.owner, 'Atribuir a…');
      to.addEventListener('change', () => to.value && run(() => api('POST', `/v1/leads/${item.id}/assign`, { to: to.value }), `Lead atribuído a ${nameOf(to.value)}.`));
      actions.push(to);
    }
    actions.push(h('button', { type: 'button', class: 'secondary', onclick: () => run(() => api('POST', `/v1/leads/${item.id}/contacted`), 'Marcado como contactado.') }, 'Marcar contactado'));
    // Resumo do lead aqui mesmo; a ficha completa continua em Seguimento.
    const summary = h('div', { class: 'muted' }, 'A carregar o lead…');
    extra.push(summary);
    api('GET', `/v1/leads/${item.id}`).then(lead => summary.replaceChildren(
      h('dl', { class: 'facts' },
        h('dt', {}, 'Viagem'), h('dd', {}, [lead.journey.destination, lead.journey.timeframe, lead.journey.party, lead.journey.budget].filter(Boolean).join(' · ') || '—'),
        h('dt', {}, 'Estado'), h('dd', {}, statusPill(lead.status)),
        h('dt', {}, 'Última atividade'), h('dd', {}, when(lead.lastActivityAt))),
      h('ul', { class: 'feed' }, (lead.messages ?? []).slice(-3).map(message => h('li', {}, h('strong', {}, message.actor === 'customer' ? 'Cliente' : 'BLU'), ` ${(message.text ?? '').slice(0, 220)}`, h('time', {}, when(message.at))))),
      lead.synthetic ? null : proposalComposer(lead),
    )).catch(error => summary.replaceChildren(error.message));
  }
  if (item.kind === 'task' && can('tasks')) {
    const path = `/v1/leads/${encodeURIComponent(item.partition)}/tasks/${encodeURIComponent(item.id)}`;
    for (const [key, label] of [['doing', 'Em curso'], ['done', 'Feito']]) {
      if (item.task?.status !== key) actions.push(h('button', { type: 'button', class: key === 'done' ? 'primary' : 'secondary', onclick: () => run(() => api('POST', path, { status: key }), `Tarefa: ${label}.`) }, label));
    }
    if (item.task?.status !== 'blocked') {
      const types = ['partner', 'client', 'proposal', 'schedule', 'whatsapp', 'internal', 'other'];
      const type = h('select', { 'aria-label': 'Tipo de bloqueio' }, types.map(key => h('option', { value: key }, data.blockers?.[key] ?? key)));
      const reason = h('input', { placeholder: 'Motivo do bloqueio', 'aria-label': 'Motivo do bloqueio' });
      extra.push(h('div', { class: 'actions' }, type, reason, h('button', { type: 'button', class: 'secondary', onclick: () => run(() => api('POST', path, { status: 'blocked', blockerType: type.value, blockedReason: reason.value }), 'Tarefa bloqueada.') }, 'Bloquear')));
    }
    const owner = peopleSelect(() => true, item.owner, 'Passar a…');
    owner.addEventListener('change', () => owner.value && run(() => api('POST', path, { owner: owner.value }), `Tarefa passada a ${nameOf(owner.value)}.`));
    actions.push(owner);
  }
  if (item.kind === 'case' && can('cases')) {
    const owner = peopleSelect(() => true, item.owner, 'Responsável do caso…');
    owner.addEventListener('change', () => owner.value && run(() => api('POST', `/v1/leads/${encodeURIComponent(item.partition)}/cases/${encodeURIComponent(item.id)}`, { owner: owner.value }), `Caso passado a ${nameOf(owner.value)}.`));
    actions.push(owner, h('button', { type: 'button', class: 'link', onclick: () => show('cases') }, 'Abrir em Reclamações'));
  }
  if (item.kind === 'message') {
    if (item.message?.suggestion) extra.push(h('p', { class: 'message' }, `Resposta sugerida: ${item.message.suggestion}`));
    actions.push(h('button', { type: 'button', class: 'secondary', onclick: () => { whatsappState.selected = item.id; show('whatsapp'); } }, 'Responder no WhatsApp'));
  }
  if (item.kind === 'reminder' && item.reminder?.text) {
    extra.push(h('p', { class: 'message' }, item.reminder.text));
    actions.push(h('button', { type: 'button', class: 'secondary', onclick: () => navigator.clipboard?.writeText(item.reminder.text).then(() => { status.textContent = 'Mensagem copiada: envie-a à mão.'; }) }, 'Copiar mensagem'));
  }
  const activityId = item.service?.activityId || item.reminder?.activityId;
  if (activityId && leadId && isCurator()) {
    const editor = h('div', { hidden: true });
    actions.push(h('button', { type: 'button', class: 'secondary', onclick: () => { editor.hidden = !editor.hidden; if (!editor.hidden && !editor.childElementCount) editor.append(activityEditor(leadId, activityId, { compact: true, onSaved: refresh })); } }, 'Reagendar'));
    extra.push(editor);
  }
  // Pedir desbloqueio: uma tarefa para quem pode resolver, ligada ao lead, que aparece em «O meu trabalho».
  if (item.resolver && item.resolver.email !== me && can('tasks')) {
    // Avisa as duas partes: a tarefa vai para quem desbloqueia; numa tarefa parada, o responsável recebe a nota.
    actions.push(h('button', { type: 'button', class: 'primary', onclick: () => run(async () => {
      await api('POST', '/v1/tasks', {
        title: `Desbloquear: ${item.title}`.slice(0, 140), owner: item.resolver.email, due: data.today, ...(leadId ? { leadId } : {}),
        note: `${data.blockers?.[item.blocker] ?? data.kinds[item.kind] ?? item.kind}: ${item.reason}${item.ownerName ? ` Responsável: ${item.ownerName}.` : ''} Pedido em Operações.`,
      });
      if (item.kind === 'task' && item.owner && item.owner !== item.resolver.email) {
        await api('POST', `/v1/leads/${encodeURIComponent(item.partition)}/tasks/${encodeURIComponent(item.id)}`, { note: `Pedido de desbloqueio enviado a ${item.resolver.name}.` });
      }
    }, `Pedido enviado a ${item.resolver.name}${item.kind === 'task' && item.ownerName && item.owner !== item.resolver.email ? ` e ${item.ownerName} avisado(a)` : ''}. Acompanhe em «Pedidos de desbloqueio».`) }, `Pedir desbloqueio a ${item.resolver.name}`));
  }
  if (leadId && item.kind !== 'lead') actions.push(h('button', { type: 'button', class: 'link', onclick: () => goTo('leads', { filter: 'all', lead: leadId }) }, 'Ficha do lead'));

  panel.replaceChildren(...[
    h('div', {}, pill(data.kinds[item.kind] ?? item.kind), ' ', item.states.map(key => pill(data.states[key], OPS_TONE[key])), item.demo ? [' ', pill('demo')] : null),
    h('h3', {}, item.title),
    item.detail ? h('p', { class: 'muted' }, item.detail) : null,
    h('button', { type: 'button', class: 'link', onclick: () => askAssistant(`Como desbloqueio «${item.title}»${leadId ? ` (${leadId})` : ''}? Está parado porque: ${item.reason}. Responsável: ${item.ownerName || 'ninguém'}. Pode desbloquear: ${item.resolver?.name ?? 'ninguém ativo'}. Diz o próximo passo e, se for para o cliente, um rascunho.`, can('team-admin') ? 'team' : 'mine') }, 'Perguntar ao assistente sobre este item'),
    h('dl', { class: 'facts' },
      h('dt', {}, 'Porque está parado'), h('dd', {}, item.reason),
      h('dt', {}, 'Responsável'), h('dd', {}, item.ownerName || pill('Sem responsável', 'warn')),
      h('dt', {}, 'À espera'), h('dd', {}, item.since ? `há ${lateBy(item.since)} (desde ${when(item.since)})` : '—'),
      item.due ? [h('dt', {}, 'Prazo'), h('dd', {}, /T/.test(item.due) ? when(item.due) : item.due)] : null,
      item.partnerName ? [h('dt', {}, 'Parceiro'), h('dd', {}, item.partnerName)] : null,
      item.task?.createdByName ? [h('dt', {}, 'Pedida por'), h('dd', {}, item.task.createdByName)] : null,
      h('dt', {}, 'Quem pode desbloquear'), h('dd', {}, item.resolver ? [h('strong', {}, item.resolver.name), ` (${item.resolver.why})`] : 'Ninguém ativo com este papel.')),
    actions.length ? h('div', { class: 'actions' }, actions) : null,
    ...extra,
    status,
  // replaceChildren escreve «null» como texto: só os nós que existem.
  ].filter(Boolean));
}

// Painel dobrável: aberto é branco, dobrado fica sombreado com o título e a contagem à vista.
// O estado de cada painel fica neste navegador; sem armazenamento, vale o que o código pede.
const foldState = (() => { try { return JSON.parse(localStorage.getItem('blu-folds') || '{}'); } catch { return {}; } })();
function fold(key, title, body, { open = true, count = null, tone = '', id } = {}) {
  const box = h('details', { class: 'panel fold', id, open: foldState[key] ?? open },
    h('summary', {}, h('span', { class: 'fold-title' }, title), count === null || count === undefined ? null : pill(String(count), count ? tone : '')), ...[body].flat());
  box.addEventListener('toggle', () => { foldState[key] = box.open; try { localStorage.setItem('blu-folds', JSON.stringify(foldState)); } catch { /* sem armazenamento */ } });
  return box;
}
// O conteúdo só é pedido quando o painel abre (o pipeline técnico e a revisão de conversas).
function lazyFold(key, title, load, options = {}) {
  const body = h('div', {}, h('p', { class: 'muted' }, 'A carregar…'));
  const box = fold(key, title, body, { open: false, ...options });
  let loaded = false;
  const fill = () => {
    if (loaded || !box.open) return;
    loaded = true;
    load().then(nodes => body.replaceChildren(...[nodes].flat().filter(Boolean))).catch(error => body.replaceChildren(h('p', { class: 'error' }, error.message)));
  };
  box.addEventListener('toggle', fill);
  queueMicrotask(fill);
  return box;
}

// Árvore que se desdobra: cada nível agrega o de baixo com a contagem; o último nível são os
// itens, que abrem o detalhe. Os grupos mais cheios primeiro; `order` fixa a ordem de um nível.
function drillTree(items, levels, leaf, depth = 0) {
  if (!levels.length) return h('ul', { class: 'tree-leaves' }, items.map(item => h('li', {}, leaf(item))));
  const [name, groupOf, order] = levels[0];
  const groups = new Map();
  for (const item of items) {
    const key = groupOf(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  const rank = key => (order ? order.indexOf(key) : -1);
  const entries = [...groups].sort((a, b) => (order ? rank(a[0]) - rank(b[0]) : 0) || b[1].length - a[1].length);
  return h('ul', { class: 'tree', 'aria-label': name }, entries.map(([key, list]) => h('li', {},
    h('details', { class: 'tree-node', open: depth === 0 && entries.length === 1 },
      h('summary', {}, h('span', {}, key), h('span', { class: 'tree-count' }, list.length)),
      drillTree(list, levels.slice(1), leaf, depth + 1)))));
}
const treeLeaf = (label, onclick, sub = '') => h('button', { type: 'button', class: 'tree-leaf', onclick }, h('span', {}, label), sub ? h('span', { class: 'muted' }, sub) : null);

// Inteligência com dados de demonstração (por defeito): os números batem com o que se vê em
// Seguimento; cada item de demonstração leva a etiqueta «demo». Fica guardado neste navegador.
const intelDemo = { on: (() => { try { return localStorage.getItem('blu-intel-demo') !== '0'; } catch { return true; } })() };
const demoQuery = () => `demo=${intelDemo.on ? 1 : 0}`;
const demoToggle = rerender => h('button', { type: 'button', class: 'secondary', 'aria-pressed': String(intelDemo.on), onclick: () => {
  intelDemo.on = !intelDemo.on;
  try { localStorage.setItem('blu-intel-demo', intelDemo.on ? '1' : '0'); } catch { /* sem armazenamento */ }
  rerender();
} }, intelDemo.on ? 'Demonstração incluída' : 'Só dados reais');

// Proposta por WhatsApp com o toque da BLU: o curador revê e edita antes de enviar; vai pela caixa
// de WhatsApp (em modo de teste nada sai para o cliente). Em inglês, como as outras mensagens ao viajante.
function proposalMessage({ name, destination, party, dates, link, curator }) {
  const trip = [destination || 'your journey', party ? `for ${party}` : '', dates || ''].filter(Boolean).join(', ');
  return [
    name ? `Dear ${name},` : 'Hello,',
    '',
    `Your journey has taken shape. We've curated ${trip}: paced for you, with the places we would choose for ourselves.`,
    '',
    `Your proposal: ${link || '[link da proposta]'}`,
    '',
    'Take your time with it. If anything should feel different (a slower morning, a table by the sea, one more day in the north), just reply here and we\'ll reshape it.',
    '',
    'With care,',
    `${curator} · BLU Costa`,
    'Travel is not accumulation. It is interpretation.',
  ].join('\n');
}

// Link da proposta dentro da mensagem: cola-se o link de partilha do portal (Histórico › Partilhar) e
// entra no texto com a assinatura. Só aceita links de partilha https do próprio portal.
function proposalLinkField(getText, leadId = '') {
  const link = h('input', { type: 'url', placeholder: 'Link da proposta (portal)', 'aria-label': 'Link da proposta' });
  const note = h('span', { class: 'muted', role: 'status' });
  const insert = h('button', { type: 'button', class: 'secondary', onclick: () => {
    const value = link.value.trim();
    if (!proposalShareUrl(value, portalUrl())) { note.textContent = 'Use o link de partilha do portal (Histórico › Partilhar).'; return; }
    const text = getText();
    try { text.value = proposalPayload(text.value, value); } catch (error) { note.textContent = error.message; return; }
    link.value = '';
    note.textContent = 'Link inserido na mensagem.';
  } }, 'Inserir link');
  // Biblioteca: até duas propostas genéricas aprovadas que servem o lead. O link abre o PDF para
  // rever (temporário, dura horas); para o cliente use o link de partilha do portal.
  const library = h('div', { class: 'muted' });
  if (leadId) api('GET', `/v1/leads/${encodeURIComponent(leadId)}/library`).then(({ matches }) => {
    if (!matches.length) return;
    library.append('Da biblioteca (rever antes de enviar): ', ...matches.flatMap(match => [
      match.url ? h('a', { href: match.url, target: '_blank', rel: 'noopener' }, `${match.title} ↗`) : match.title,
      ` (${match.score}% · ${match.reasons.join(' · ')}) `]));
  }).catch(() => {});
  return h('div', {}, h('div', { class: 'actions' }, link, insert, h('a', { href: 'https://d3804amye1jw31.cloudfront.net/exports', target: '_blank', rel: 'noopener' }, 'Histórico do portal ↗'), note), library);
}

function proposalComposer(lead, preset = null) {
  const curator = (session.claims?.name || session.claims?.email || 'BLU').split(/[\s@(]/)[0];
  const phone = String(lead.phones?.[0] ?? '').replace(/\D/g, '').replace(/^00/, '');
  const link = h('input', { type: 'url', placeholder: 'Link da proposta (portal)', 'aria-label': 'Link da proposta', value: preset?.link ?? '' });
  const name = h('input', { type: 'text', maxlength: '60', placeholder: 'Nome do cliente (opcional)', 'aria-label': 'Nome do cliente' });
  const text = h('textarea', { rows: '12', maxlength: '1000', 'aria-label': 'Mensagem' });
  const status = h('p', { class: 'muted', role: 'status' });
  let edited = false;
  let insertedLink = preset?.link ?? '';
  const insertLink = () => {
    const value = proposalShareUrl(link.value.trim(), portalUrl());
    if (!value) { status.textContent = 'Crie uma ligação de partilha no portal ou cole uma ligação válida da proposta.'; return false; }
    text.value = embedProposalLink(text.value, value, insertedLink);
    insertedLink = value;
    status.textContent = 'Link clicável inserido na mensagem. Reveja antes de enviar.';
    return true;
  };
  const fill = () => {
    if (edited) return;
    text.value = proposalMessage({ name: name.value.trim(), destination: lead.journey.destination, party: lead.journey.party, dates: lead.journey.timeframe, link: link.value.trim(), curator })
      + (preset ? `

Proposta v${String(preset.version).padStart(3, '0')} · BLU Costa Travel · Curation Studio` : '');
  };
  text.addEventListener('input', () => { edited = true; });
  link.addEventListener('input', () => { if (!edited) fill(); });
  link.addEventListener('change', insertLink);
  name.addEventListener('input', fill);
  fill();
  // Biblioteca de propostas genéricas: só para rever. O link dura horas e não segue para o cliente;
  // a mensagem só leva o link de partilha do portal.
  const libraryBox = h('div', { class: 'muted' });
  api('GET', `/v1/leads/${encodeURIComponent(lead.id)}/library`).then(({ matches }) => {
    const usable = matches.filter(match => match.url);
    if (usable.length) libraryBox.append('Da biblioteca (só para rever, não vai ao cliente): ', ...usable.flatMap(match => [
      h('a', { href: match.url, target: '_blank', rel: 'noopener' }, `${match.title} ↗`), ` (${match.score}%) `]));
  }).catch(() => {});
  // Os dois serviços que melhor servem a viagem, com o motivo; a pessoa escolhe quais entram na mensagem.
  let picks = [];
  const recommendations = h('div', { class: 'reco' });
  api('GET', `/v1/partners?lead=${encodeURIComponent(lead.id)}`).then(({ items, basis, outcomes }) => {
    if (!items.length) return;
    picks = items.map(item => ({ item, box: h('input', { type: 'checkbox', checked: true, 'aria-label': `Incluir ${item.name}` }) }));
    recommendations.append(h('h4', {}, 'Sugestões para este cliente'),
      ...picks.map(({ item, box }) => h('label', { class: 'reco-item' }, box, ' ', h('strong', {}, item.name), ' ', pill(`${item.score}%`, 'ok'), h('div', { class: 'muted' }, item.reasons.join(' · ')))),
      h('p', { class: 'muted' }, basis === 'learned' ? `Ordem aprendida com ${outcomes} propostas enviadas.` : 'Ordem por regras (zona, lugares e qualidade medida). Passa a aprender depois de 10 propostas com resultado.'));
  }).catch(() => {});
  const send = h('button', { type: 'submit', class: 'primary' }, 'Enviar pelo WhatsApp');
  const form = h('form', { class: 'proposal', onsubmit: async event => {
    event.preventDefault();
    if (!insertLink()) { link.focus(); return; }
    send.disabled = true;
    status.textContent = 'A enviar…';
    const chosen = picks.filter(({ box }) => box.checked).map(({ item }) => item);
    const extra = chosen.length && !text.value.includes(chosen[0].name) ? `

Sugerimos também: ${chosen.map(item => `${item.name} (${item.area})`).join(' · ')}` : '';
    try {
      await api('POST', '/v1/whatsapp-test', { direction: 'out', leadId: lead.id, ...(phone.length >= 9 ? { to: phone } : {}), text: proposalPayload(text.value, insertedLink, extra), recommended: chosen.map(item => item.partnerId) });
      whatsappState.selected = phone.length >= 9 ? phone : `lead:${lead.id}`;
      status.replaceChildren('Proposta enviada para a caixa de WhatsApp. ', h('button', { type: 'button', class: 'link', onclick: () => show('whatsapp') }, 'Abrir a conversa'));
    } catch (error) {
      status.textContent = error.message;
      send.disabled = false;
    }
  } },
    h('div', { class: 'form-grid' }, link, name),
    h('div', { class: 'actions' },
      h('a', { href: portalUrl(`/exports?lead=${encodeURIComponent(lead.id)}`), target: '_blank', rel: 'noopener' }, 'Escolher proposta no portal ↗'),
      h('button', { type: 'button', class: 'secondary', onclick: insertLink }, 'Inserir link na mensagem')),
    h('p', { class: 'muted' }, 'No portal: escolha a versão, confirme a partilha e use WhatsApp. A mensagem regressa com o link para este lead.'),
    libraryBox, recommendations,
    h('label', {}, 'Mensagem (pode editar)', text),
    h('p', { class: 'muted' }, phone.length >= 9 ? `Para +${phone}, o número que o cliente deixou no chat.` : 'Sem telefone no chat: a conversa fica com a referência do lead.'),
    h('div', { class: 'actions' }, send), status);
  return h('details', { class: 'panel fold proposal-fold', ...(preset ? { open: true } : {}) }, h('summary', {}, h('span', { class: 'fold-title' }, preset ? `Proposta v${String(preset.version).padStart(3, '0')} do portal, pronta a rever` : 'Enviar proposta por WhatsApp')), form);
}

// Novo parceiro: a lista vem de config/partners.json (com licença verificada), por isso o pedido é
// uma tarefa para quem trata dos parceiros, com os dados já preenchidos.
function partnerRequestForm(staff, kinds) {
  const status = h('p', { class: 'muted', role: 'status' });
  const name = h('input', { type: 'text', maxlength: '80', required: true, placeholder: 'Nome do parceiro', 'aria-label': 'Nome do parceiro' });
  const kind = h('input', { type: 'text', list: 'partner-kinds', maxlength: '40', placeholder: 'Tipo (tuk-tuk, transfer, guia…)', 'aria-label': 'Tipo' });
  const contact = h('input', { type: 'text', maxlength: '120', placeholder: 'WhatsApp ou email (opcional)', 'aria-label': 'Contacto' });
  const license = h('input', { type: 'text', maxlength: '80', placeholder: 'Licença: RNAAT, TVDE ou alvará (nº)', 'aria-label': 'Licença' });
  const people = staff.filter(member => member.enabled);
  const owner = h('select', { 'aria-label': 'Quem regista' }, people.map(member => h('option', { value: member.email.toLowerCase(), selected: member.groups?.includes('scm') }, member.name)));
  const due = h('input', { type: 'date', 'aria-label': 'Prazo' });
  return h('form', { onsubmit: async event => {
    event.preventDefault();
    try {
      await api('POST', '/v1/tasks', {
        title: `Registar parceiro: ${name.value.trim()}`.slice(0, 140), owner: owner.value || undefined, due: due.value || undefined,
        note: [`Tipo: ${kind.value || '—'}`, `Contacto: ${contact.value || '—'}`, `Licença: ${license.value || 'por obter'}`, 'Parceiros reais precisam de licença; acrescentar a config/partners.json e rever antes de agendar.'].join(' · '),
      });
      teamCache = undefined;
      status.textContent = `Pedido criado: aparece em «O meu trabalho» de ${owner.selectedOptions[0]?.text ?? 'quem regista'}.`;
      name.value = kind.value = contact.value = license.value = '';
    } catch (error) {
      status.textContent = error.message;
    }
  } },
  h('datalist', { id: 'partner-kinds' }, kinds.map(item => h('option', { value: item }))),
  h('div', { class: 'form-grid' }, name, kind, contact, license, owner, due),
  h('div', { class: 'actions' }, h('button', { type: 'submit', class: 'primary' }, 'Criar pedido')), status);
}

// Apoio do assistente: abre o painel com uma pergunta já feita sobre o que está no ecrã.
let askAssistant = () => {};

// Atrasos críticos: o que está parado há demasiado tempo e tem de sair à força (atribuir, pedir
// desbloqueio, fechar). Os mesmos itens e ações de Operações, a partir de um limite de dias.
const overdueState = { days: 7, selected: '' };
const AGE_BUCKETS = ['Mais de 30 dias', '14 a 30 dias', '7 a 14 dias', '3 a 7 dias'];

const views = {
  async overdue(view, state = overdueState) {
    const data = await api('GET', `/v1/agenda?view=ops&scope=team&${demoQuery()}`);
    const rerender = () => { view.replaceChildren(); views.overdue(view, state).catch(error => view.append(h('p', { class: 'error' }, error.message))); };
    const me = session.claims?.email?.toLowerCase() ?? '';
    const nameOf = email => data.people.find(person => person.email === email)?.name ?? email;
    const days = item => (item.since ? (Date.now() - Date.parse(item.since)) / DAY_MS : 0);
    const late = data.items.filter(item => item.blocker && days(item) >= state.days).sort((a, b) => days(b) - days(a));
    const bucket = item => (days(item) >= 30 ? AGE_BUCKETS[0] : days(item) >= 14 ? AGE_BUCKETS[1] : days(item) >= 7 ? AGE_BUCKETS[2] : AGE_BUCKETS[3]);
    const detail = h('div', { class: 'panel ops-detail' });
    const select = item => {
      state.selected = item.key;
      for (const row of view.querySelectorAll('li.ops-item')) row.classList.toggle('selected', row.dataset.key === item.key);
      showOpsItem(detail, item, data, { me, nameOf, refresh: rerender });
    };
    const limit = value => h('button', { type: 'button', class: 'secondary', 'aria-pressed': String(state.days === value), onclick: () => { Object.assign(state, { days: value, selected: '' }); rerender(); } }, `${value}+ dias`);
    const oldest = late[0] ? Math.floor(days(late[0])) : 0;
    view.append(...[
      h('div', { class: 'heading-row' }, h('h2', {}, 'Atrasos críticos'), h('div', { class: 'filters' }, limit(3), limit(7), limit(14), demoToggle(rerender))),
      h('div', { class: 'cards' },
        h('div', { class: `card ${late.length ? 'bad' : ''}` }, h('div', { class: 'value' }, late.length), h('div', { class: 'label' }, `Parados há ${state.days}+ dias`)),
        h('div', { class: `card ${oldest >= 14 ? 'bad' : ''}` }, h('div', { class: 'value' }, late.length ? `${oldest} d` : '—'), h('div', { class: 'label' }, 'O mais antigo')),
        h('div', { class: `card ${late.some(item => !item.owner) ? 'warn' : ''}` }, h('div', { class: 'value' }, late.filter(item => !item.owner).length), h('div', { class: 'label' }, 'Sem responsável'))),
      late.length ? fold('overdue-tree', 'Por idade e tipo', drillTree(late, [
        ['Idade', bucket, AGE_BUCKETS],
        ['Tipo', item => data.kinds[item.kind] ?? item.kind],
      ], item => treeLeaf(item.title, () => select(item), `${Math.floor(days(item))} d · ${data.blockers[item.blocker] ?? item.blocker}`)), { count: late.length }) : null,
      h('div', { class: 'split spaced' },
        h('div', { class: 'panel' }, h('h3', {}, `A forçar · ${late.length}`),
          late.length ? h('ul', { class: 'work-list' }, late.map(item => h('li', { class: `work-item ops-item clickable overdue${item.key === state.selected ? ' selected' : ''}`, 'data-key': item.key, tabindex: '0', onclick: () => select(item), onkeydown: event => event.key === 'Enter' && select(item) },
            h('div', {}, pill(`${Math.floor(days(item))} d`, 'bad'), ' ', pill(data.kinds[item.kind] ?? item.kind), item.demo ? [' ', pill('demo')] : null),
            h('strong', {}, item.title),
            h('div', { class: 'muted' }, [item.reason, item.ownerName ? `de ${item.ownerName}` : 'sem responsável', item.resolver ? `desbloqueia: ${item.resolver.name}` : ''].filter(Boolean).join(' · ')))))
            : h('p', { class: 'muted' }, `Nada parado há ${state.days} dias ou mais.`)),
        detail),
    ].filter(Boolean));
    const chosen = late.find(item => item.key === state.selected) ?? late[0];
    if (chosen) select(chosen); else detail.append(h('p', { class: 'muted' }, 'Nada a forçar.'));
  },

  async work(view, state = workState) {
    const [{ items, statuses }, { tasks }, { feed }, members] = await Promise.all([
      api('GET', '/v1/work'), api('GET', `/v1/tasks?status=${state.board}`),
      api('GET', '/v1/feed').catch(() => ({ feed: [] })), loadTeam().catch(() => []),
    ]);
    const rerender = () => { view.replaceChildren(); views.work(view, state).catch(error => view.append(h('p', { class: 'error' }, error.message))); };
    const status = h('p', { class: 'muted', role: 'status' }, state.flash);
    state.flash = '';
    const nameOf = email => members.find(member => member.email.toLowerCase() === email)?.name ?? email;
    const save = async (task, body, done) => {
      try {
        await api('POST', `/v1/leads/${encodeURIComponent(task.partition)}/tasks/${task.id}`, body);
        state.flash = done;
        teamCache = undefined;
        rerender();
      } catch (error) {
        status.textContent = error.message;
      }
    };

    // Ações da tarefa: passo seguinte num toque, bloquear com motivo, detalhe com histórico.
    const taskBlock = task => {
      const [next, label] = NEXT_STEP[task.status] ?? NEXT_STEP.todo;
      const reason = h('input', { type: 'text', maxlength: '280', placeholder: 'O que está a bloquear? Ex.: à espera do parceiro', 'aria-label': 'Motivo do bloqueio' });
      const blockForm = h('form', { class: 'actions', hidden: true, onsubmit: event => { event.preventDefault(); save(task, { status: 'blocked', blockedReason: reason.value }, `«${task.title}» bloqueada.`); } },
        reason, h('button', { type: 'submit', class: 'primary' }, 'Bloquear'));
      const history = h('div', {}, h('p', { class: 'muted' }, 'A carregar…'));
      const owner = h('select', { 'aria-label': 'Responsável' }, members.map(member => h('option', { value: member.email.toLowerCase(), selected: member.email.toLowerCase() === task.owner }, member.name)));
      const due = h('input', { type: 'date', value: task.due, 'aria-label': 'Prazo' });
      const note = h('input', { type: 'text', maxlength: '1000', placeholder: 'Nota para o histórico (opcional)', 'aria-label': 'Nota' });
      const edit = h('form', { onsubmit: event => {
        event.preventDefault();
        const body = {};
        if (owner.value && owner.value !== task.owner) body.owner = owner.value;
        if (due.value !== task.due) body.due = due.value;
        if (note.value.trim()) body.note = note.value;
        save(task, body, 'Tarefa atualizada.');
      } }, h('div', { class: 'form-grid' }, h('label', { class: 'field' }, h('span', {}, 'Responsável'), owner), h('label', { class: 'field' }, h('span', {}, 'Prazo'), due)), note,
      h('div', { class: 'actions' }, h('button', { type: 'submit', class: 'secondary', disabled: !can('tasks') }, 'Guardar')));
      const details = h('details', { ontoggle: async event => {
        if (!event.target.open || history.dataset.loaded) return;
        history.dataset.loaded = '1';
        try {
          const full = await api('GET', `/v1/leads/${encodeURIComponent(task.partition)}/tasks/${task.id}`);
          history.replaceChildren(h('ul', { class: 'reminders' }, full.log.map(entry => h('li', {}, h('div', {}, entry.text), h('div', { class: 'muted' }, `${nameOf(entry.by)} · ${when(entry.at)}`)))));
        } catch (error) {
          history.replaceChildren(h('p', { class: 'error' }, error.message));
        }
      } }, h('summary', { class: 'muted' }, 'Detalhe e histórico'), task.note ? h('p', { class: 'message' }, task.note) : null, can('tasks') ? edit : null, history);
      return [
        h('div', { class: 'muted' }, [nameOf(task.owner), task.due ? `prazo ${task.due}` : 'sem prazo', task.leadLabel || task.leadId, task.caseTitle ? `caso: ${task.caseTitle}` : ''].filter(Boolean).join(' · ')),
        task.status === 'blocked' ? h('div', { class: 'error' }, `Bloqueada: ${task.blockedReason}`) : null,
        can('tasks') ? h('div', { class: 'actions task-actions' },
          h('button', { type: 'button', class: 'primary', onclick: () => save(task, { status: next }, `«${task.title}»: ${statuses[next]}.`) }, label),
          task.status === 'doing' || task.status === 'todo' ? h('button', { type: 'button', class: 'secondary', onclick: () => { blockForm.hidden = false; reason.focus(); } }, 'Bloquear') : null,
          task.status === 'todo' ? h('button', { type: 'button', class: 'secondary', onclick: () => save(task, { status: 'done' }, `«${task.title}»: Feito.`) }, 'Feito') : null) : null,
        blockForm,
        details,
      ];
    };
    const urgencyPill = urgency => (URGENCY[urgency] ? pill(...URGENCY[urgency]) : null);
    // Ligação direta: abre o lead, a conversa ou a agenda já no ponto certo.
    const open = item => {
      if (item.kind === 'lead') { leadsState.filter = 'open'; leadsState.selected = item.id; show('leads'); }
      if (item.kind === 'case') show('cases');
      if (item.kind === 'reminder') show('agenda');
      if (item.kind === 'message') { whatsappState.selected = item.message.key; show('whatsapp'); }
      // Alerta: abre o separador indicado (no lead, se houver).
      if (item.kind === 'alert') {
        if (item.detail === 'leads' && item.partition) { leadsState.filter = 'all'; leadsState.selected = item.partition; }
        show(item.detail);
      }
    };
    // Mensagem à espera: a resposta sugerida já escrita; envia-se num toque ou ajusta-se antes.
    const messageBlock = item => {
      const text = h('textarea', { rows: '2', maxlength: '1000', 'aria-label': 'Resposta' }, item.message.suggestion);
      const note = h('span', { class: 'muted', role: 'status' });
      const send = async () => {
        note.textContent = 'A enviar…';
        try {
          await api('POST', '/v1/whatsapp-test', { direction: 'out', to: item.message.to || undefined, partnerId: item.message.partnerId || undefined, leadId: item.message.leadId, text: text.value });
          state.flash = `Resposta enviada a ${item.title}.`;
          rerender();
        } catch (error) {
          note.textContent = error.message;
        }
      };
      return [
        h('p', { class: 'message' }, `«${item.message.text}»`),
        h('div', { class: 'muted' }, `${AUDIENCE[item.message.audience] ?? ''} · ${when(item.message.at)} · ${item.detail}`),
        isCurator() ? [text, h('div', { class: 'actions task-actions' },
          h('button', { type: 'button', class: 'primary', onclick: send }, 'Enviar resposta'),
          h('button', { type: 'button', class: 'secondary', onclick: () => open(item) }, 'Abrir conversa'), note)] : null,
      ];
    };
    const workItem = item => h('li', { class: `work-item ${item.urgency}` },
      h('div', {}, pill(WORK_KIND[item.kind] ?? item.kind), ' ', urgencyPill(item.urgency), item.task ? [' ', pill(statuses[item.task.status] ?? item.task.status, TASK_TONE[item.task.status])] : null),
      h('strong', {}, item.title),
      ...(item.task ? taskBlock(item.task) : item.message ? messageBlock(item) : [
        h('div', { class: 'muted' }, [item.detail, item.due ? `até ${item.due}` : ''].filter(Boolean).join(' · ')),
        h('div', { class: 'actions task-actions' }, h('button', { type: 'button', class: 'secondary', onclick: () => open(item) }, 'Abrir')),
      ]));

    // Nova tarefa: para mim ou para um colega, ligada a um lead se fizer sentido.
    const title = h('input', { type: 'text', maxlength: '140', placeholder: 'Ex.: Confirmar tuk-tuk para Algarve e Açores', 'aria-label': 'Tarefa', value: taskPrefill.title ?? '' });
    const owner = h('select', { 'aria-label': 'Responsável' }, members.map(member => h('option', { value: member.email.toLowerCase(), selected: member.email.toLowerCase() === session.claims?.email?.toLowerCase() }, member.name)));
    const due = h('input', { type: 'date', 'aria-label': 'Prazo' });
    const leadId = h('input', { type: 'text', maxlength: '80', placeholder: 'BLU-… (opcional)', 'aria-label': 'Lead', value: taskPrefill.leadId ?? '' });
    const note = h('input', { type: 'text', maxlength: '1000', placeholder: 'Nota (opcional)', 'aria-label': 'Nota' });
    const prefilled = Boolean(taskPrefill.leadId || taskPrefill.title);
    taskPrefill = {};
    const create = h('form', { onsubmit: async event => {
      event.preventDefault();
      try {
        await api('POST', '/v1/tasks', { title: title.value, owner: owner.value || undefined, due: due.value || undefined, leadId: leadId.value.trim() || undefined, note: note.value });
        state.flash = `Tarefa criada: «${title.value.trim()}».`;
        teamCache = undefined;
        rerender();
      } catch (error) {
        status.textContent = error.message;
      }
    } },
    h('div', { class: 'form-grid' }, h('label', { class: 'field' }, h('span', {}, 'O que há a fazer'), title), h('label', { class: 'field' }, h('span', {}, 'Para'), owner), h('label', { class: 'field' }, h('span', {}, 'Prazo'), due), h('label', { class: 'field' }, h('span', {}, 'Lead'), leadId)),
    note, h('div', { class: 'actions' }, h('button', { type: 'submit', class: 'primary' }, 'Criar tarefa')));

    const mine = items.filter(item => item.kind === 'task');
    const myEmail = session.claims?.email?.toLowerCase() ?? '';
    const teamTasks = state.board === 'open' ? tasks.filter(task => task.owner !== myEmail) : tasks;
    const boardButton = (key, label) => h('button', { type: 'button', class: 'secondary', 'aria-pressed': String(state.board === key), onclick: () => { state.board = key; rerender(); } }, label);
    const card = (value, label) => h('div', { class: 'card' }, h('div', { class: 'value' }, value), h('div', { class: 'label' }, label));
    view.append(
      h('h2', {}, 'O meu trabalho'),
      h('div', { class: 'cards' },
        card(items.length, 'Na minha lista'), card(items.filter(item => ['risk', 'overdue'].includes(item.urgency)).length, 'Urgentes ou em atraso'),
        card(mine.filter(item => item.task.status === 'blocked').length, 'Tarefas bloqueadas'), card(items.filter(item => item.kind === 'lead' && !item.unassigned).length, 'Leads que assumi')),
      status,
      h('div', { class: 'filters' },
        can('tasks') ? h('button', { type: 'button', class: 'primary', onclick: () => { const box = view.querySelector('details.new-task'); if (box) { box.open = true; box.scrollIntoView({ behavior: 'smooth', block: 'center' }); } } }, 'Nova tarefa') : null,
        h('button', { type: 'button', class: 'secondary', onclick: () => show('leads') }, 'Seguimento'),
        h('button', { type: 'button', class: 'secondary', onclick: () => show('whatsapp') }, 'WhatsApp'),
        can('read') ? h('button', { type: 'button', class: 'secondary', onclick: () => show('operations') }, 'Operações') : null),
      can('tasks') ? h('details', { class: 'panel new-task', open: prefilled }, h('summary', {}, 'Nova tarefa'), create) : h('p', { class: 'muted' }, 'Pode ver as tarefas e o feed; só curadores, governança e fundadores as alteram.'),
      h('div', { class: 'split spaced' },
        h('div', {},
          h('div', { class: 'panel' }, h('h3', {}, 'A minha lista'), items.length
            ? h('ul', { class: 'work-list' }, items.map(workItem))
            : h('p', { class: 'muted' }, 'Nada pendente. Assuma um lead em Seguimento ou crie uma tarefa.')),
          fold('work-team', 'Tarefas da equipa', [h('div', { class: 'filters' }, boardButton('open', 'Em aberto'), boardButton('done', 'Feitas (arquivo)')),
            teamTasks.length
              ? h('ul', { class: 'work-list' }, teamTasks.map(task => h('li', { class: `work-item ${task.urgency ?? ''}` },
                h('div', {}, pill(statuses[task.status] ?? task.status, TASK_TONE[task.status]), ' ', urgencyPill(task.urgency)),
                h('strong', {}, task.title), ...taskBlock(task))))
              : h('p', { class: 'muted' }, state.board === 'open' ? 'Sem outras tarefas em aberto na equipa.' : 'Sem tarefas feitas.')], { open: false, count: teamTasks.length })),
        fold('work-feed', 'O que se passa (7 dias)', [feed.length
            ? h('ul', { class: 'feed' }, feed.map(entry => h('li', {}, h('strong', {}, entry.byName || entry.by), ` ${entry.text}`, h('time', {}, when(entry.at)))))
            : h('p', { class: 'muted' }, 'Ainda sem movimento.')], { open: false, count: feed.length })),
    );
  },

  async dashboard(view) {
    const [m, { alerts }, { members }] = await Promise.all([api('GET', '/v1/metrics'), api('GET', '/v1/alerts').catch(() => ({ alerts: [] })), api('GET', '/v1/team').catch(() => ({ members: [] }))]);
    // Carga por pessoa: quem tem atrasos ou bloqueios precisa de ajuda primeiro.
    const load = members.filter(member => member.enabled).sort((a, b) => (b.overdueTasks + b.blockedTasks) - (a.overdueTasks + a.blockedTasks) || (b.openTasks + b.openLeads) - (a.openTasks + a.openLeads));
    const countCell = (n, tone) => h('td', {}, n ? pill(String(n), tone) : h('span', { class: 'muted' }, '0'));
    const card = (value, label) => h('div', { class: 'card' }, h('div', { class: 'value' }, value ?? '—'), h('div', { class: 'label' }, label));
    const breakdown = (title, counts, labels = {}) => {
      const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      const max = Math.max(1, ...entries.map(([, n]) => n));
      return h('div', { class: 'panel' }, h('h3', {}, title), entries.length ? h('table', {}, h('tbody', {}, entries.map(([key, n]) =>
        h('tr', {}, h('td', {}, (Array.isArray(labels[key]) ? labels[key][0] : labels[key]) ?? key), h('td', { style: { width: '45%' } }, h('div', { class: 'bar', style: { width: `${(n / max) * 100}%` } })), h('td', {}, n))))) : h('p', { class: 'muted' }, 'Sem dados.'));
    };
    view.append(
      h('h2', {}, 'Painel de seguimento'),
      h('div', { class: 'panel alerts' }, h('h3', {}, 'Alertas'), alerts.length
        ? h('ul', { class: 'reminders' }, alerts.map(alert => h('li', {},
          pill(alert.level === 'bad' ? 'Urgente' : 'Atenção', alert.level === 'bad' ? 'bad' : 'warn'), ' ', alert.text, ' ',
          tabVisible(alert.tab) ? h('button', { type: 'button', class: 'link', onclick: () => show(alert.tab) }, 'Abrir') : null)))
        : h('p', { class: 'muted' }, 'Tudo em ordem no pipeline.')),
      h('p', { class: 'muted' }, `Conversas com consentimento. ${m.synthetic} registo(s) de demonstração excluídos dos indicadores.`),
      h('div', { class: 'cards' },
        goCard(m.open, 'Leads em aberto', 'leads', { filter: 'open' }), goCard(m.replyLate ?? 0, `Sem resposta há mais de ${m.replyHours ?? '—'} h`, 'leads', { filter: 'open' }),
        goCard(m.overdue, 'Clientes em silêncio há 3 dias', 'leads', { filter: 'open' }), goCard(m.unassigned, 'Sem responsável', 'leads', { filter: 'open' }),
        goCard(m.contacted, 'Contactados', 'leads', { filter: 'contacted' }), card(m.medianHoursToContact === null ? '—' : `${m.medianHoursToContact} h`, 'Mediana até ao contacto')),
      load.length ? h('div', { class: 'panel' }, h('h3', {}, 'Carga da equipa'), h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, 'Pessoa'), h('th', {}, 'Tarefas'), h('th', {}, 'Em atraso'), h('th', {}, 'Bloqueadas'), h('th', {}, 'Leads'))),
        h('tbody', {}, load.map(member => h('tr', {}, h('td', {}, member.name), h('td', {}, member.openTasks ?? 0), countCell(member.overdueTasks ?? 0, 'bad'), countCell(member.blockedTasks ?? 0, 'warn'), h('td', {}, member.openLeads)))))) : null,
      h('div', { class: 'grid2 spaced' }, breakdown('Por estado', m.byStatus, STATUS), breakdown('Por etapa do percurso', m.byStage, STAGES), breakdown('Por origem', m.bySource)),
    );
  },

  // Vista operacional da equipa: todos os seguimentos, onde está a falhar e quem tem o quê.
  // O trabalho de cada pessoa fica em «O meu trabalho»; daqui só se abre a vista da equipa.
  async control(view) {
    const [c, metrics, partnerData] = await Promise.all([api('GET', `/v1/control?${demoQuery()}`), api('GET', `/v1/metrics?${demoQuery()}`).catch(() => null), loadPartners().catch(() => null)]);
    const rerender = () => { view.replaceChildren(); views.control(view).catch(error => view.append(h('p', { class: 'error' }, error.message))); };
    const w = c.work;
    const countCell = (n, tone) => h('td', {}, n ? pill(String(n), tone) : h('span', { class: 'muted' }, '0'));
    const roles = groups => groups.map(group => ROLE_LABEL[group] ?? group).join(', ');
    const DELIVERY = { email: 'Email', 'in-app': 'Só na intranet', 'email-failed': 'Email falhou' };
    const reminderIssues = c.reminders.prepared + c.reminders.failed + c.reminders.missed;
    // append escreve «null» como texto: só os painéis que existem.
    view.append(...[
      h('div', { class: 'heading-row' }, h('h2', {}, 'Visão geral da equipa'), h('div', { class: 'filters' }, h('span', { class: 'muted' }, [`Atualizado ${when(c.checkedAt)}`, c.demoLeads ? `inclui ${c.demoLeads} lead(s) de demonstração` : ''].filter(Boolean).join(' · ')), demoToggle(rerender))),
      // Trabalho da equipa com as regras de «O meu trabalho»: cada item conta uma vez, com ou sem responsável.
      w ? h('div', { class: 'cards' },
        h('div', { class: `card ${w.unowned ? 'warn' : ''}` }, h('div', { class: 'value' }, w.total), h('div', { class: 'label' }, 'Trabalho em aberto da equipa'), h('div', { class: 'muted' }, `${w.unowned} sem responsável`)),
        ...WORK_KINDS.map(([kind, label, tab, options]) => {
          const part = w.team[kind];
          return goCard(part.total, label, tab, options, part.unowned ? 'warn' : '');
        })) : null,
      // Negócio: o funil, o tempo de resposta e a qualidade dos parceiros; cada número abre a sua lista.
      metrics ? fold('control-business', 'Negócio', h('div', { class: 'cards' },
        goCard(metrics.total, 'Leads recebidos', 'leads', { filter: 'all' }),
        goCard(`${metrics.contacted} · ${metrics.total ? Math.round(metrics.contacted / metrics.total * 100) : 0}%`, 'Contactados', 'leads', { filter: 'contacted' }),
        goCard(metrics.medianHoursToContact === null || metrics.medianHoursToContact === undefined ? '—' : `${metrics.medianHoursToContact} h`, 'Tempo mediano até contacto', 'leads', { filter: 'contacted' }),
        goCard(partnerData?.nps?.nps === null || partnerData?.nps?.nps === undefined ? '—' : (partnerData.nps.nps > 0 ? `+${partnerData.nps.nps}` : String(partnerData.nps.nps)), `NPS (${partnerData?.nps?.responses ?? 0} resp.)`, 'partners', {}, partnerData?.nps?.nps < 0 ? 'bad' : ''),
        goCard((partnerData?.scorecards ?? []).reduce((sum, card) => sum + card.metrics.services, 0), 'Serviços realizados (90 d)', 'partners'),
        goCard(partnerData?.toCheck?.length ?? 0, 'Serviços a verificar', 'partners', {}, partnerData?.toCheck?.length ? 'warn' : '')), { open: true }) : null,
      fold('control-breaking', 'Pontos de falha', c.breaking.length
        ? h('ul', { class: 'reminders' }, c.breaking.map(item => h('li', {},
          pill(item.level === 'bad' ? 'Urgente' : 'Atenção', item.level === 'bad' ? 'bad' : 'warn'), ' ', item.text, ' ', goLink(item.tab))))
        : h('p', { class: 'muted' }, 'Nenhum ponto de falha.'), { open: c.breaking.length > 0, count: c.breaking.length, tone: 'bad' }),
      // Uma linha por pessoa ativa: a sua lista de «O meu trabalho», por tipo; no fim, o que não é de ninguém.
      w ? fold('control-people', 'Quem tem o quê', h('div', { class: 'table-scroll' }, h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, 'Pessoa'), h('th', {}, 'Papel'), ...WORK_KINDS.map(([, label]) => h('th', {}, label)), h('th', {}, 'Alertas'), h('th', {}, 'Urgentes'), h('th', {}, 'Total'))),
        h('tbody', {},
          w.people.map(person => h('tr', {},
            h('td', {}, person.name), h('td', {}, roles(person.groups)),
            ...WORK_KINDS.map(([kind]) => h('td', {}, person[kind])), h('td', {}, person.alert),
            countCell(person.urgent, 'bad'), h('td', {}, h('strong', {}, person.total)))),
          h('tr', {}, h('td', {}, h('strong', {}, 'Sem responsável')), h('td', {}, '—'),
            ...WORK_KINDS.map(([kind]) => countCell(w.team[kind].unowned, 'warn')), h('td', {}, '—'), h('td', {}, '—'), h('td', {}, h('strong', {}, w.unowned)))))),
      { count: w.people.length }) : null,
      fold('control-leads', 'Leads', h('div', { class: 'cards' },
        goCard(c.followUps.open, 'Leads em aberto', 'leads', { filter: 'open' }), goCard(c.followUps.onTime, 'Dentro do prazo', 'leads', { filter: 'open' }),
        goCard(c.followUps.late, 'Fora do prazo', 'leads', { filter: 'open' }, 'bad'), goCard(c.followUps.atRisk, 'Clientes a desistir', 'leads', { filter: 'all' }, 'bad'),
        goCard(c.followUps.unassigned, 'Sem responsável', 'leads', { filter: 'open' }, 'warn')), { count: c.followUps.open }),
      h('div', { class: 'grid2' },
        fold('control-reminders', 'Lembretes (7 dias)', h('table', {}, h('tbody', {},
          // Os lembretes vivem na Agenda; os enviados por WhatsApp em teste também na caixa do WhatsApp.
          h('tr', {}, h('td', {}, 'Enviados'), h('td', {}, c.reminders.sent), h('td', {}, goLink('agenda', { scope: 'team' }, 'Agenda'), ' ', goLink('whatsapp', {}, 'WhatsApp'))),
          h('tr', {}, h('td', {}, 'Preparados para enviar à mão'), countCell(c.reminders.prepared, 'warn'), h('td', {}, goLink('agenda', { scope: 'team' }, 'Agenda'))),
          h('tr', {}, h('td', {}, 'Falharam'), countCell(c.reminders.failed, 'bad'), h('td', {}, goLink('agenda', { scope: 'team' }, 'Agenda'))),
          h('tr', {}, h('td', {}, 'Não saíram a tempo'), countCell(c.reminders.missed, 'bad'), h('td', {}, goLink('agenda', { scope: 'team' }, 'Agenda'))))),
        { open: reminderIssues > 0, count: reminderIssues, tone: 'warn' }),
        fold('control-alerts', 'Alertas enviados (7 dias)', c.alerts.length
          ? h('ul', { class: 'feed' }, c.alerts.map(alert => h('li', {}, pill(alert.level === 'bad' ? 'Urgente' : 'Atenção', alert.level === 'bad' ? 'bad' : 'warn'), ' ', alert.text,
            h('div', { class: 'muted' }, `${alert.to.length ? `Para ${alert.to.join(', ')}` : 'Sem destinatário'} · ${DELIVERY[alert.delivery] ?? alert.delivery} · `,
              goLink(alert.tab, alert.leadId ? { filter: 'all', lead: alert.leadId } : {}, alert.leadId ? 'Abrir o lead' : 'Abrir')), h('time', {}, when(alert.at)))))
          : h('p', { class: 'muted' }, 'Ainda sem alertas.'), { open: false, count: c.alerts.length })),
    ].filter(Boolean));
  },

  async leads(view, state = leadsState) {
    const [{ leads }, settings] = await Promise.all([api('GET', `/v1/leads?status=${state.filter}`), api('GET', '/v1/settings').catch(() => null)]);
    rememberLeads(leads);
    const detail = h('div', { class: 'panel' }, h('p', { class: 'muted' }, 'Escolha um lead para ver a conversa com o chatbot.'));
    // Conversas mais recentes primeiro; os leads em risco continuam no alerta acima da tabela.
    const demoCount = leads.filter(lead => lead.synthetic).length;
    const shown = leads.filter(lead => state.demo || !lead.synthetic || lead.id === state.selected);
    const rows = state.filter === 'contacted' ? shown : [...shown].sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
    const real = leads.filter(lead => !lead.synthetic);
    const tally = [
      `${real.length} lead(s) ${state.filter === 'open' ? 'em aberto' : state.filter === 'contacted' ? 'contactados' : 'no total'}`,
      state.filter !== 'contacted' ? `${real.filter(lead => lead.status !== 'CONTACTED' && !lead.assignedTo).length} sem responsável` : '',
      state.filter !== 'contacted' ? `${real.filter(lead => lead.replyLate).length} fora do prazo` : '',
      demoCount ? `${demoCount} de demonstração ${state.demo ? 'incluídos' : 'escondidos'}` : '',
    ].filter(Boolean).join(' · ');
    const select = id => { state.selected = id; for (const row of view.querySelectorAll('tr.clickable')) row.classList.toggle('selected', row.dataset.id === id); showLead(detail, id, () => rerender()); };
    const rerender = () => { view.replaceChildren(); views.leads(view, state).catch(error => view.append(h('p', { class: 'error' }, error.message))); };
    const filterButton = (key, label) => h('button', { type: 'button', class: 'secondary', 'aria-pressed': String(state.filter === key), onclick: () => { state.filter = key; state.selected = ''; rerender(); } }, label);
    const churning = shown.filter(lead => lead.atRisk);
    view.append(
      h('h2', {}, 'Seguimento de leads'),
      churning.length ? h('div', { class: 'panel risk', role: 'alert' },
        h('h3', {}, `${churning.length} lead(s) em risco de desistência`),
        h('p', {}, 'O cliente disse que vai desistir. Contacte-o já e use «Marcar contactado» para limpar o alerta.'),
        h('div', { class: 'actions' }, churning.map(lead => h('button', { type: 'button', class: 'secondary', onclick: () => select(lead.id) }, lead.journey.destination || lead.id)))) : '',
      settings ? followUpRules(settings, rerender) : null,
      h('div', { class: 'filters' }, filterButton('open', 'Em aberto'), filterButton('contacted', 'Contactados'), filterButton('all', 'Todos'),
        demoCount ? [' ', h('button', { type: 'button', class: 'secondary', 'aria-pressed': String(state.demo), onclick: () => { state.demo = !state.demo; rerender(); } }, `Demonstração (${demoCount})`)] : null),
      h('p', { class: 'muted' }, tally),
      fold('leads-tree', 'Por estado e responsável', drillTree(real, [
        ['Estado', lead => (lead.atRisk ? 'Cliente a desistir' : lead.status === 'CONTACTED' ? 'Contactados' : lead.replyLate ? 'Fora do prazo' : 'Dentro do prazo'), ['Cliente a desistir', 'Fora do prazo', 'Dentro do prazo', 'Contactados']],
        ['Responsável', lead => lead.assignedTo || 'Sem responsável'],
      ], lead => treeLeaf(lead.journey.destination || lead.id, () => select(lead.id), [lead.journey.timeframe, when(lead.lastActivityAt)].filter(Boolean).join(' · '))), { open: false, count: real.length }),
      h('div', { class: 'split' },
        h('div', { class: 'panel' }, rows.length ? h('table', {},
          h('thead', {}, h('tr', {}, h('th', {}, 'Lead'), h('th', {}, 'Última mensagem'), h('th', {}, 'Estado'), h('th', {}, 'Responder até'), h('th', {}, 'Responsável'))),
          h('tbody', {}, rows.map(lead => h('tr', { class: `clickable${lead.id === state.selected ? ' selected' : ''}`, 'data-id': lead.id, tabindex: '0', onclick: () => select(lead.id), onkeydown: event => event.key === 'Enter' && select(lead.id) },
            h('td', {}, h('strong', {}, lead.journey.destination || lead.id), h('div', { class: 'muted' }, [lead.journey.timeframe, lead.journey.party].filter(Boolean).join(' · ') || lead.id), lead.synthetic ? pill('demo') : null),
            h('td', {}, when(lead.lastActivityAt), isRecent(lead.lastActivityAt) ? [' ', pill('novo', 'ok')] : null),
            h('td', {}, statusPill(lead.status), lead.atRisk ? [' ', pill('Em risco', 'bad')] : null),
            h('td', {}, lead.status === 'CONTACTED' ? [h('span', { class: 'muted' }, 'Contactado '), when(lead.contactedAt)]
              : lead.replyLate ? pill(`Atrasado ${lateBy(lead.replyDueAt)}`, 'bad')
              : lead.replyDueAt ? [lisbonTime(lead.replyDueAt), h('div', { class: 'muted' }, `faltam ${lateBy(lead.replyDueAt, true)}`)] : when(lead.followUpAt)),
            h('td', {}, lead.assignedTo || h('span', { class: 'muted' }, '—')))))) : h('p', { class: 'muted' }, 'Nenhum lead neste filtro.')),
        detail),
    );
    if (state.selected) select(state.selected);
  },

  // Agenda: o plano do dia. Tudo o que tem data, em atraso primeiro e, dentro de cada dia, por
  // urgência: serviços (com lembretes, resultado e reagendamento), tarefas, seguimentos, casos e
  // lembretes para enviar à mão. «Só o meu» ou «Equipa»; fundadores entram na equipa.
  async agenda(view, state = agendaState) {
    state.scope ||= can('team-admin') ? 'team' : 'mine';
    // Por defeito, o briefing da manhã: o que está atrasado e o que é hoje; os próximos dias só a pedido.
    const briefing = state.mode !== 'calendar';
    const other = state.scope === 'team' ? 'mine' : 'team';
    const [{ notifications, outcomes = [], outcomeLabels = {}, plan = { items: [] } }, otherPlan] = await Promise.all([
      api('GET', `/v1/agenda?days=${briefing ? 2 : state.days}&scope=${state.scope}`),
      briefing && can('team-admin') ? api('GET', `/v1/agenda?days=2&scope=${other}`).then(result => result.plan).catch(() => null) : Promise.resolve(null),
    ]);
    const rerender = () => { view.replaceChildren(); views.agenda(view, state).catch(error => view.append(h('p', { class: 'error' }, error.message))); };
    const dayKey = iso => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date(iso));
    const today = plan.today ?? dayKey(new Date().toISOString());
    const tomorrow = dayKey(new Date(Date.now() + 864e5).toISOString());
    const relative = iso => {
      const key = dayKey(iso);
      const prefix = key === today ? 'hoje' : key === tomorrow ? 'amanhã' : key < today ? 'ontem' : lisbonDay(iso);
      return `${prefix} às ${lisbonTime(iso)}`;
    };
    const heading = day => (day === 'overdue' ? 'Em atraso' : day === today ? 'Hoje' : day === tomorrow ? 'Amanhã' : lisbonDay(`${day}T12:00:00Z`));
    const urgencyPill = urgency => (URGENCY[urgency] ? pill(...URGENCY[urgency]) : null);
    const toggle = (key, value, label) => h('button', { type: 'button', class: 'secondary', 'aria-pressed': String(state[key] === value), onclick: () => { state[key] = value; rerender(); } }, label);
    const KINDS_PT = { service: 'Serviço', task: 'Tarefa', lead: 'Lead', case: 'Caso', reminder: 'Lembrete' };
    const openItem = item => {
      if (['lead', 'reminder', 'service'].includes(item.kind)) { leadsState.filter = 'all'; leadsState.selected = item.partition; show('leads'); }
      if (item.kind === 'task') show('work');
      if (item.kind === 'case') show('cases');
    };
    // Serviço: hora, lembretes, resultado e reagendamento no próprio cartão.
    const serviceCard = item => {
      const first = item.reminders[0];
      const editor = h('div', { hidden: true });
      return h('article', { class: `slot ${item.urgency}` },
        h('div', { class: 'slot-time' }, lisbonTime(item.occurrenceAt)),
        h('div', { class: 'slot-body' },
          h('div', {}, h('strong', {}, item.title), ' ', urgencyPill(item.urgency)),
          h('div', { class: 'muted' }, [item.detail, state.scope === 'team' ? item.owner : '', item.partition].filter(Boolean).join(' · ')),
          outcomeBlock(first, outcomes, outcomeLabels, rerender),
          h('ul', { class: 'reminders' }, [...item.reminders].sort((a, b) => a.sendAt.localeCompare(b.sendAt)).map(r => h('li', {},
            h('span', {}, `${CHANNEL[r.channel] ?? r.channel} ao ${(AUDIENCE[r.audience] ?? r.audience).toLowerCase()}, ${relative(r.sendAt)}`), ' ',
            notifyPill(r.status), r.delivery === 'test-inbox' ? [' ', pill('teste')] : null,
            r.reason ? h('div', { class: 'muted' }, r.reason) : null,
            h('details', {}, h('summary', { class: 'muted' }, 'Ver mensagem'), h('p', { class: 'message' }, r.text))))),
          isCurator() ? h('div', { class: 'actions' },
            h('button', { type: 'button', class: 'secondary', onclick: () => { editor.hidden = !editor.hidden; if (!editor.hidden && !editor.childElementCount) editor.append(activityEditor(item.partition, item.activityId, { compact: true, onSaved: rerender })); } }, 'Reagendar'),
            h('button', { type: 'button', class: 'link', onclick: () => openItem(item) }, 'Abrir lead')) : null,
          editor));
    };
    const line = item => h('li', { class: `work-item ${item.urgency}` },
      h('div', {}, pill(KINDS_PT[item.kind] ?? item.kind), ' ', urgencyPill(item.urgency), item.unassigned ? [' ', pill('Sem responsável', 'warn')] : null, state.scope === 'team' && item.owner ? h('span', { class: 'muted' }, ` · ${item.owner}`) : null),
      h('strong', {}, item.title),
      item.detail ? h('div', { class: 'muted' }, item.detail) : null,
      h('div', { class: 'actions task-actions' }, h('button', { type: 'button', class: 'link', onclick: () => openItem(item) }, 'Abrir')));
    if (briefing) {
      const forToday = list => (list?.items ?? []).filter(({ day }) => day === 'overdue' || day === today);
      const days = forToday(plan);
      const count = list => forToday(list).reduce((sum, { items }) => sum + items.length, 0);
      const tomorrowCount = plan.items.find(({ day }) => day === tomorrow)?.items.length ?? 0;
      const scopeLabel = (key, label) => `${label} · ${key === state.scope ? count(plan) : otherPlan ? count(otherPlan) : '…'}`;
      view.append(
        h('div', { class: 'heading-row' }, h('h2', {}, `Hoje · ${lisbonDay(new Date().toISOString())}`), h('div', { class: 'filters' },
          can('team-admin') ? [toggle('scope', 'mine', scopeLabel('mine', 'Só o meu')), toggle('scope', 'team', scopeLabel('team', 'Equipa'))] : null,
          toggle('mode', 'calendar', 'Próximos dias'))),
        ...(days.length ? days.map(({ day, items }) => h('section', { class: 'day spaced' },
          h('h3', { class: 'day-title' }, `${heading(day)} · ${items.length}`),
          ...items.filter(item => item.kind === 'service').map(serviceCard),
          items.some(item => item.kind !== 'service') ? h('ul', { class: 'work-list' }, items.filter(item => item.kind !== 'service').map(line)) : null))
          : [h('p', { class: 'muted' }, 'Nada para hoje.')]),
        h('p', { class: 'muted' }, `Amanhã: ${tomorrowCount}. `, can('read') ? goLink('operations', {}, 'Bloqueios em Operações') : null),
      );
      return;
    }
    view.append(
      h('h2', {}, 'Agenda'),
      h('div', { class: 'filters' }, toggle('mode', 'briefing', 'Hoje'), ' ', toggle('scope', 'mine', 'Só o meu'), toggle('scope', 'team', 'Equipa'), ' ', toggle('days', 7, '7 dias'), toggle('days', 14, '14 dias')),
      // Equipa: quem tem o quê em aberto e o que ainda não é de ninguém.
      plan.team ? h('div', { class: 'panel spaced' }, h('h3', {}, 'Quem tem o quê'),
        h('table', {},
          h('thead', {}, h('tr', {}, h('th', {}, 'Pessoa'), h('th', {}, 'Leads'), h('th', {}, 'Tarefas'), h('th', {}, 'Casos'), h('th', {}, 'Serviços no período'))),
          h('tbody', {},
            plan.team.people.map(person => h('tr', {}, h('td', {}, person.name), h('td', {}, person.leads), h('td', {}, person.tasks), h('td', {}, person.cases), h('td', {}, person.services))),
            h('tr', {}, h('td', {}, h('strong', {}, 'Sem responsável')),
              h('td', {}, plan.team.unassigned.leads ? pill(String(plan.team.unassigned.leads), 'warn') : '0'), h('td', {}, plan.team.unassigned.tasks || '0'), h('td', {}, '—'), h('td', {}, '—')))),
        plan.team.unassigned.leads ? h('p', { class: 'muted' }, 'Os leads sem responsável aparecem abaixo em «Hoje» ou «Em atraso». Abra-os e use «Assumir», ou ligue a atribuição automática nas Regras de seguimento.') : null) : null,
      ...(plan.items.length ? plan.items.map(({ day, items }) => h('section', { class: 'day spaced' },
        h('h3', { class: 'day-title' }, `${heading(day)} · ${items.length}`),
        ...items.filter(item => item.kind === 'service').map(serviceCard),
        items.some(item => item.kind !== 'service') ? h('ul', { class: 'work-list' }, items.filter(item => item.kind !== 'service').map(line)) : null))
        : [h('p', { class: 'muted' }, state.scope === 'mine' ? 'Nada com data para si neste período. Veja «Equipa» ou agende em Seguimento.' : 'Nada agendado. Abra um lead em Seguimento e use "Agendar recolha ou excursão".')]),
    );
  },

  // Parceiros: avaliação a partir dos resultados registados na Agenda; a melhor pontuação de cada
  // tipo primeiro. Sem serviços suficientes não há pontuação (desconhecido não é bom nem mau).
  async partners(view, state = { selected: '' }) {
    partnerCache = null;
    const { partners, scorecards = [], score = {}, outcomes: labels = {}, nps = { nps: null, responses: 0 }, experiences = {}, toCheck = [] } = await loadPartners();
    const staff = can('team-admin') ? await loadTeam().catch(() => []) : [];
    const npsText = value => (value === null || value === undefined ? '—' : value > 0 ? `+${value}` : `${value}`);
    const info = Object.fromEntries(partners.map(partner => [partner.id, partner]));
    const percent = value => (value === null || value === undefined ? '—' : `${Math.round(value * 100)}%`);
    const scorePill = card => (card.score === null ? pill('Dados insuficientes') : pill(`${card.score}`, card.score >= 75 ? 'ok' : card.score >= 50 ? 'warn' : 'bad'));
    const detail = h('div', { class: 'panel' });
    const showDetail = card => {
      state.selected = card.id;
      for (const row of view.querySelectorAll('tr.clickable')) row.classList.toggle('selected', row.dataset.id === card.id);
      const m = card.metrics;
      const partner = info[card.id] ?? {};
      detail.replaceChildren(
        h('h3', {}, card.name), h('div', { class: 'muted' }, [partner.kind, partner.area, partner.seats ? `${partner.seats} lugares` : ''].filter(Boolean).join(' · ')),
        h('dl', { class: 'facts' },
          h('dt', {}, 'Pontuação'), h('dd', {}, scorePill(card), card.rank ? ` ${card.rank}.º dos ${partner.kind ?? card.kind}` : ''),
          h('dt', {}, 'Serviços'), h('dd', {}, `${m.services} (${m.people} pessoas)`),
          h('dt', {}, 'Pontualidade'), h('dd', {}, `${percent(m.punctuality)}${m.averageDelay ? ` · atraso médio ${m.averageDelay} min` : ''}`),
          h('dt', {}, 'Fiabilidade'), h('dd', {}, `${percent(m.reliability)} · ${m.noShows} falta(s), ${m.cancellations} cancelamento(s)`),
          h('dt', {}, 'Avaliação dos clientes'), h('dd', {}, m.rating === null ? 'sem avaliações' : `${m.rating} / 5 (${m.ratings})`),
          h('dt', {}, 'NPS (recomendação)'), h('dd', {}, m.nps === null || m.nps === undefined ? 'sem respostas' : `${npsText(m.nps)} (${m.npsResponses} resposta(s))`),
          h('dt', {}, 'Margem e ROI'), h('dd', {}, m.margin === null ? 'sem custos e preços registados' : `margem ${percent(m.margin)} · ROI ${percent(m.roi)}`),
          h('dt', {}, 'Preço médio por pessoa'), h('dd', {}, m.pricePerPerson === null ? '—' : `${m.pricePerPerson} ${m.currency}`),
          ...Object.entries(m.byCurrency).flatMap(([currency, totals]) => [h('dt', {}, `Totais ${currency}`), h('dd', {}, `receita ${totals.revenue} · custo ${totals.cost}`)]),
          h('dt', {}, 'WhatsApp'), h('dd', {}, partner.whatsapp ? pill('Configurado', 'ok') : pill('Em falta', 'warn')),
          h('dt', {}, 'Licença'), h('dd', {}, partner.license?.number ? `${partner.license.type} ${partner.license.number}` : pill(partner.demo ? 'Demo' : 'Em falta', partner.demo ? '' : 'bad'))),
        h('h3', { class: 'spaced' }, 'Últimos serviços'),
        card.recent.length ? h('ul', { class: 'feed' }, card.recent.map(item => h('li', {},
          h('strong', {}, labels[item.result] ?? item.result), item.result === 'late' ? ` (${item.delayMinutes} min)` : '', ` · ${item.title}`,
          item.rating ? ` · cliente ${item.rating}/5` : '', item.recommend !== null && item.recommend !== undefined ? ` · recomenda ${item.recommend}/10` : '', item.price !== null && item.cost !== null ? ` · ${item.price} − ${item.cost} ${item.currency}` : '',
          item.comment ? h('div', { class: 'muted' }, `«${item.comment}»`) : null, h('time', {}, `${item.date} · ${item.conversationId}`))))
          : h('p', { class: 'muted' }, 'Ainda sem resultados. Depois de cada serviço, registe-o na Agenda (botão «Registar resultado»).'));
    };
    const cards = scorecards.length ? scorecards : partners.map(partner => ({ id: partner.id, name: partner.name, kind: partner.kind, demo: partner.demo, score: null, metrics: { services: 0, people: 0, punctuality: null, averageDelay: 0, noShows: 0, cancellations: 0, reliability: null, rating: null, ratings: 0, margin: null, roi: null, pricePerPerson: null, currency: '', byCurrency: {} }, recent: [] }));
    view.append(h('h2', {}, 'Parceiros'),
      h('p', { class: 'muted' }, `Avaliação dos últimos ${score.windowDays ?? 90} dias a partir dos resultados registados na Agenda: pontualidade, avaliação dos clientes, fiabilidade (faltas e cancelamentos) e margem. Pontuação só com ${score.minServices ?? 3} ou mais serviços. A lista vem de config/partners.json.`),
      // NPS: o pedido de recomendação (0 a 10) sai sozinho no dia seguinte ao serviço; a resposta regista-se na Agenda.
      h('div', { class: 'cards' },
        h('div', { class: `card ${nps.nps === null ? '' : nps.nps >= 30 ? 'ok' : nps.nps >= 0 ? 'warn' : 'bad'}` }, h('div', { class: 'value' }, npsText(nps.nps)), h('div', { class: 'label' }, `NPS da BLU (${nps.responses} resposta(s))`)),
        h('div', { class: 'card' }, h('div', { class: 'value' }, nps.promoters ?? 0), h('div', { class: 'label' }, 'Promotores (9–10)')),
        h('div', { class: 'card' }, h('div', { class: 'value' }, nps.passives ?? 0), h('div', { class: 'label' }, 'Neutros (7–8)')),
        h('div', { class: 'card' }, h('div', { class: 'value' }, nps.detractors ?? 0), h('div', { class: 'label' }, 'Detratores (0–6)'))),
      // Atalho para o que merece ser visto: cada serviço com o motivo e a ligação ao lead.
      h('div', { class: 'panel' }, h('h3', {}, `A verificar · ${toCheck.length}`), toCheck.length ? h('ul', { class: 'work-list' }, toCheck.map(item => h('li', { class: 'work-item' },
        h('div', {}, [
          item.recommend !== null && item.recommend <= 6 ? pill(`Recomenda ${item.recommend}/10`, 'bad') : null,
          item.transferOk === 'no' ? pill('Transfer correu mal', 'bad') : null,
          item.worst ? pill(`Pior: ${experiences[item.worst] ?? item.worst}`, 'warn') : null,
          item.result === 'no-show' ? pill('Parceiro não apareceu', 'bad') : null,
        ].filter(Boolean).flatMap(part => [part, ' '])),
        h('strong', {}, `${item.partnerName} · ${item.title}`), h('div', { class: 'muted' }, [item.date, item.comment ? `«${item.comment}»` : ''].filter(Boolean).join(' · ')),
        item.conversationId ? h('div', { class: 'actions task-actions' },
          h('button', { type: 'button', class: 'link', onclick: () => goTo('leads', { filter: 'all', lead: item.conversationId }) }, 'Abrir lead'),
          can('cases') ? h('button', { type: 'button', class: 'link', onclick: () => { casePrefill = { leadId: item.conversationId }; show('cases'); } }, 'Abrir reclamação') : null) : null)))
        : h('p', { class: 'muted' }, 'Nada a verificar.')),
      ...(can('team-admin') ? [fold('partners-request', 'Pedir novo parceiro', partnerRequestForm(staff, [...new Set(cards.map(card => card.kind).filter(Boolean))]), { open: false })] : []),
      fold('partners-tree', 'Por tipo e situação', drillTree(cards, [
        ['Tipo', card => card.kind || 'Outro'],
        ['Situação', card => (toCheck.some(item => item.partnerId === card.id) || card.metrics.noShows || (card.metrics.nps !== null && card.metrics.nps !== undefined && card.metrics.nps < 0) ? 'A verificar'
          : card.score === null ? 'Dados insuficientes' : 'Em ordem'), ['A verificar', 'Em ordem', 'Dados insuficientes']],
      ], card => treeLeaf(card.name, () => showDetail(card), card.score === null ? 'sem pontuação' : `pontuação ${card.score}`)), { open: false, count: cards.length }),
      h('div', { class: 'split' },
        h('div', { class: 'panel' }, h('table', {},
          h('thead', {}, h('tr', {}, h('th', {}, 'Parceiro'), h('th', {}, 'Tipo'), h('th', {}, 'Pontuação'), h('th', {}, 'Serviços'), h('th', {}, 'Pontualidade'), h('th', {}, 'Clientes'), h('th', {}, 'NPS'), h('th', {}, 'Margem'), h('th', {}, 'Preço/pessoa'))),
          h('tbody', {}, cards.map(card => h('tr', { class: `clickable${card.id === state.selected ? ' selected' : ''}`, 'data-id': card.id, tabindex: '0', onclick: () => showDetail(card), onkeydown: event => event.key === 'Enter' && showDetail(card) },
            h('td', {}, card.rank ? `${card.rank}. ` : '', card.name, card.demo ? [' ', pill('demo')] : null),
            h('td', {}, card.kind), h('td', {}, scorePill(card)), h('td', {}, card.metrics.services),
            h('td', {}, percent(card.metrics.punctuality)), h('td', {}, card.metrics.rating === null ? '—' : `${card.metrics.rating}/5`),
            h('td', {}, npsText(card.metrics.nps)), h('td', {}, percent(card.metrics.margin)), h('td', {}, card.metrics.pricePerPerson === null ? '—' : `${card.metrics.pricePerPerson} ${card.metrics.currency}`)))))),
        detail));
    const chosen = cards.find(card => card.id === state.selected) ?? cards[0];
    if (chosen) showDetail(chosen);
  },

  async team(view) {
    const [{ members }, access] = await Promise.all([api('GET', '/v1/team'), api('GET', '/v1/access')]);
    const status = h('p', { class: 'muted', role: 'status' });
    const reload = () => show('team');
    // Aviso em toast: a linha de estado fica no topo, fora de vista na tabela, e o reload apagava-a.
    // Em erro também se recarrega, para o seletor voltar ao papel que a pessoa tem de facto.
    const run = async (fn, done) => {
      try { await fn(); toast(done); } catch (error) { toast(error.message); }
      teamCache = undefined;
      reload();
    };
    const roleOf = member => Object.keys(ROLE_LABEL).find(role => member.groups.includes(role)) ?? '';
    const memberRow = member => h('tr', {},
      h('td', {}, h('strong', {}, member.name), h('div', { class: 'muted' }, member.email)),
      h('td', {}, isFounder()
        ? h('select', { 'aria-label': `Papel de ${member.name}`, onchange: event => run(() => api('POST', `/v1/team/${encodeURIComponent(member.username)}/role`, { role: event.target.value }), 'Papel atualizado.') },
          Object.entries(ROLE_LABEL).map(([id, label]) => h('option', { value: id, selected: roleOf(member) === id }, label)))
        : member.groups.map(group => pill(ROLE_LABEL[group] ?? group))),
      h('td', {}, member.openLeads),
      h('td', {}, member.enabled ? pill(member.status === 'CONFIRMED' ? 'Ativa' : 'Convite enviado', member.status === 'CONFIRMED' ? 'ok' : 'warn') : pill('Desativada', 'bad')),
      isFounder() ? h('td', {}, member.username === session.claims?.['cognito:username'] ? h('span', { class: 'muted' }, 'Você') : h('button', { type: 'button', class: 'secondary', onclick: () => run(() => api('POST', `/v1/team/${encodeURIComponent(member.username)}/status`, { enabled: !member.enabled }), member.enabled ? 'Conta desativada.' : 'Conta reativada.') }, member.enabled ? 'Desativar' : 'Reativar')) : null);

    const email = h('input', { type: 'text', inputmode: 'email', placeholder: 'nome@exemplo.pt', 'aria-label': 'Email' });
    const name = h('input', { type: 'text', maxlength: '80', placeholder: 'Nome', 'aria-label': 'Nome' });
    const role = h('select', { 'aria-label': 'Papel' }, Object.entries(ROLE_LABEL).map(([id, label]) => h('option', { value: id, selected: id === 'testers' }, label)));
    const invite = h('form', { class: 'form-grid', onsubmit: event => {
      event.preventDefault();
      run(() => api('POST', '/v1/team/invite', { email: email.value, name: name.value, role: role.value }), `Convite enviado para ${email.value}. A pessoa recebe um email com uma palavra-passe temporária e configura o MFA no primeiro login.`);
    } }, name, email, role, h('button', { type: 'submit', class: 'primary' }, 'Convidar'));

    view.append(
      h('h2', {}, 'Equipa e acessos'),
      h('p', { class: 'muted' }, 'Um único sítio para quem entra e o que pode fazer. A identidade fica no Cognito (com MFA) e as credenciais de serviço no Secrets Manager; a intranet nunca mostra palavras-passe nem tokens.'),
      status,
      isFounder() ? h('div', { class: 'panel' }, h('h3', {}, 'Convidar pessoa'), invite) : null,
      h('div', { class: 'panel spaced' }, h('h3', {}, 'Membros'), h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, 'Pessoa'), h('th', {}, 'Papel'), h('th', {}, 'Leads em aberto'), h('th', {}, 'Conta'), isFounder() ? h('th', {}, '') : null)),
        h('tbody', {}, members.map(memberRow)))),
      h('div', { class: 'grid2 spaced' },
        h('div', { class: 'panel' }, h('h3', {}, 'Papéis'), h('table', {},
          h('thead', {}, h('tr', {}, h('th', {}, 'Papel'), ...PERMISSION_LABELS.map(([, label]) => h('th', {}, label)))),
          h('tbody', {}, access.roles.map(item => h('tr', {}, h('td', {}, item.label), ...PERMISSION_LABELS.map(([permission]) => h('td', {}, item.can.includes(permission) ? '✓' : '—'))))))),
        h('div', { class: 'panel' }, h('h3', {}, 'Cofre de acessos'),
          h('dl', { class: 'facts' },
            h('dt', {}, 'Identidade'), h('dd', {}, access.identity.provider),
            h('dt', {}, 'Dois fatores'), h('dd', {}, access.identity.mfa),
            h('dt', {}, 'Palavra-passe'), h('dd', {}, access.identity.passwordPolicy),
            h('dt', {}, 'Registo público'), h('dd', {}, access.identity.selfSignUp ? 'Sim' : 'Não: só por convite'),
            h('dt', {}, 'Sessão'), h('dd', {}, access.identity.session)),
          h('h3', {}, 'Credenciais de serviço'),
          h('table', {}, h('tbody', {}, access.secrets.map(secret => h('tr', {}, h('td', {}, h('strong', {}, secret.purpose), h('div', { class: 'muted' }, secret.name)), h('td', {}, secret.unavailable ? pill('Indisponível', 'bad') : `Alterada ${when(secret.lastChanged)}`)))))),
      ),
    );
  },

  async cases(view, state = { filter: 'open', selected: null }) {
    const data = await api('GET', `/v1/cases?status=${state.filter}`);
    const members = await loadTeam().catch(() => []);
    const rerender = () => { view.replaceChildren(); views.cases(view, state).catch(error => view.append(h('p', { class: 'error' }, error.message))); };
    const detail = h('div', { class: 'panel' }, h('p', { class: 'muted' }, 'Escolha um caso para ver o histórico e atualizar.'));
    const ownerSelect = (value = '') => h('select', {}, h('option', { value: '' }, 'Sem responsável'), members.map(member => h('option', { value: member.email, selected: member.email === value }, member.name)));
    const status = h('p', { class: 'muted', role: 'status' }, state.flash ?? '');
    delete state.flash;

    const openCase = async item => {
      state.selected = item;
      for (const row of view.querySelectorAll('tr.clickable')) row.classList.toggle('selected', row.dataset.id === item.id);
      detail.replaceChildren(h('p', { class: 'muted' }, 'A carregar…'));
      try {
        const full = await api('GET', `/v1/leads/${encodeURIComponent(item.partition)}/cases/${item.id}`);
        const nextStatus = h('select', {}, Object.entries(data.statuses).map(([id, label]) => h('option', { value: id, selected: id === full.caseStatus }, label)));
        const owner = ownerSelect(full.owner);
        const deadline = h('input', { type: 'date', value: full.deadline });
        const resolution = h('textarea', { rows: '3', maxlength: '2000', placeholder: 'Resolução (obrigatória para fechar)' });
        resolution.value = full.resolution;
        const note = h('textarea', { rows: '2', maxlength: '2000', placeholder: 'Nota para o histórico (opcional)' });
        const form = h('form', { onsubmit: async event => {
          event.preventDefault();
          const body = { note: note.value };
          if (nextStatus.value !== full.caseStatus) body.status = nextStatus.value;
          if (owner.value !== full.owner) body.owner = owner.value;
          if (deadline.value !== full.deadline) body.deadline = deadline.value;
          if (resolution.value !== full.resolution) body.resolution = resolution.value;
          try {
            await api('POST', `/v1/leads/${encodeURIComponent(full.partition)}/cases/${full.id}`, body);
            state.flash = 'Caso atualizado.';
            rerender();
          } catch (error) {
            status.textContent = error.message;
          }
        } },
        h('div', { class: 'form-grid' }, h('label', { class: 'field' }, h('span', {}, 'Estado'), nextStatus), h('label', { class: 'field' }, h('span', {}, 'Responsável'), owner), h('label', { class: 'field' }, h('span', {}, 'Prazo'), deadline)),
        resolution, note,
        h('div', { class: 'actions' }, h('button', { type: 'submit', class: 'primary', disabled: !can('cases') }, 'Guardar')));
        detail.replaceChildren(...[
          h('h3', {}, full.title),
          h('div', {}, pill(data.types[full.type]?.label ?? full.type), ' ', pill(...DEADLINE[full.deadlineState]), full.priority === 'high' ? [' ', pill('Prioridade alta', 'bad')] : null),
          h('dl', { class: 'facts' },
            h('dt', {}, 'Lead'), h('dd', {}, full.leadId || 'Sem lead associado'),
            h('dt', {}, 'Canal'), h('dd', {}, data.channels[full.channel] ?? full.channel),
            h('dt', {}, 'Recebido'), h('dd', {}, full.receivedOn),
            h('dt', {}, 'Prazo'), h('dd', {}, full.deadline),
            h('dt', {}, 'Referência'), h('dd', {}, full.reference || '—'),
            h('dt', {}, 'Aberto por'), h('dd', {}, `${full.createdBy} (${when(full.createdAt)})`)),
          full.description ? h('p', { class: 'message' }, full.description) : null,
          form,
          h('h3', { class: 'spaced' }, 'Histórico'),
          h('ul', { class: 'reminders' }, full.log.map(entry => h('li', {}, h('div', {}, entry.text), h('div', { class: 'muted' }, `${entry.by} · ${when(entry.at)}`)))),
        ].filter(Boolean));
      } catch (error) {
        detail.replaceChildren(h('p', { class: 'error' }, error.message));
      }
    };

    const type = h('select', {}, Object.entries(data.types).map(([id, item]) => h('option', { value: id }, item.label)));
    const title = h('input', { type: 'text', maxlength: '140', placeholder: 'Ex.: Atraso na recolha em Belém' });
    const leadId = h('input', { type: 'text', maxlength: '80', placeholder: 'BLU-… (opcional)', value: casePrefill.leadId ?? '' });
    const channel = h('select', {}, Object.entries(data.channels).map(([id, label]) => h('option', { value: id }, label)));
    const receivedOn = h('input', { type: 'date', value: data.today });
    const owner = ownerSelect(session.claims?.email);
    const priority = h('select', {}, h('option', { value: 'normal' }, 'Normal'), h('option', { value: 'high' }, 'Alta'));
    const deadline = h('input', { type: 'date' });
    const reference = h('input', { type: 'text', maxlength: '80', placeholder: 'N.º da folha do Livro, processo, etc.' });
    const description = h('textarea', { rows: '3', maxlength: '2000', placeholder: 'O que aconteceu, o que o cliente pede' });
    casePrefill = {};
    const create = h('form', { onsubmit: async event => {
      event.preventDefault();
      try {
        const result = await api('POST', '/v1/cases', { type: type.value, title: title.value, leadId: leadId.value || undefined, channel: channel.value, receivedOn: receivedOn.value, owner: owner.value, priority: priority.value, deadline: deadline.value || undefined, reference: reference.value, description: description.value });
        state.flash = `Caso aberto com prazo ${result.deadline}.`;
        rerender();
      } catch (error) {
        status.textContent = error.message;
      }
    } },
    h('div', { class: 'form-grid' },
      h('label', { class: 'field' }, h('span', {}, 'Tipo'), type), h('label', { class: 'field' }, h('span', {}, 'Título'), title), h('label', { class: 'field' }, h('span', {}, 'Lead'), leadId),
      h('label', { class: 'field' }, h('span', {}, 'Canal'), channel), h('label', { class: 'field' }, h('span', {}, 'Recebido em'), receivedOn), h('label', { class: 'field' }, h('span', {}, 'Responsável'), owner),
      h('label', { class: 'field' }, h('span', {}, 'Prioridade'), priority), h('label', { class: 'field' }, h('span', {}, 'Prazo (vazio = automático)'), deadline), h('label', { class: 'field' }, h('span', {}, 'Referência'), reference)),
    description,
    h('p', { class: 'muted' }, 'Prazos automáticos em dias úteis: feedback 5, reclamação 15, Livro de Reclamações 15 (prazo legal, não pode ser alargado). Litígios precisam de prazo indicado.'),
    h('div', { class: 'actions' }, h('button', { type: 'submit', class: 'primary' }, 'Abrir caso')));

    const counts = key => data.cases.filter(item => item.deadlineState === key).length;
    const filterButton = (key, label) => h('button', { type: 'button', class: 'secondary', 'aria-pressed': String(state.filter === key), onclick: () => { state.filter = key; state.selected = null; rerender(); } }, label);
    view.append(
      h('h2', {}, 'Reclamações e litígios'),
      h('div', { class: 'actions' }, h('a', { class: 'button secondary', href: 'https://www.livroreclamacoes.pt/', target: '_blank', rel: 'noopener' }, 'Livro de Reclamações oficial ↗')),
      h('p', { class: 'muted' }, 'Feedback, reclamações, Livro de Reclamações e contencioso num só registo, com responsável, prazo em dias úteis e histórico.'),
      state.filter === 'open' ? h('div', { class: 'cards' },
        h('div', { class: 'card' }, h('div', { class: 'value' }, data.cases.length), h('div', { class: 'label' }, 'Casos abertos')),
        h('div', { class: 'card' }, h('div', { class: 'value' }, counts('overdue')), h('div', { class: 'label' }, 'Fora do prazo')),
        h('div', { class: 'card' }, h('div', { class: 'value' }, counts('due-soon')), h('div', { class: 'label' }, 'Prazo nos próximos 3 dias úteis')),
        h('div', { class: 'card' }, h('div', { class: 'value' }, data.cases.filter(item => item.type === 'livro').length), h('div', { class: 'label' }, 'Livro de Reclamações')),
        h('div', { class: 'card' }, h('div', { class: 'value' }, data.cases.filter(item => item.type === 'legal').length), h('div', { class: 'label' }, 'Litígios'))) : null,
      status,
      h('details', { class: 'panel', open: Boolean(leadId.value) }, h('summary', {}, 'Abrir novo caso'), create),
      h('div', { class: 'filters spaced' }, filterButton('open', 'Abertos'), filterButton('closed', 'Fechados')),
      data.cases.length ? fold('cases-tree', 'Por prazo e tipo', drillTree(data.cases, [
        ['Prazo', item => DEADLINE[item.deadlineState]?.[0] ?? item.deadlineState, ['Fora do prazo', 'Prazo próximo', 'No prazo', 'Fechado']],
        ['Tipo', item => data.types[item.type]?.label ?? item.type],
      ], item => treeLeaf(item.title, () => openCase(item), `prazo ${item.deadline}`)), { open: false, count: data.cases.length }) : null,
      h('div', { class: 'split' },
        h('div', { class: 'panel' }, data.cases.length ? h('table', {},
          h('thead', {}, h('tr', {}, h('th', {}, 'Prazo'), h('th', {}, 'Caso'), h('th', {}, 'Responsável'), h('th', {}, 'Estado'))),
          h('tbody', {}, data.cases.map(item => h('tr', { class: 'clickable', 'data-id': item.id, tabindex: '0', onclick: () => openCase(item), onkeydown: event => event.key === 'Enter' && openCase(item) },
            h('td', {}, item.deadline, h('div', {}, pill(...DEADLINE[item.deadlineState]))),
            h('td', {}, h('strong', {}, item.title), h('div', { class: 'muted' }, [data.types[item.type]?.label, item.leadId].filter(Boolean).join(' · '))),
            h('td', {}, members.find(member => member.email === item.owner)?.name ?? (item.owner || h('span', { class: 'muted' }, '—'))),
            h('td', {}, data.statuses[item.caseStatus] ?? item.caseStatus))))) : h('p', { class: 'muted' }, state.filter === 'open' ? 'Sem casos abertos.' : 'Sem casos fechados.')),
        detail),
    );
  },

  async security(view) {
    const [data, ops] = await Promise.all([api('GET', '/v1/security'), api('GET', '/v1/operations').catch(() => null)]);
    const tone = { bad: 'bad', warn: 'warn', info: '' };
    view.append(
      h('h2', {}, 'Segurança'),
      h('p', { class: 'muted' }, 'Estado das proteções da intranet e do pipeline, e o que precisa de atenção. Contas, papéis e convites estão em ', goLink('team', {}, 'Equipa e acessos'), '.'),
      h('div', { class: 'panel' }, h('h3', {}, 'Requer atenção'), data.findings.length
        ? h('ul', { class: 'reminders' }, data.findings.map(item => h('li', {}, pill(item.level === 'bad' ? 'Urgente' : item.level === 'warn' ? 'Atenção' : 'Info', tone[item.level]), ' ', item.text, item.tab ? [' ', goLink(item.tab)] : null)))
        : h('p', { class: 'muted' }, 'Nada pendente.')),
      h('div', { class: 'cards' },
        h('div', { class: 'card' }, h('div', { class: 'value' }, data.accounts.active), h('div', { class: 'label' }, 'Contas ativas')),
        h('div', { class: 'card' }, h('div', { class: 'value' }, data.accounts.founders), h('div', { class: 'label' }, 'Fundadores ativos')),
        h('div', { class: 'card' }, h('div', { class: 'value' }, data.accounts.pendingInvites), h('div', { class: 'label' }, 'Convites por aceitar')),
        h('div', { class: 'card' }, h('div', { class: 'value' }, data.accounts.disabled), h('div', { class: 'label' }, 'Contas desativadas')),
        data.policies ? h('div', { class: 'card' }, h('div', { class: 'value' }, `${data.policies.pass}/${data.policies.pass + data.policies.fail + data.policies.manual}`), h('div', { class: 'label' }, 'Políticas cumpridas')) : null),
      // Auditoria externa: cópia de cada mensagem para um analista fora da equipa. Não é trabalho do dia a dia.
      ops ? h('div', { class: 'panel' }, h('h3', {}, 'Auditoria externa'),
        h('p', {}, `${ops.queues.curatorTasks.waiting} cópia(s) de mensagens à espera de um analista externo.`),
        h('p', { class: 'muted' }, 'Cada mensagem do chatbot gera uma cópia para análise independente. Enquanto nenhum analista estiver ligado, as cópias expiram ao fim de 14 dias sem afetar clientes nem leads; a equipa não tem de fazer nada.')) : null,
      h('div', { class: 'panel' }, h('h3', {}, 'Controlos'), h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, 'Área'), h('th', {}, 'Controlo'), h('th', {}, 'Estado'))),
        h('tbody', {}, data.controls.map(item => h('tr', {}, h('td', {}, item.area), h('td', {}, item.control), h('td', {}, item.status === 'on' ? pill('Ativo', 'ok') : pill('Por ativar', 'warn'))))))),
    );
  },

  // Caixa de teste do WhatsApp: o que teria sido enviado e um simulador de respostas.
  async whatsapp(view, state = whatsappState) {
    const [{ mode, autoReplies, threads }, { partners }, { leads }] = await Promise.all([
      api('GET', '/v1/whatsapp-test'), loadPartners().catch(() => ({ partners: [] })), api('GET', '/v1/leads?status=all').catch(() => ({ leads: [] })),
    ]);
    const rerender = () => { view.replaceChildren(); views.whatsapp(view, state).catch(error => view.append(h('p', { class: 'error' }, error.message))); };
    // Todas: tudo; À espera: clientes e parceiros com mensagem por responder; Clientes e Parceiros: só esses.
    const filter = state.filter || 'all';
    const inFilter = key => thread => key === 'all' || (key === 'waiting' ? thread.waiting : thread.audience === key);
    const visible = threads.filter(inFilter(filter));
    // A conversa aberta só fica se pertencer ao filtro escolhido.
    const current = visible.find(thread => thread.key === state.selected) ?? null;
    const tripOf = id => leads.find(lead => lead.id === id)?.journey?.destination ?? '';
    const status = h('p', { class: 'muted', role: 'status' });
    // Para um parceiro basta o id: o número vem da lista de parceiros (ou fica a chave de teste).
    const target = thread => (thread.partnerId && !thread.to ? { partnerId: thread.partnerId } : { to: thread.to, partnerId: thread.partnerId || undefined });
    const write = async (body, key) => {
      status.textContent = 'A guardar…';
      try {
        const result = await api('POST', '/v1/whatsapp-test', body);
        state.selected = key;
        state.flash = result?.decision === 'auto' ? 'Respondida automaticamente.' : result?.decision === 'person' ? `Fica para uma pessoa: ${result.reason}${result.caseOpened ? ' Reclamação aberta em Reclamações e litígios.' : ''}` : result?.decision === 'stop' ? 'Pediu para parar: não recebe mais mensagens.' : '';
        rerender();
      } catch (error) {
        status.textContent = error.message;
      }
    };
    const composer = thread => {
      const form = h('form', { class: 'verify', onsubmit: event => {
        event.preventDefault();
        const direction = event.submitter?.value === 'in' ? 'in' : 'out';
        write({ direction, ...target(thread), leadId: thread.leadId, text: new FormData(form).get('text') }, thread.key);
      } },
        h('label', {}, 'Mensagem', h('textarea', { name: 'text', required: true, maxlength: '1000', rows: '2', placeholder: 'Escreva como BLU, ou simule o que o outro lado responde…' })),
        proposalLinkField(() => form.querySelector('textarea'), thread.leadId),
        h('div', { class: 'actions' },
          h('button', { type: 'submit', class: 'primary', value: 'out' }, 'Enviar como BLU'),
          h('button', { type: 'submit', class: 'secondary', value: 'in' }, thread.audience === 'partner' ? 'Simular resposta do parceiro' : 'Simular resposta do cliente'), status));
      return form;
    };
    // Nova conversa: escolher o cliente (lead) ou o parceiro; o número do cliente vem do lead.
    // No filtro Clientes só aparecem clientes; em Parceiros, só parceiros.
    const clientOptions = h('optgroup', { label: 'Clientes' },
      leads.map(lead => h('option', { value: `lead:${lead.id}` }, `${lead.journey?.destination || 'Sem destino'} · ${lead.id}${lead.synthetic ? ' (demo)' : ''}`)));
    const partnerOptions = h('optgroup', { label: 'Parceiros' },
      partners.map(partner => h('option', { value: `partner:${partner.id}` }, `${partner.name}${partner.whatsapp ? '' : ' · sem número'}`)));
    const who = h('select', { name: 'who', required: true, 'aria-label': 'Para quem' }, h('option', { value: '' }, 'Escolher…'),
      filter === 'partner' ? null : clientOptions, filter === 'traveller' ? null : partnerOptions);
    const phone = h('input', { name: 'to', inputmode: 'tel', placeholder: '+351 912 345 678' });
    const number = h('label', { hidden: true }, 'Número do cliente', phone);
    const hint = h('p', { class: 'muted', role: 'status' });
    // O número do cliente nunca se escreve à mão quando já é conhecido: vem da conversa de WhatsApp
    // já aberta com esse lead ou do que ele deixou no chat. O campo só aparece quando não há número.
    const fix = h('button', { type: 'button', class: 'link', hidden: true, onclick: () => { number.hidden = false; fix.hidden = true; phone.focus(); } }, 'Corrigir número');
    const openExisting = h('button', { type: 'button', class: 'link', hidden: true }, 'Abrir a conversa existente');
    who.addEventListener('change', async () => {
      const pick = who.value;
      const [kind, id] = pick.split(':');
      const existing = kind === 'lead' ? threads.find(thread => thread.leadId === id && thread.to) : null;
      number.hidden = true;
      fix.hidden = true;
      fix.textContent = 'Corrigir número';
      openExisting.hidden = !existing;
      phone.value = '';
      hint.textContent = '';
      if (kind !== 'lead') return;
      if (existing) {
        phone.value = `+${existing.to}`;
        hint.textContent = `Número já usado com este cliente: ${phone.value}.`;
        openExisting.onclick = () => { state.selected = existing.key; rerender(); };
        fix.hidden = false;
        return;
      }
      hint.textContent = 'A procurar o telefone do cliente…';
      const detail = await api('GET', `/v1/leads/${encodeURIComponent(id)}`).catch(() => null);
      if (who.value !== pick) return;
      phone.value = detail?.phones?.[0] ?? '';
      if (phone.value) { hint.textContent = `Número deixado pelo cliente na conversa: ${phone.value}.`; fix.hidden = false; }
      else { hint.textContent = 'Sem telefone deixado no chat: a conversa fica com a referência do lead.'; fix.textContent = 'Indicar número'; fix.hidden = false; }
    });
    const newThread = h('form', { class: 'verify', onsubmit: event => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.currentTarget));
      const [kind, id] = String(data.who).split(':');
      const partner = kind === 'partner' ? partners.find(item => item.id === id) : null;
      const digits = String(data.to ?? '').replace(/\D/g, '');
      // Como nos parceiros: sem número, a conversa do cliente fica com a referência do lead.
      if (!partner && digits && digits.length < 9) { hint.textContent = 'Número incompleto: use o indicativo do país, ou apague-o para usar a referência do lead.'; phone.focus(); return; }
      write({ direction: 'out', ...(partner ? { partnerId: partner.id } : { to: digits }), leadId: kind === 'lead' ? id : '', text: data.text }, partner ? (partner.whatsapp || `partner:${partner.id}`) : digits || `lead:${id}`);
    } },
      h('label', {}, 'Para', who), number, hint, h('div', { class: 'actions' }, openExisting, fix),
      h('label', {}, 'Primeira mensagem da BLU', h('textarea', { name: 'text', required: true, maxlength: '1000', rows: '2' })),
      h('div', { class: 'actions' }, h('button', { type: 'submit', class: 'primary' }, 'Começar conversa')));
    // Parceiro: nome e número. Cliente: destino da viagem (ou número) e número; nada do outro lado.
    const label = thread => thread.name || tripOf(thread.leadId) || thread.leadId || `+${thread.to}`;
    const sub = thread => (thread.audience === 'partner'
      ? (thread.to ? `+${thread.to}` : 'sem número')
      : [thread.to ? `+${thread.to}` : 'sem número', thread.leadId].filter(Boolean).join(' · '));
    const open = thread => { state.selected = thread.key; rerender(); };
    const filterButton = (key, text) => h('button', { type: 'button', class: 'secondary', 'aria-pressed': String(filter === key), onclick: () => { state.filter = key; rerender(); } }, `${text} (${threads.filter(inFilter(key)).length})`);
    const flash = h('p', { class: 'muted', role: 'status' }, state.flash ?? '');
    state.flash = '';
    const bubble = (message, thread) => h('div', { class: `bubble ${message.direction === 'in' ? 'wa-in' : 'wa-out'}` },
      message.title ? h('strong', {}, message.title) : null, message.title ? h('br') : null, message.text,
      message.direction === 'in' && message.decision === 'person' ? h('div', { class: 'muted' }, `Para uma pessoa: ${message.reason}`) : null,
      h('time', {}, `${when(message.at)} · ${message.direction === 'in' ? (thread.audience === 'partner' ? 'parceiro (simulado)' : 'cliente (simulado)') : message.authorName || message.author}`),
      message.author === 'auto-assistant' ? [' ', pill('automática', 'ok')] : null);
    view.append(...[
      h('h2', {}, 'WhatsApp'),
      state.proposal && isCurator() ? handoffPanel(state, leads, rerender) : null,
      mode === 'test'
        ? h('div', { class: 'panel warn-note', role: 'note' }, h('strong', {}, 'Modo de teste: nenhuma mensagem sai para o WhatsApp.'), h('p', {}, 'Os lembretes e mensagens automáticas que iriam por WhatsApp aparecem aqui, à hora marcada. Pode responder como BLU ou simular a resposta do cliente ou do parceiro para testar o circuito.'))
        : h('div', { class: 'panel', role: 'note' }, h('strong', {}, 'Modo real: as mensagens saem pelo WhatsApp Business.'), h('p', { class: 'muted' }, 'Esta caixa mostra só o histórico dos testes.')),
      h('p', { class: 'muted' }, autoReplies
        ? 'Respostas automáticas ligadas: só a hora, o local e confirmações de uma atividade agendada, no máximo 3 por pessoa em 24 h e nunca entre as 22:00 e as 08:00. Preço, pagamento, alterações e queixas ficam sempre para uma pessoa.'
        : 'Respostas automáticas desligadas: cada mensagem recebida vai para «O meu trabalho» com uma resposta sugerida. Uma fundadora liga-as em Seguimento › Regras de seguimento.'),
      flash,
      h('div', { class: 'filters' }, filterButton('all', 'Todas'), filterButton('waiting', 'À espera de resposta'), filterButton('traveller', 'Clientes'), filterButton('partner', 'Parceiros')),
      fold('whatsapp-tree', 'Por destinatário e estado', drillTree(threads, [
        ['Destinatário', thread => (thread.audience === 'partner' ? 'Parceiros' : 'Clientes'), ['Clientes', 'Parceiros']],
        ['Estado', thread => (thread.stopped ? 'Pediu para parar' : thread.waiting ? 'À espera de resposta' : 'Respondida'), ['À espera de resposta', 'Respondida', 'Pediu para parar']],
      ], thread => treeLeaf(label(thread), () => open(thread), when(thread.messages.at(-1)?.at))), { open: false, count: threads.length }),
      h('div', { class: 'split' },
        h('div', { class: 'panel' }, visible.length ? h('table', {},
          h('thead', {}, h('tr', {}, h('th', {}, 'Conversa'), h('th', {}, 'Última mensagem'), h('th', {}, 'Mensagens'))),
          h('tbody', {}, visible.map(thread => h('tr', { class: `clickable${thread.key === state.selected ? ' selected' : ''}`, tabindex: '0', onclick: () => open(thread), onkeydown: event => event.key === 'Enter' && open(thread) },
            h('td', {}, h('strong', {}, label(thread)), ' ', thread.audience === 'partner' ? pill('parceiro') : null, h('div', { class: 'muted' }, sub(thread))),
            h('td', {}, when(thread.messages.at(-1).at), thread.waiting ? [' ', pill('à espera', 'warn')] : thread.stopped ? [' ', pill('STOP', 'bad')] : isRecent(thread.messages.at(-1).at) ? [' ', pill('novo', 'ok')] : null),
            h('td', {}, thread.messages.length))))) : h('p', { class: 'muted' }, threads.length ? 'Nenhuma conversa neste filtro.' : 'Ainda sem mensagens. Agende uma recolha num lead com telefone ou comece uma conversa.'),
          mode === 'test' && isCurator() ? [h('h3', { class: 'spaced' }, 'Nova conversa'), newThread] : null),
        h('div', { class: 'panel' }, current ? [
          h('h3', {}, label(current)), h('div', { class: 'muted' }, sub(current)),
          h('div', { class: 'chat wa' }, current.messages.map(message => bubble(message, current))),
          current.stopped ? h('p', { class: 'muted' }, 'Pediu para não receber mais mensagens: a BLU já não escreve nesta conversa.')
            : mode === 'test' && isCurator() ? composer(current) : null,
        ] : h('p', { class: 'muted' }, 'Escolha uma conversa.')),
      ),
    ].filter(Boolean));
  },

  async operations(view, state = operationsState) {
    if (can('read')) return opsIntelligence(view, state);
    view.append(h('h2', {}, 'Operações'), pipelineFold(state, true));
  },

  // Escrito para a fundadora: linguagem simples primeiro, ações à mão, detalhe técnico dobrado.
  async governance(view, state = { open: '' }) {
    const { manifest, policies, evidence, valueRules = {} } = await api('GET', '/v1/governance');
    const RESULT = { pass: ['Cumpre', 'ok'], attested: ['Verificada', 'ok'], fail: ['Em falta', 'bad'], manual: ['Verificar à mão', 'warn'] };
    const rules = policies?.policies ?? [];
    const rerender = () => { view.replaceChildren(); views.governance(view, state).catch(error => view.append(h('p', { class: 'error' }, error.message))); };
    // Cartões com atalho: levam à lista do que falta ou ao tema das regras.
    const card = (value, label, tone, go) => (go && value
      ? h('button', { type: 'button', class: `card go ${tone ?? ''}`, onclick: go }, h('div', { class: 'value' }, value), h('div', { class: 'label' }, label))
      : h('div', { class: `card ${tone ?? ''}` }, h('div', { class: 'value' }, value), h('div', { class: 'label' }, label)));
    const toTodo = () => view.querySelector('#governance-todo')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const sources = policy => policy.sources.map(source => h('div', {}, h('a', { href: source.url, target: '_blank', rel: 'noopener noreferrer' }, source.name), h('span', { class: 'muted' }, ` ${source.ref}`)));
    const done = policy => ['pass', 'attested'].includes(policy.result.status);
    const attestedLine = policy => policy.attestation ? h('div', { class: 'muted' },
      `${policy.attestation.expired ? 'Verificação expirada' : 'Verificada'} por ${policy.attestation.byName || policy.attestation.by} em ${when(policy.attestation.at)}`,
      policy.attestation.value ? ` · ${valueRules[policy.id] ?? 'Valor'}: ${policy.attestation.value}` : '',
      policy.attestation.expired ? '' : ` · válida até ${when(policy.attestation.validUntil).split(',')[0]}`,
      policy.attestation.proofUrl ? [' · ', h('a', { href: policy.attestation.proofUrl, target: '_blank', rel: 'noopener noreferrer' }, 'ver prova')] : '',
      policy.attestation.note ? h('div', {}, `«${policy.attestation.note}»`) : '') : null;
    // Formulário de confirmação: o que foi verificado, a prova e, se a regra o pedir, o valor.
    const verify = policy => {
      if (!can('security')) return null;
      const status = h('p', { class: 'muted', role: 'status' });
      const form = h('form', { class: 'verify' },
        valueRules[policy.id] ? h('label', {}, valueRules[policy.id], h('input', { name: 'value', required: true, maxlength: '120', value: policy.attestation?.value ?? '' })) : null,
        h('label', {}, 'O que confirmou', h('textarea', { name: 'note', required: true, minlength: '5', maxlength: '500', rows: '2', placeholder: 'Ex.: apólice n.º … em vigor até 2027' })),
        h('label', {}, 'Ligação para a prova (opcional)', h('input', { name: 'proofUrl', type: 'url', placeholder: 'https://…' })),
        h('div', { class: 'actions' }, h('button', { type: 'submit', class: 'primary' }, 'Confirmar'), status));
      form.addEventListener('submit', async event => {
        event.preventDefault();
        const data = Object.fromEntries(new FormData(form));
        status.textContent = 'A guardar…';
        try {
          await api('POST', '/v1/governance/attestations', { policyId: policy.id, ...data });
          state.open = '';
          rerender();
        } catch (error) {
          status.textContent = error.message;
        }
      });
      return h('details', { class: 'verify-box' }, h('summary', { class: 'button-like' }, policy.attestation && !policy.attestation.expired ? 'Renovar verificação' : valueRules[policy.id] ? 'Indicar e confirmar' : 'Marcar como verificado'), form);
    };
    const todo = rules.filter(policy => !done(policy));
    const promise = ([key, value]) => {
      const [yes, no] = PROMISES[key] ?? [key.replace(/([A-Z])/g, ' $1').toLowerCase(), null];
      // Mensagens automáticas só com consentimento são uma promessa cumprida nos dois estados.
      const good = key === 'automaticCustomerContact' ? true : value;
      return h('li', { class: good ? 'kept' : 'open' }, value ? yes : (no ?? `Ainda não: ${yes.toLowerCase()}`));
    };
    const byTopic = Object.entries(RULE_TOPICS).map(([topic, ids]) => [topic, rules.filter(policy => ids.includes(policy.id))]);
    const others = rules.filter(policy => !Object.values(RULE_TOPICS).flat().includes(policy.id));
    if (others.length) byTopic.push(['Outras regras', others]);
    const topics = byTopic.filter(([, list]) => list.length);
    const topicOf = policy => topics.find(([, list]) => list.includes(policy))?.[0];
    const openTopic = topic => {
      state.open = topic;
      const box = view.querySelector(`details[data-topic="${CSS.escape(topic)}"]`);
      if (box) { box.open = true; box.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    };
    const week = Date.now() - 7 * 864e5;
    const kinds = Object.entries(evidence.reduce((groups, item) => {
      const kind = EVIDENCE_KIND[item.key.split('/')[1]] ?? 'Outros registos';
      (groups[kind] ??= []).push(item);
      return groups;
    }, {}));
    view.append(h('div', {},
      h('div', { class: 'heading-row' }, h('h2', {}, 'Está tudo em ordem?'), h('button', { type: 'button', class: 'secondary', onclick: rerender }, 'Verificar outra vez')),
      h('p', { class: 'muted' }, 'As regras que a BLU tem de cumprir, o que já está garantido e o que precisa de si. Serve de apoio a uma auditoria; não é uma certificação ISO.'),
      policies
        ? h('div', { class: 'cards' },
          card(policies.summary.pass, 'cumpridas automaticamente', 'ok'),
          card(policies.summary.attested ?? 0, 'verificadas pela equipa', 'ok'),
          card(policies.summary.fail, 'em falta: precisam de si', policies.summary.fail ? 'bad' : 'ok', toTodo),
          card(policies.summary.manual, 'para verificar à mão', policies.summary.manual ? 'warn' : 'ok', toTodo))
        : h('div', { class: 'notice' }, 'O relatório das regras legais ainda não foi publicado. Aparece aqui depois da próxima publicação do backoffice.'),
      topics.length ? h('div', { class: 'topic-buttons' }, topics.map(([topic, list]) => {
        const ok = list.filter(done).length;
        return h('button', { type: 'button', class: `topic-button ${ok === list.length ? 'ok' : 'warn'}`, onclick: () => openTopic(topic) },
          h('span', { class: 'value' }, `${ok}/${list.length}`), h('span', {}, topic));
      })) : null,
      todo.length ? h('div', { class: 'panel risk', id: 'governance-todo' },
        h('h3', {}, 'O que precisa de si'),
        h('ul', { class: 'todo' }, todo.map(policy => h('li', {},
          h('strong', {}, ACTIONS[policy.id] ?? policy.requirement), ' ', pill(...RESULT[policy.result.status]),
          h('div', { class: 'muted' }, `${policy.title}. Responsável: ${policy.owner}. `, topicOf(policy) ? h('button', { type: 'button', class: 'link', onclick: () => openTopic(topicOf(policy)) }, `Ver em ${topicOf(policy)}`) : null),
          h('div', { class: 'muted' }, sources(policy)),
          attestedLine(policy),
          verify(policy))))) : policies ? h('div', { class: 'notice ok' }, 'Todas as regras estão cumpridas ou verificadas. A próxima revisão é trimestral.') : null,
      h('div', { class: 'panel spaced' },
        h('h3', {}, 'As nossas promessas'),
        h('ul', { class: 'promises' }, Object.entries(manifest.controls ?? {}).map(promise)),
        h('p', { class: 'muted' }, 'As mensagens automáticas ligam-se e desligam-se em Seguimento › Regras de seguimento.'),
        manifest.mapping?.length ? h('details', { class: 'spaced' }, h('summary', {}, `Como garantimos cada promessa (${manifest.mapping.length} controlos)`), h('table', {},
          h('thead', {}, h('tr', {}, h('th', {}, 'Controlo'), h('th', {}, 'Onde está a prova'), h('th', {}, 'Referências'))),
          h('tbody', {}, manifest.mapping.map(item => h('tr', {}, h('td', {}, item.control), h('td', {}, item.evidence), h('td', {}, (item.references ?? []).map(ref => h('div', { class: 'muted' }, ref)))))))) : null),
      topics.map(([topic, list]) => h('details', { class: 'panel spaced topic', 'data-topic': topic, open: state.open === topic },
        h('summary', {}, `${topic} `, h('span', { class: 'muted' }, `${list.filter(done).length} de ${list.length} em ordem`)),
        h('table', {},
          h('thead', {}, h('tr', {}, h('th', {}, 'Regra'), h('th', {}, 'Estado'), h('th', {}, 'Lei'))),
          h('tbody', {}, list.map(policy => h('tr', {},
            h('td', {}, h('strong', {}, policy.title), h('div', { class: 'muted' }, policy.requirement), attestedLine(policy), policy.result.status === 'pass' ? null : verify(policy)),
            h('td', {}, pill(...(RESULT[policy.result.status] ?? [policy.result.status, '']))),
            h('td', {}, sources(policy)))))))),
      h('div', { class: 'panel spaced' },
        h('h3', {}, 'Provas guardadas'),
        h('p', { class: 'muted' }, `${evidence.filter(item => Date.parse(item.lastModified) > week).length} registo(s) nos últimos 7 dias, mais ${rules.filter(policy => policy.attestation).length} verificação(ões) da equipa. Nada é apagado.`),
        h('ul', {}, kinds.map(([kind, items]) => h('li', {}, `${kind}: ${items.length}, o mais recente em ${when(items[0].lastModified)}`))),
        h('details', {}, h('summary', {}, 'Detalhe para auditoria'), h('table', {},
          h('thead', {}, h('tr', {}, h('th', {}, 'Ficheiro'), h('th', {}, 'Data'), h('th', {}, 'Tamanho'), h('th', {}, 'ETag'))),
          h('tbody', {}, evidence.map(item => h('tr', {}, h('td', {}, item.key), h('td', {}, when(item.lastModified)), h('td', {}, `${item.size} B`), h('td', { class: 'muted' }, item.etag.slice(0, 12))))))))));
  },
};

// Tempo até (ou desde) um prazo, em linguagem simples: «3 h», «25 min», «2 d».
function lateBy(iso, ahead = false) {
  const minutes = Math.max(0, Math.round((ahead ? Date.parse(iso) - Date.now() : Date.now() - Date.parse(iso)) / 6e4));
  return minutes < 60 ? `${minutes} min` : minutes < 48 * 60 ? `${Math.round(minutes / 60)} h` : `${Math.round(minutes / 1440)} d`;
}

// Regras de seguimento: prazo da primeira resposta e mensagens automáticas (só fundadores alteram).
function followUpRules(settings, refresh) {
  const editable = isFounder();
  const status = h('p', { class: 'muted', role: 'status' });
  const switches = Object.entries(settings.types ?? {}).map(([type, label]) => h('label', { class: 'switch' },
    h('input', { type: 'checkbox', name: type, checked: settings.auto[type], disabled: !editable }), h('span', {}, label)));
  const form = h('form', { class: 'rules' },
    h('label', {}, 'Responder a cada lead em', h('span', { class: 'inline' }, h('input', { type: 'number', name: 'replyHours', min: '1', max: '72', value: String(settings.replyHours), disabled: !editable }), ' horas')),
    h('fieldset', {}, h('legend', {}, 'Atribuição de leads'),
      h('label', { class: 'switch' }, h('input', { type: 'checkbox', name: 'autoAssign', checked: Boolean(settings.autoAssign), disabled: !editable }),
        h('span', {}, 'Atribuir sozinho um lead que fica 1h30 sem responsável a um curador ou fundador que não tenha nenhum lead')),
      h('p', { class: 'muted' }, 'Verificado a cada 5 minutos. Se todos já tiverem leads, o lead fica à espera e os alertas continuam. Quem recebe é avisado; se o libertar, volta a contar 1h30.')),
    h('fieldset', {}, h('legend', {}, 'Mensagens automáticas ao cliente'), switches,
      h('p', { class: 'muted' }, 'Só a quem deu consentimento no chat; cada mensagem diz como parar (STOP) e nunca é enviada a quem pediu para parar. Sem canal configurado, ficam preparadas na Agenda para enviar à mão.')),
    editable ? h('div', { class: 'actions' }, h('button', { type: 'submit', class: 'primary' }, 'Guardar regras'), status) : h('p', { class: 'muted' }, 'Só fundadores alteram estas regras.'),
    'Notification' in window && Notification.permission === 'default'
      ? h('button', { type: 'button', class: 'secondary', onclick: async () => { await Notification.requestPermission(); refresh(); } }, 'Avisar-me no navegador quando chega um lead') : null);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const data = new FormData(form);
    status.textContent = 'A guardar…';
    try {
      await api('POST', '/v1/settings', { replyHours: Number(data.get('replyHours')), autoAssign: data.has('autoAssign'), auto: Object.fromEntries(Object.keys(settings.types).map(type => [type, data.has(type)])) });
      refresh();
    } catch (error) {
      status.textContent = error.message;
    }
  });
  const on = Object.entries(settings.auto).filter(([, value]) => value).map(([type]) => settings.types[type]?.split(' ')[0]).filter(Boolean);
  return h('details', { class: 'panel spaced' }, h('summary', {}, `Regras de seguimento: responder em ${settings.replyHours} h · atribuição automática: ${settings.autoAssign ? 'ligada' : 'desligada'} · automáticas: ${on.length ? on.join(', ') : 'nenhuma'}`),
    settings.updatedAt ? h('p', { class: 'muted' }, `Alteradas por ${settings.updatedBy} em ${when(settings.updatedAt)}.`) : null, form);
}

// Novos leads: o painel verifica a cada minuto (com o separador visível) e avisa logo.
const SEEN_KEY = 'blu-intranet-seen-leads';
let seenLeads = null;
function rememberLeads(leads) {
  try {
    seenLeads ??= new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || 'null') ?? leads.map(lead => lead.id));
    for (const lead of leads) seenLeads.add(lead.id);
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seenLeads].slice(-500)));
  } catch {
    seenLeads ??= new Set(leads.map(lead => lead.id));
  }
}

function toast(text, action) {
  const box = h('div', { class: 'toast', role: 'status' }, h('span', {}, text), action ? h('button', { type: 'button', class: 'link', onclick: () => { box.remove(); action(); } }, 'Abrir') : null,
    h('button', { type: 'button', class: 'link', 'aria-label': 'Fechar', onclick: () => box.remove() }, '×'));
  document.body.append(box);
  setTimeout(() => box.remove(), 15000);
}

async function watchLeads() {
  if (document.hidden) return;
  try {
    const { leads } = await api('GET', '/v1/leads?status=open');
    openLeads = leads;
    if (!seenLeads) return rememberLeads(leads);
    const fresh = leads.filter(lead => !seenLeads.has(lead.id) && !lead.synthetic);
    rememberLeads(leads);
    const late = leads.filter(lead => lead.replyLate && !lead.synthetic).length;
    document.title = `${late ? `(${late}) ` : ''}${SITE.name}`;
    if (!fresh.length) return;
    const text = fresh.length === 1 ? `Novo lead: ${fresh[0].journey.destination || fresh[0].id}` : `${fresh.length} novos leads`;
    toast(text, () => { leadsState.filter = 'open'; leadsState.selected = fresh[0].id; show('leads'); });
    if ('Notification' in window && Notification.permission === 'granted') new Notification(SITE.name, { body: text, icon: 'favicon.svg' });
    if (['leads', 'work', 'dashboard'].includes(current)) show(current);
  } catch {
    // Sem rede ou sessão expirada: tenta no minuto seguinte.
  }
}

// Sentimento e sinais lidos pelo modelo, só leitura. Um sinal incerto não conta para alertas;
// a análise repete-se quando o cliente volta a escrever.
function analysisBlock(lead) {
  if (!lead.aiAnalysedAt) return h('p', { class: 'muted' }, 'Ainda sem análise: corre sozinha quando o cliente deixa de escrever por 2 minutos (depois, 10 minutos).');
  if (lead.aiStatus === 'failed') return h('p', { class: 'muted' }, `A análise de ${when(lead.aiAnalysedAt)} não foi possível; repete com a próxima mensagem do cliente.`);
  const [label, tone] = SENTIMENTS[lead.aiSentiment] ?? [lead.aiSentiment, ''];
  return h('div', { class: 'analysis' },
    h('div', { class: 'tags' }, pill(`Sentimento: ${label}`, tone), ...(lead.aiSignals ?? []).map(signal =>
      pill(`${SIGNALS[signal.signal] ?? signal.signal}${signal.certain ? '' : ' (incerto)'} · ${Math.round(signal.confidence * 100)}%`, signal.certain ? (signal.signal === 'at-risk' ? 'bad' : '') : 'muted'))),
    lead.aiReason ? h('p', {}, lead.aiReason) : null,
    h('p', { class: 'muted' }, `Analisado ${when(lead.aiAnalysedAt)} · só leitura`));
}

// Depois de um serviço com parceiro: registar o resultado (a horas, atraso, falta), a avaliação do
// cliente, o custo e o preço. Alimenta a avaliação dos parceiros; pode corrigir-se.
function outcomeBlock(item, outcomes, labels, refresh) {
  if (!item.partnerName || item.partnerName === 'Bolt' || Date.parse(item.occurrenceAt) > Date.now()) return null;
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date(item.occurrenceAt));
  const done = outcomes.find(outcome => outcome.activityId === item.activityId && outcome.date === date);
  if (!isCurator()) return done ? h('div', {}, pill(labels[done.result] ?? done.result, done.result === 'on-time' ? 'ok' : 'warn')) : null;
  const status = h('span', { class: 'muted', role: 'status' });
  const result = h('select', { name: 'result', required: true }, h('option', { value: '' }, 'Resultado…'), Object.entries(labels).map(([key, label]) => h('option', { value: key, selected: done?.result === key }, label)));
  const delay = h('input', { name: 'delayMinutes', type: 'number', min: '1', max: '600', placeholder: 'Atraso (min)', value: done?.delayMinutes || '' });
  const rating = h('select', { name: 'rating' }, h('option', { value: '' }, 'Cliente: sem avaliação'), [5, 4, 3, 2, 1].map(value => h('option', { value, selected: done?.rating === value }, `Cliente: ${value}/5`)));
  // Resposta ao pedido de recomendação do dia seguinte (NPS, 0 a 10).
  const recommend = h('select', { name: 'recommend' }, h('option', { value: '' }, 'Recomenda (0–10): sem resposta'), Array.from({ length: 11 }, (_, index) => 10 - index).map(value => h('option', { value, selected: done?.recommend === value }, `Recomenda: ${value}/10`)));
  // Respostas curtas do cliente: o transfer e o melhor e o pior da viagem, sem detalhe.
  const experiences = partnerCache?.experiences ?? { transfer: 'Transfer', accommodation: 'Alojamento', food: 'Restaurantes e comida', guide: 'Guia e equipa' };
  const choice = (name, empty, prefix) => h('select', { name }, h('option', { value: '' }, empty), Object.entries(experiences).map(([id, label]) => h('option', { value: id, selected: done?.[name] === id }, `${prefix}: ${label}`)));
  const best = choice('best', 'Melhor: sem resposta', 'Melhor');
  const worst = choice('worst', 'Pior: sem resposta', 'Pior');
  const transferOk = h('select', { name: 'transferOk' }, h('option', { value: '' }, 'Transfer: sem resposta'), h('option', { value: 'yes', selected: done?.transferOk === 'yes' }, 'Transfer: correu bem'), h('option', { value: 'no', selected: done?.transferOk === 'no' }, 'Transfer: correu mal'));
  const form = h('form', { class: 'outcome', onsubmit: async event => {
    event.preventDefault();
    status.textContent = 'A guardar…';
    try {
      await api('POST', `/v1/leads/${item.conversationId}/activities/${item.activityId}/outcome`, { date, ...Object.fromEntries(new FormData(form)) });
      partnerCache = null;
      refresh();
    } catch (error) {
      status.textContent = error.message;
    }
  } },
    result, delay, rating, recommend, transferOk, best, worst,
    h('input', { name: 'cost', inputmode: 'decimal', placeholder: 'Custo (EUR)', value: done?.cost ?? '' }),
    h('input', { name: 'price', inputmode: 'decimal', placeholder: 'Preço ao cliente (EUR)', value: done?.price ?? '' }),
    h('input', { name: 'comment', maxlength: '500', placeholder: 'Comentário (opcional)', value: done?.comment ?? '' }),
    h('button', { type: 'submit', class: 'secondary' }, done ? 'Corrigir' : 'Guardar'), status);
  return h('details', { class: 'outcome-box', open: !done },
    h('summary', {}, done ? ['Resultado: ', pill(labels[done.result] ?? done.result, done.result === 'on-time' ? 'ok' : 'warn')] : 'Registar resultado do serviço'), form);
}

async function showLead(panel, id, refreshList) {
  panel.replaceChildren(h('p', { class: 'muted' }, 'A carregar…'));
  let lead;
  try {
    lead = await api('GET', `/v1/leads/${encodeURIComponent(id)}`);
  } catch (error) {
    panel.replaceChildren(h('p', { class: 'error' }, error.message));
    return;
  }
  const status = h('p', { class: 'muted', role: 'status' });
  const act = (label, fn, cls = 'secondary') => h('button', { type: 'button', class: cls, disabled: !isCurator(), onclick: async event => {
    event.currentTarget.disabled = true;
    try { await fn(); status.textContent = 'Guardado.'; refreshList(); } catch (error) { status.textContent = error.message; event.currentTarget.disabled = false; }
  } }, label);
  const mine = lead.assignedTo && lead.assignedTo === session.claims?.email;
  const note = h('textarea', { rows: '3', maxlength: '1000', 'aria-label': 'Nota interna' });
  note.value = lead.curatorNote ?? '';
  const journey = Object.entries({ ...lead.journey, stage: STAGES[lead.stage] ?? lead.stage }).filter(([, value]) => value);

  // replaceChildren escreveria null como texto; os blocos opcionais são filtrados.
  panel.replaceChildren(...[
    h('h3', {}, lead.journey.destination || lead.id), h('div', {}, statusPill(lead.status), ' ', lead.synthetic ? pill('demo') : null),
    lead.atRisk ? h('p', { class: 'error', role: 'alert' }, lead.churnSignalAt && lead.churnSignalAt >= (lead.aiRiskAt ?? '')
      ? `Sinal de desistência em ${when(lead.churnSignalAt)} («${lead.churnSignal}»). Contactar já.`
      : `A análise automática detetou risco de perda em ${when(lead.aiRiskAt)}. Contactar já.`) : null,
    h('dl', { class: 'facts' },
      h('dt', {}, 'Referência'), h('dd', {}, lead.id),
      ...journey.flatMap(([key, value]) => [h('dt', {}, JOURNEY[key] ?? key), h('dd', {}, value)]),
      h('dt', {}, 'Email'), h('dd', {}, lead.emails.join(', ') || '—'),
      h('dt', {}, 'Telefone'), h('dd', {}, lead.phones.join(', ') || '—'),
      h('dt', {}, 'Consentimento'), h('dd', {}, when(lead.consentAt)),
      h('dt', {}, 'Seguimento até'), h('dd', {}, when(lead.followUpAt)),
      h('dt', {}, 'Responsável'), h('dd', {}, lead.assignedTo ? `${lead.assignedTo} (${when(lead.assignedAt)})` : '—')),
    h('div', { class: 'actions' },
      mine ? act('Libertar', () => api('POST', `/v1/leads/${id}/assign`, { release: true })) : act('Assumir', () => api('POST', `/v1/leads/${id}/assign`, {}), 'primary'),
      lead.status === 'CONTACTED' ? null : act('Marcar contactado', () => api('POST', `/v1/leads/${id}/contacted`)),
      can('tasks') ? h('button', { type: 'button', class: 'secondary', onclick: () => { taskPrefill = { leadId: id }; show('work'); } }, 'Criar tarefa') : null),
    isCurator() && !lead.synthetic ? proposalComposer(lead) : null,
    isCurator() ? null : h('p', { class: 'muted' }, 'Só curadores e fundadores podem alterar leads.'),
    status,
    h('h3', {}, 'Conversa com o chatbot'),
    h('div', { class: 'chat' }, lead.messages.length ? lead.messages.map(message => h('div', { class: `bubble ${['customer', 'assistant'].includes(message.actor) ? message.actor : 'system'}` }, message.text, h('time', {}, `${when(message.at)} · ${message.channel}`))) : h('p', { class: 'muted' }, 'Sem mensagens guardadas.')),
    h('h3', { class: 'spaced' }, 'Análise automática'),
    analysisBlock(lead),
    h('h3', { class: 'spaced' }, 'Nota interna'),
    h('p', { class: 'muted' }, 'Só para a equipa; não muda a análise nem os indicadores.'),
    note,
    h('div', { class: 'actions' }, act('Guardar nota', () => api('PUT', `/v1/leads/${id}/tags`, { note: note.value }))),
    can('cases') ? h('h3', { class: 'spaced' }, 'Reclamações e litígios') : null,
    can('cases') ? leadCases(id) : null,
    h('h3', { class: 'spaced' }, 'Agenda do viajante'),
    activityPanel(id, lead),
    isCurator() ? h('p', { class: 'muted spaced' }, 'Dúvidas sobre este lead? Use o botão «Assistente» no canto inferior direito.') : null,
  ].filter(Boolean));
}

// Conversas do chatbot para a fundadora rever: lista à esquerda, conversa e feedback à direita.
function conversationReview(review, state) {
  const panel = h('div', { class: 'panel spaced' }, h('h3', {}, 'Conversas para rever'),
    h('p', { class: 'muted' }, 'As conversas mais recentes do chatbot, com consentimento. O feedback fica junto do lead e nunca é enviado ao cliente.'));
  if (review.error) {
    panel.append(h('p', { class: 'error' }, review.error));
    return panel;
  }
  const detail = h('div', { class: 'panel' }, h('p', { class: 'muted' }, 'Escolha uma conversa para a ler e dar feedback.'));
  const select = id => {
    state.selected = id;
    for (const row of panel.querySelectorAll('tr.clickable')) row.classList.toggle('selected', row.dataset.id === id);
    showConversation(detail, id, review.verdicts, refreshRow);
  };
  const refreshRow = async () => {
    const fresh = await api('GET', '/v1/conversations').catch(() => null);
    if (!fresh) return;
    review.conversations = fresh.conversations;
    table.replaceWith(table = list());
  };
  const list = () => review.conversations.length ? h('table', {},
    h('thead', {}, h('tr', {}, h('th', {}, 'Conversa'), h('th', {}, 'Última mensagem'), h('th', {}, 'Mensagens'), h('th', {}, 'Feedback'))),
    h('tbody', {}, review.conversations.map(item => h('tr', { class: `clickable${item.id === state.selected ? ' selected' : ''}`, 'data-id': item.id, tabindex: '0', onclick: () => select(item.id), onkeydown: event => event.key === 'Enter' && select(item.id) },
      h('td', {}, h('strong', {}, item.journey.destination || item.id), h('div', { class: 'muted' }, STAGES[item.stage] ?? item.stage ?? ''), item.synthetic ? pill('demo') : null),
      h('td', {}, when(item.lastActivityAt), isRecent(item.lastActivityAt) ? [' ', pill('novo', 'ok')] : null),
      h('td', {}, item.messageCount),
      // Sem feedback dado à mão, mostra a avaliação inferida pela IA (marcada como tal).
      h('td', {}, item.lastFeedback ? [pill(review.verdicts[item.lastFeedback.verdict] ?? item.lastFeedback.verdict, VERDICT_TONE[item.lastFeedback.verdict]), item.feedbackCount > 1 ? h('div', { class: 'muted' }, `${item.feedbackCount} notas`) : null]
        : item.inferred ? inferredPill(item.inferred, review.verdicts) : h('span', { class: 'muted' }, 'Por rever')))))) : h('p', { class: 'muted' }, 'Ainda não há conversas guardadas.');
  let table = list();
  panel.append(h('div', { class: 'split' }, h('div', {}, table), detail));
  if (state.selected) select(state.selected);
  return panel;
}

// Avaliação inferida: tracejada se a IA não tem a certeza (abaixo de 70%).
const inferredPill = (inferred, verdicts) => pill(`IA: ${verdicts[inferred.verdict] ?? inferred.verdict}${inferred.certain ? '' : ' (incerto)'} · ${Math.round(inferred.confidence * 100)}%`, inferred.certain ? VERDICT_TONE[inferred.verdict] : 'muted');

async function showConversation(panel, id, verdicts, refreshList) {
  panel.replaceChildren(h('p', { class: 'muted' }, 'A carregar…'));
  let lead, feedback;
  try {
    [lead, { feedback }] = await Promise.all([api('GET', `/v1/leads/${encodeURIComponent(id)}`), api('GET', `/v1/leads/${encodeURIComponent(id)}/feedback`)]);
  } catch (error) {
    panel.replaceChildren(h('p', { class: 'error' }, error.message));
    return;
  }
  const journey = Object.entries({ ...lead.journey, stage: STAGES[lead.stage] ?? lead.stage }).filter(([, value]) => value);
  const status = h('p', { class: 'muted', role: 'status' });
  const save = async event => {
    event.preventDefault();
    status.textContent = 'A guardar…';
    try {
      await api('POST', `/v1/leads/${encodeURIComponent(id)}/feedback`, Object.fromEntries(new FormData(event.currentTarget)));
      await showConversation(panel, id, verdicts, refreshList);
      refreshList();
    } catch (error) {
      status.textContent = error.message;
    }
  };
  const form = can('feedback') ? h('form', { class: 'verify', onsubmit: save },
    h('div', { class: 'tags', role: 'radiogroup', 'aria-label': 'Avaliação' }, Object.entries(verdicts).map(([key, label]) => h('label', {}, h('input', { type: 'radio', name: 'verdict', value: key, required: true }), ' ', label))),
    h('label', {}, 'O que correu bem ou o que o chatbot devia ter feito', h('textarea', { name: 'note', required: true, minlength: '5', maxlength: '1000', rows: '3', placeholder: 'Ex.: devia ter perguntado as datas antes de sugerir hotéis.' })),
    h('div', { class: 'actions' }, h('button', { type: 'submit', class: 'primary' }, 'Guardar feedback'), status)) : h('p', { class: 'muted' }, 'Só fundadores dão feedback às conversas.');
  panel.replaceChildren(...[
    h('h3', {}, lead.journey.destination || lead.id), h('div', {}, statusPill(lead.status), ' ', lead.synthetic ? pill('demo') : null),
    h('dl', { class: 'facts' }, h('dt', {}, 'Referência'), h('dd', {}, lead.id), ...journey.flatMap(([key, value]) => [h('dt', {}, JOURNEY[key] ?? key), h('dd', {}, value)])),
    h('h3', { class: 'spaced' }, 'Avaliação inferida pela IA'),
    lead.aiChatbot
      ? h('div', {}, inferredPill(lead.aiChatbot, verdicts), lead.aiChatbot.note ? h('p', {}, lead.aiChatbot.note) : null,
        h('p', { class: 'muted' }, `Lida da conversa quando parou (${when(lead.aiAnalysedAt)}), pelas reações do cliente; só leitura.`))
      : h('p', { class: 'muted' }, 'Ainda sem avaliação: a IA lê a conversa quando o cliente deixa de escrever por 2 minutos (depois, 10 minutos).'),
    h('h3', { class: 'spaced' }, 'Feedback da fundadora'),
    feedback.length ? h('ul', { class: 'reminders' }, feedback.map(item => h('li', {}, pill(verdicts[item.verdict] ?? item.verdict, VERDICT_TONE[item.verdict]), ' ', h('span', { class: 'muted' }, `${item.byName || item.by} · ${when(item.at)}`), h('div', {}, item.note)))) : h('p', { class: 'muted' }, 'Ainda sem feedback.'),
    form,
    h('h3', { class: 'spaced' }, 'Conversa com o chatbot'),
    h('div', { class: 'chat' }, lead.messages.length ? lead.messages.map(message => h('div', { class: `bubble ${['customer', 'assistant'].includes(message.actor) ? message.actor : 'system'}` }, message.text, h('time', {}, `${when(message.at)} · ${message.channel}`))) : h('p', { class: 'muted' }, 'Sem mensagens guardadas.')),
  ]);
}

function leadCases(id) {
  const box = h('div', {}, h('p', { class: 'muted' }, 'A carregar…'));
  api('GET', `/v1/leads/${id}/cases`).then(({ cases }) => box.replaceChildren(
    ...(cases.length ? cases.map(item => h('div', { class: 'activity' }, h('strong', {}, item.title), h('div', { class: 'muted' }, `Prazo ${item.deadline}`), pill(...DEADLINE[item.deadlineState]))) : [h('p', { class: 'muted' }, 'Sem casos.')]),
    h('button', { type: 'button', class: 'secondary', onclick: () => { casePrefill = { leadId: id }; show('cases'); } }, 'Abrir caso para este lead'),
  )).catch(error => box.replaceChildren(h('p', { class: 'error' }, error.message)));
  return box;
}

// Alterar uma atividade: data, hora e repetição; no detalhe do lead também local, pessoas,
// parceiro e nota. Só os campos alterados são enviados; a API planeia de novo os lembretes por enviar.
function activityEditor(leadId, activityId, { compact = false, onSaved = () => {}, activity = null } = {}) {
  const box = h('div', { class: 'panel' }, h('p', { class: 'muted' }, 'A carregar…'));
  const build = current => {
    const field = (label, input) => h('label', { class: 'field' }, h('span', {}, label), input);
    const date = h('input', { type: 'date', value: current.date, required: true });
    const time = h('input', { type: 'time', value: current.time, required: true });
    const until = h('input', { type: 'date', value: current.repeatUntil && current.repeatUntil !== current.date ? current.repeatUntil : '' });
    const place = h('input', { type: 'text', maxlength: '200', value: current.place });
    const people = h('input', { type: 'number', min: '1', max: '30', value: String(current.people) });
    const partner = h('select', {}, h('option', { value: '' }, 'Sem parceiro'), h('option', { value: 'bolt' }, 'Bolt (o viajante reserva)'));
    const notes = h('input', { type: 'text', maxlength: '500', value: current.notes });
    if (!compact) loadPartners().then(({ partners }) => { partner.append(...partners.map(item => h('option', { value: item.id }, item.name))); partner.value = current.partnerId; }).catch(() => {});
    const status = h('p', { class: 'muted', role: 'status' });
    const form = h('form', { class: 'activity-form', onsubmit: async event => {
      event.preventDefault();
      const next = { date: date.value, time: time.value, repeatUntil: until.value || date.value, ...(compact ? {} : { place: place.value, people: people.value, partnerId: partner.value, notes: notes.value }) };
      const before = { date: current.date, time: current.time, repeatUntil: current.repeatUntil || current.date, place: current.place, people: String(current.people), partnerId: current.partnerId, notes: current.notes };
      const changes = Object.fromEntries(Object.entries(next).filter(([key, value]) => String(value) !== String(before[key])));
      if (!Object.keys(changes).length) { status.textContent = 'Nada alterado.'; return; }
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      try {
        const result = await api('POST', `/v1/leads/${encodeURIComponent(leadId)}/activities/${encodeURIComponent(activityId)}`, changes);
        status.textContent = [`Alterado: ${result.notifications} lembrete(s) planeado(s) de novo.`, ...result.warnings].join(' ');
        onSaved(result);
      } catch (error) {
        status.textContent = error.message;
      }
      button.disabled = false;
    } },
      field('Data', date), field('Hora', time), field('Todos os dias até (opcional)', until),
      ...(compact ? [] : [field('Local de encontro', place), field('Pessoas', people), field('Parceiro', partner), field('Nota para o parceiro', notes)]),
      h('div', { class: 'actions' }, h('button', { type: 'submit', class: 'primary' }, compact ? 'Reagendar' : 'Guardar alterações')), status);
    box.replaceChildren(form);
  };
  if (activity) build(activity);
  else api('GET', `/v1/leads/${encodeURIComponent(leadId)}/activities`).then(({ activities }) => {
    const found = activities.find(item => item.id === activityId);
    if (found) build(found); else box.replaceChildren(h('p', { class: 'error' }, 'Atividade não encontrada.'));
  }).catch(error => box.replaceChildren(h('p', { class: 'error' }, error.message)));
  return box;
}

function activityPanel(id, lead) {
  const list = h('div', {}, h('p', { class: 'muted' }, 'A carregar…'));
  const status = h('p', { class: 'muted', role: 'status' });
  const refresh = async () => {
    try {
      const { activities, notifications } = await api('GET', `/v1/leads/${id}/activities`);
      list.replaceChildren(...(activities.length ? activities.map(activity => {
        const own = notifications.filter(n => n.activityId === activity.id);
        const count = state => own.filter(n => n.status === state).length;
        const repeat = activity.repeatUntil && activity.repeatUntil !== activity.date ? ` · todos os dias até ${activity.repeatUntil}` : '';
        const who = activity.partnerId === 'bolt' ? 'Bolt' : activity.partnerId || 'sem parceiro';
        const editor = h('div', { hidden: true });
        return h('div', { class: 'activity' },
          h('div', {}, h('strong', {}, `${KIND[activity.kind] ?? activity.kind}: ${activity.title}`), ' ', activity.status === 'CANCELLED' ? pill('Cancelada') : null),
          h('div', { class: 'muted' }, `${activity.date} às ${activity.time}${repeat} · ${activity.place} · ${activity.people} pessoa(s) · ${who}`),
          h('div', { class: 'muted' }, `${count('NOTIFY_PENDING')} lembrete(s) por enviar, ${count('NOTIFY_SENT')} enviado(s), ${count('NOTIFY_PREPARED')} preparado(s)`),
          activity.status === 'CANCELLED' || !isCurator() ? null : h('div', { class: 'actions' },
            h('button', { type: 'button', class: 'secondary', onclick: () => { editor.hidden = !editor.hidden; if (!editor.hidden && !editor.childElementCount) editor.append(activityEditor(id, activity.id, { activity, onSaved: () => { status.textContent = 'Atividade alterada; lembretes por enviar planeados de novo.'; refresh(); } })); } }, 'Editar'),
            h('button', { type: 'button', class: 'secondary', onclick: async () => {
              try {
                await api('POST', `/v1/leads/${id}/activities/${activity.id}/cancel`);
                status.textContent = 'Atividade cancelada; lembretes por enviar cancelados.';
                refresh();
              } catch (error) {
                status.textContent = error.message;
              }
            } }, 'Cancelar')),
          editor);
      }) : [h('p', { class: 'muted' }, 'Sem recolhas nem excursões agendadas.')]));
    } catch (error) {
      list.replaceChildren(h('p', { class: 'error' }, error.message));
    }
  };
  refresh();
  if (!isCurator()) return h('div', {}, list);

  const field = (label, input) => h('label', { class: 'field' }, h('span', {}, label), input);
  const kind = h('select', {}, h('option', { value: 'pickup' }, 'Recolha'), h('option', { value: 'excursion' }, 'Excursão'));
  const title = h('input', { type: 'text', maxlength: '120', placeholder: 'Ex.: Recolha no hotel em tuk-tuk' });
  const place = h('input', { type: 'text', maxlength: '200', placeholder: 'Ex.: Hotel em Alfama' });
  const date = h('input', { type: 'date' });
  const time = h('input', { type: 'time', value: '09:30' });
  const until = h('input', { type: 'date' });
  const people = h('input', { type: 'number', min: '1', max: '30', value: lead.journey.party?.match(/\d+/)?.[0] ?? '2' });
  const partner = h('select', {}, h('option', { value: '' }, 'Sem parceiro'), h('option', { value: 'bolt' }, 'Bolt (o viajante reserva)'));
  const notes = h('input', { type: 'text', maxlength: '500', placeholder: 'Nota para o parceiro (opcional)' });
  const travellerChannel = h('select', {}, Object.entries(CHANNEL).map(([id, label]) => h('option', { value: id }, label)));
  const partnerChannel = h('select', {}, ['whatsapp', 'sms'].map(id => h('option', { value: id }, CHANNEL[id])));
  const reminders = h('div', { class: 'tags' });
  loadPartners().then(({ partners, reminders: options, scorecards = [] }) => {
    // Melhor pontuação primeiro; a pontuação aparece ao lado do nome para ajudar a escolher.
    const scoreOf = id => scorecards.find(card => card.id === id)?.score ?? null;
    const ranked = [...partners].sort((a, b) => (scoreOf(b.id) ?? -1) - (scoreOf(a.id) ?? -1) || a.name.localeCompare(b.name));
    partner.append(...ranked.map(item => h('option', { value: item.id }, `${item.name}${scoreOf(item.id) === null ? '' : ` · pontuação ${scoreOf(item.id)}`}`)));
    reminders.append(...options.map(option => h('label', {}, h('input', { type: 'checkbox', value: option.id, checked: true }), ' ', option.label)));
  }).catch(() => {});
  const form = h('form', { class: 'activity-form', onsubmit: async event => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const result = await api('POST', `/v1/leads/${id}/activities`, {
        kind: kind.value, title: title.value, place: place.value, date: date.value, time: time.value, repeatUntil: until.value || undefined,
        people: people.value, partnerId: partner.value || undefined, notes: notes.value, travellerChannel: travellerChannel.value, partnerChannel: partnerChannel.value,
        reminders: [...reminders.querySelectorAll('input:checked')].map(input => input.value),
      });
      status.textContent = [`Agendado: ${result.notifications} lembrete(s).`, ...result.warnings].join(' ');
      title.value = '';
      notes.value = '';
      refresh();
    } catch (error) {
      status.textContent = error.message;
    }
    button.disabled = false;
  } },
  h('div', { class: 'form-grid' }, field('Tipo', kind), field('Título', title), field('Local de encontro', place), field('Data', date), field('Hora (Lisboa)', time), field('Repetir todos os dias até', until), field('Pessoas', people), field('Parceiro', partner), field('Lembretes ao viajante por', travellerChannel), field('Lembretes ao parceiro por', partnerChannel), field('Nota', notes)),
  h('p', { class: 'muted' }, 'Lembretes'), reminders,
  h('button', { type: 'submit', class: 'primary' }, 'Agendar'));
  return h('div', {}, list, h('details', { class: 'spaced' }, h('summary', {}, 'Agendar recolha ou excursão'), form), status);
}

let current = SITE.start;
let openLeads = [];

// Texto do assistente sem markdown à vista: listas e negrito simples, sempre como texto (nunca HTML).
function plainAnswer(text) {
  const blocks = [];
  let list = null;
  for (const raw of String(text ?? '').split('\n')) {
    const line = raw.replace(/\*\*(.+?)\*\*/g, '$1').replace(/^#{1,6}\s+/, '').trimEnd();
    const item = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (item) { list ??= h('ul'); list.append(h('li', {}, item[1])); continue; }
    if (list) { blocks.push(list); list = null; }
    if (line.trim()) blocks.push(h('p', {}, line));
  }
  if (list) blocks.push(list);
  return blocks;
}

// Assistente: um chat simples num botão fixo no canto inferior direito, em todas as secções.
// Duas conversas: «O meu» (o trabalho da própria pessoa) e «Equipa» (o de todos, para quem segue
// leads). Responde com o que o perfil já vê (POST /v1/assistant) e pode sugerir ações que a pessoa
// clica; nada é enviado sozinho.
function mountAssistant() {
  const chats = { mine: [], team: [] };
  let scope = 'mine';
  const log = h('div', { class: 'chat assistant-log', 'aria-live': 'polite' });
  const status = h('p', { class: 'muted', role: 'status' });
  const question = h('textarea', { rows: '2', maxlength: '1000', 'aria-label': 'Mensagem ao assistente', placeholder: 'Escreva uma mensagem… (Enter envia)' });
  const send = h('button', { type: 'submit', class: 'primary' }, 'Enviar');
  const actionButton = action => {
    if (action.type === 'open') return h('button', { type: 'button', class: 'secondary', onclick: () => goTo(action.tab, action.leadId ? { filter: 'all', lead: action.leadId } : {}) }, action.leadId ? `Abrir o lead ${action.leadId}` : `Abrir ${$('tabs').querySelector(`[data-tab="${action.tab}"]`)?.textContent ?? action.tab}`);
    if (action.type === 'task') return h('button', { type: 'button', class: 'secondary', onclick: () => { taskPrefill = { title: action.title, leadId: action.leadId }; show('work'); } }, `Preparar tarefa: ${action.title}`);
    // Rascunho de resposta: copiado e o lead aberto; nada é enviado.
    return h('div', { class: 'draft' }, h('div', { class: 'muted' }, `Rascunho para ${action.leadId}`), h('p', {}, action.text),
      h('button', { type: 'button', class: 'secondary', onclick: async event => {
        await navigator.clipboard?.writeText(action.text).catch(() => {});
        event.currentTarget.textContent = 'Copiado';
        goTo('leads', { filter: 'all', lead: action.leadId });
      } }, 'Copiar e abrir o lead'));
  };
  const render = () => {
    const history = chats[scope];
    log.replaceChildren(...(history.length ? history.map(turn => turn.role === 'user'
      ? h('div', { class: 'bubble customer' }, turn.text)
      : h('div', { class: 'bubble assistant' }, ...plainAnswer(turn.text),
        turn.actions?.length ? h('div', { class: 'actions' }, turn.actions.map(actionButton)) : null))
      : [h('p', { class: 'muted' }, scope === 'team' ? 'Pergunte sobre o trabalho da equipa: quem tem o quê, o que está sem responsável, o que está atrasado.' : 'Olá! Pergunte o que quiser sobre o seu trabalho, os seus leads ou a intranet.')]));
    log.lastElementChild?.scrollIntoView({ block: 'nearest' });
  };
  const tab = (key, label) => h('button', { type: 'button', class: 'secondary', 'aria-pressed': String(scope === key), onclick: event => {
    scope = key;
    for (const button of event.currentTarget.parentElement.children) button.setAttribute('aria-pressed', String(button === event.currentTarget));
    status.textContent = '';
    render();
    question.focus();
  } }, label);
  const switcher = h('div', { class: 'filters assistant-scope' }, tab('mine', 'O meu assistente'), tab('team', 'Equipa'));
  const form = h('form', { class: 'assistant-form', onsubmit: async event => {
    event.preventDefault();
    const text = question.value.trim();
    if (!text || send.disabled) return;
    const asked = scope;
    const history = chats[asked];
    const earlier = history.map(turn => ({ role: turn.role, text: turn.text }));
    history.push({ role: 'user', text });
    question.value = '';
    render();
    send.disabled = true;
    status.textContent = 'A escrever…';
    try {
      const result = await api('POST', '/v1/assistant', { question: text, history: earlier, scope: asked });
      history.push({ role: 'assistant', text: result.answer, actions: result.actions });
      status.textContent = '';
    } catch (error) {
      status.textContent = error.message;
    }
    send.disabled = false;
    if (asked === scope) render();
    question.focus();
  } }, question, h('div', { class: 'actions' }, send, h('button', { type: 'button', class: 'link', onclick: () => { chats[scope].length = 0; status.textContent = ''; render(); } }, 'Nova conversa')));
  question.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); form.requestSubmit(); } });
  const panel = h('section', { class: 'assistant-panel', id: 'assistant-panel', role: 'dialog', 'aria-label': 'Assistente', hidden: true },
    h('div', { class: 'assistant-head' }, h('strong', {}, 'Assistente'), h('button', { type: 'button', class: 'link', onclick: () => toggle(false) }, 'Fechar')),
    switcher, log, status, form);
  const fab = h('button', { type: 'button', class: 'assistant-fab primary', 'aria-expanded': 'false', 'aria-controls': 'assistant-panel', onclick: () => toggle(panel.hidden) }, 'Assistente');
  function toggle(open) {
    panel.hidden = !open;
    fab.setAttribute('aria-expanded', String(open));
    if (open) {
      // A conversa da equipa é para quem segue leads; os outros perfis só têm a sua.
      switcher.hidden = !can('read');
      if (switcher.hidden) scope = 'mine';
      render();
      question.focus();
    } else fab.focus();
  }
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !panel.hidden) toggle(false); });
  document.body.append(panel, fab);
  askAssistant = (text, wanted = 'mine') => {
    toggle(true);
    scope = can('read') ? wanted : 'mine';
    for (const button of switcher.children) button.setAttribute('aria-pressed', String(button.textContent === (scope === 'team' ? 'Equipa' : 'O meu assistente')));
    render();
    question.value = text.slice(0, 1000);
    form.requestSubmit();
  };
}
// Separadores por grupo e grupos de menu vazios escondidos.
// Contadores na árvore: urgentes em «O meu trabalho», leads sem responsável e mensagens à espera.
async function updateBadges() {
  const set = (key, count) => {
    const button = $('tabs').querySelector(`[data-badge="${key}"]`);
    if (!button) return;
    if (count) button.dataset.count = count > 99 ? '99+' : String(count);
    else delete button.dataset.count;
  };
  const [work, metrics, inbox, security, stuck] = await Promise.all([
    api('GET', '/v1/work').catch(() => null),
    can('read') ? api('GET', '/v1/metrics').catch(() => null) : null,
    isCurator() ? api('GET', '/v1/whatsapp-test').catch(() => null) : null,
    can('security') ? api('GET', '/v1/security').catch(() => null) : null,
    can('read') ? api('GET', `/v1/agenda?view=ops&scope=team&${demoQuery()}`).catch(() => null) : null,
  ]);
  set('work', work?.items.filter(item => ['risk', 'overdue'].includes(item.urgency)).length);
  set('control', metrics?.unassigned);
  // Atrasos críticos: itens com bloqueio parados há 7 dias ou mais (o mesmo critério da própria secção).
  set('overdue', stuck?.items.filter(item => item.blocker && item.since && (Date.now() - Date.parse(item.since)) / DAY_MS >= overdueState.days).length);
  set('whatsapp', inbox?.threads?.filter(thread => thread.waiting).length);
  // Regras legais por preencher (Governança): a bola vermelha mostra quantas faltam.
  set('governance', security?.policies?.fail);
  for (const group of $('tabs').querySelectorAll('details[data-group]')) {
    const total = [...group.querySelectorAll('[data-badge][data-count]')].reduce((sum, item) => sum + (Number.parseInt(item.dataset.count, 10) || 0), 0);
    const summary = group.querySelector('summary');
    if (total) summary.dataset.count = String(total); else delete summary.dataset.count;
  }
}

function applySite() {
  const nav = $('tabs');
  for (const button of nav.querySelectorAll('button[data-tab]')) if (!tabVisible(button.dataset.tab) || ('limited' in button.dataset && can('read'))) button.hidden = true;
  // Ligações para outros sites só para quem lá pode entrar (data-groups).
  for (const link of nav.querySelectorAll('a[data-groups]')) link.hidden = !link.dataset.groups.split(' ').some(group => groupsNow().includes(group));
  for (const group of nav.querySelectorAll('details[data-group]')) group.hidden = ![...group.querySelectorAll('button, a')].some(item => !item.hidden);
}

// A secção vai no #hash: ligações partilhadas e o botão «anterior» do navegador funcionam.
const tabFromHash = () => {
  const tab = decodeURIComponent(location.hash.slice(1).split('?')[0]);
  return views[tab] && tabVisible(tab) ? tab : '';
};

async function show(tab) {
  current = tab;
  if (location.hash.slice(1) !== tab) history.pushState(null, '', `#${tab}`);
  const sub = tab === 'operations' ? operationsState.focus || '' : '';
  for (const button of $('tabs').querySelectorAll('button[data-tab]')) {
    if (button.dataset.tab === tab && (button.dataset.sub || '') === sub) {
      button.setAttribute('aria-current', 'page');
      button.closest('details')?.setAttribute('open', '');
    } else button.removeAttribute('aria-current');
  }
  document.dispatchEvent(new Event('blu:section'));
  const view = $('view');
  view.replaceChildren(h('p', { class: 'muted' }, 'A carregar…'));
  const fresh = h('div');
  try {
    await views[tab](fresh);
    view.replaceChildren(fresh);
  } catch (error) {
    view.replaceChildren(h('p', { class: 'error', role: 'alert' }, error.message));
  }
}

async function start() {
  document.title = SITE.name;
  document.querySelector('.brand span:last-child').textContent = SITE.name;
  $('login').addEventListener('click', () => login());
  // O cartão «Entrar» só aparece quando é preciso agir (erro ou depois de «Sair»);
  // no resto dos casos vai-se direto ao login gerido, sem ecrã intermédio.
  const needSignin = message => { $('signin-error').textContent = message ?? ''; $('signin').hidden = false; };
  if (!config) {
    needSignin('Configuração em falta: esta página só funciona depois do deploy.');
    $('login').disabled = true;
    return;
  }
  try {
    if (config.mock) session.claims = config.mock.claims;
    else if (!(await finishLogin())) {
      // Recarregar a página perde os tokens em memória: volta-se logo ao login gerido,
      // salvo depois de «Sair», para não reentrar sem o pedir.
      const signedOut = sessionStorage.getItem('blu-intranet-signed-out');
      sessionStorage.removeItem('blu-intranet-signed-out');
      if (signedOut) needSignin();
      else await login();
      return;
    }
  } catch (error) {
    needSignin(error.message);
    return;
  }
  $('signin').hidden = true;
  $('view').hidden = false;
  for (const button of $('tabs').querySelectorAll('[data-perm]')) button.hidden = !can(button.dataset.perm);
  applySite();
  $('tabs').hidden = false;
  $('who').hidden = false;
  const roles = groupsNow().map(group => ROLE_LABEL[group]).filter(Boolean).join(', ');
  $('who-name').textContent = [session.claims.name || session.claims.email || '', roles].filter(Boolean).join(' · ');
  $('logout').addEventListener('click', () => {
    if (config.mock) return location.reload();
    sessionStorage.setItem('blu-intranet-signed-out', '1');
    location.assign(logoutUrl(config));
  });
  $('tabs').addEventListener('click', event => {
    const button = event.target.closest('button[data-tab]');
    if (!button) return;
    if (button.dataset.tab === 'operations') operationsState.focus = button.dataset.sub || '';
    show(button.dataset.tab);
    setMenu(false);
  });
  // Grupos da árvore: cada pessoa dobra os que não usa; fica guardado neste navegador.
  const navState = (() => { try { return JSON.parse(localStorage.getItem('blu-nav') || '{}'); } catch { return {}; } })();
  for (const group of $('tabs').querySelectorAll('details[data-group]')) {
    if (group.dataset.group in navState) group.open = navState[group.dataset.group];
    group.addEventListener('toggle', () => { navState[group.dataset.group] = group.open; try { localStorage.setItem('blu-nav', JSON.stringify(navState)); } catch { /* sem armazenamento */ } });
  }
  // Telemóvel: a árvore abre como gaveta a partir de «Menu».
  const setMenu = open => { document.body.classList.toggle('nav-open', open); $('menu').setAttribute('aria-expanded', String(open)); };
  $('menu').hidden = false;
  $('menu').addEventListener('click', () => setMenu(!document.body.classList.contains('nav-open')));
  document.addEventListener('click', event => { if (document.body.classList.contains('nav-open') && !event.target.closest('#tabs, #menu')) setMenu(false); });
  document.addEventListener('keydown', event => event.key === 'Escape' && setMenu(false));
  $('refresh').hidden = false;
  $('refresh').addEventListener('click', () => { show(current); updateBadges(); });
  // Ao voltar ao separador depois de um minuto fora, recarrega a secção aberta.
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hiddenAt = Date.now();
    else if (hiddenAt && Date.now() - hiddenAt > 60_000) show(current);
  });
  window.addEventListener('popstate', () => { const tab = tabFromHash(); if (tab && tab !== current) show(tab); });
  // Proposta vinda do portal: abre o WhatsApp com a mensagem preparada.
  whatsappState.proposal = proposalHandoff();
  // A Mission Control abre no Seguimento de leads; quem não vê clientes entra pelo seu trabalho.
  show(tabFromHash() || (can('leads') ? 'leads' : SITE.start));
  mountAssistant();
  watchLeads();
  updateBadges();
  setInterval(() => { watchLeads(); updateBadges(); }, 60_000);
}

start();
