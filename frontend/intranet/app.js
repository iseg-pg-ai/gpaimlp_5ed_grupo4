import { challengeFor, claimsOf, expired, loginUrl, logoutUrl, randomString, tokenRequest } from './auth.js';

// Intranet da equipa. Todo o texto vindo da API é inserido com textContent (nunca HTML).
const config = window.BLU_INTRANET;
const session = { idToken: '', claims: null };
const $ = id => document.getElementById(id);

const TAGS = {
  hot: 'Muito interessado', 'proposal-next': 'Preparar proposta', 'needs-info': 'Falta informação',
  vip: 'VIP', 'at-risk': 'Risco de perda', 'not-a-fit': 'Fora do âmbito',
};
const JOURNEY = {
  destination: 'Destino', timeframe: 'Datas', party: 'Viajantes', budget: 'Orçamento', interests: 'Interesses',
  pace: 'Ritmo', socialSource: 'Origem', campaign: 'Campanha', medium: 'Meio', content: 'Conteúdo', stage: 'Etapa',
};
const STAGES = { exploring: 'A explorar', qualifying: 'A qualificar', 'ready-for-curator': 'Pronto para curador', 'curator-follow-up': 'Consentiu seguimento' };
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
const statusPill = status => pill(...(STATUS[status] ?? [status || '—', '']));
const isCurator = () => (session.claims?.['cognito:groups'] ?? []).includes('curators');

async function api(method, path, body) {
  if (config?.mock) return window.BLU_INTRANET_MOCK(method, path, body);
  if (expired(session.claims)) return login();
  const response = await fetch(`${config.api}${path}`, {
    method,
    headers: { authorization: `Bearer ${session.idToken}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
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
  sessionStorage.setItem('blu-intranet-auth', JSON.stringify({ state, verifier }));
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
  history.replaceState(null, '', location.pathname);
  if (!saved.state || saved.state !== params.get('state')) throw new Error('Sessão de login inválida. Entre novamente.');
  const { url, init } = tokenRequest(config, { code, verifier: saved.verifier });
  const response = await fetch(url, init);
  if (!response.ok) throw new Error('Não foi possível concluir o login.');
  const tokens = await response.json();
  session.idToken = tokens.id_token;
  session.claims = claimsOf(tokens.id_token);
  return true;
}

// ---------- Secções ----------

const views = {
  async dashboard(view) {
    const m = await api('GET', '/v1/metrics');
    const card = (value, label) => h('div', { class: 'card' }, h('div', { class: 'value' }, value ?? '—'), h('div', { class: 'label' }, label));
    const breakdown = (title, counts, labels = {}) => {
      const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      const max = Math.max(1, ...entries.map(([, n]) => n));
      return h('div', { class: 'panel' }, h('h3', {}, title), entries.length ? h('table', {}, h('tbody', {}, entries.map(([key, n]) =>
        h('tr', {}, h('td', {}, labels[key]?.[0] ?? labels[key] ?? key), h('td', { style: { width: '45%' } }, h('div', { class: 'bar', style: { width: `${(n / max) * 100}%` } })), h('td', {}, n))))) : h('p', { class: 'muted' }, 'Sem dados.'));
    };
    view.append(
      h('h2', {}, 'Painel de seguimento'),
      h('p', { class: 'muted' }, `Conversas com consentimento. ${m.synthetic} registo(s) de demonstração excluídos dos indicadores.`),
      h('div', { class: 'cards' },
        card(m.open, 'Leads em aberto'), card(m.overdue, 'Em atraso'), card(m.unassigned, 'Sem responsável'),
        card(m.contacted, 'Contactados'), card(m.medianHoursToContact === null ? '—' : `${m.medianHoursToContact} h`, 'Mediana até ao contacto')),
      h('div', { class: 'grid2' }, breakdown('Por estado', m.byStatus, STATUS), breakdown('Por etapa do percurso', m.byStage, STAGES), breakdown('Por origem', m.bySource)),
    );
  },

  async leads(view, state = { filter: 'open', selected: '' }) {
    const { leads } = await api('GET', `/v1/leads?status=${state.filter}`);
    const detail = h('div', { class: 'panel' }, h('p', { class: 'muted' }, 'Escolha um lead para ver a conversa com o chatbot.'));
    const rows = leads;
    const select = id => { state.selected = id; for (const row of view.querySelectorAll('tr.clickable')) row.classList.toggle('selected', row.dataset.id === id); showLead(detail, id, () => rerender()); };
    const rerender = () => { view.replaceChildren(); views.leads(view, state).catch(error => view.append(h('p', { class: 'error' }, error.message))); };
    const filterButton = (key, label) => h('button', { type: 'button', class: 'secondary', 'aria-pressed': String(state.filter === key), onclick: () => { state.filter = key; state.selected = ''; rerender(); } }, label);
    view.append(
      h('h2', {}, 'Seguimento de leads'),
      h('div', { class: 'filters' }, filterButton('open', 'Em aberto'), filterButton('contacted', 'Contactados'), filterButton('all', 'Todos')),
      h('div', { class: 'split' },
        h('div', { class: 'panel' }, rows.length ? h('table', {},
          h('thead', {}, h('tr', {}, h('th', {}, 'Lead'), h('th', {}, 'Estado'), h('th', {}, 'Seguimento'), h('th', {}, 'Responsável'))),
          h('tbody', {}, rows.map(lead => h('tr', { class: `clickable${lead.id === state.selected ? ' selected' : ''}`, 'data-id': lead.id, tabindex: '0', onclick: () => select(lead.id), onkeydown: event => event.key === 'Enter' && select(lead.id) },
            h('td', {}, h('strong', {}, lead.journey.destination || lead.id), h('div', { class: 'muted' }, [lead.journey.timeframe, lead.journey.party].filter(Boolean).join(' · ') || lead.id), lead.synthetic ? pill('demo') : null),
            h('td', {}, statusPill(lead.status)),
            h('td', {}, when(lead.status === 'CONTACTED' ? lead.contactedAt : lead.followUpAt)),
            h('td', {}, lead.assignedTo || h('span', { class: 'muted' }, '—')))))) : h('p', { class: 'muted' }, 'Nenhum lead neste filtro.')),
        detail),
    );
    if (state.selected) select(state.selected);
  },

  async team(view) {
    const { members } = await api('GET', '/v1/team');
    view.append(h('h2', {}, 'Equipa'), h('p', { class: 'muted' }, 'Membros com acesso à intranet e leads em aberto atribuídos a cada um.'),
      h('div', { class: 'panel' }, h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, 'Nome'), h('th', {}, 'Email'), h('th', {}, 'Grupos'), h('th', {}, 'Leads em aberto'), h('th', {}, 'Conta'))),
        h('tbody', {}, members.map(member => h('tr', {},
          h('td', {}, member.name), h('td', {}, member.email), h('td', {}, member.groups.map(group => pill(group))),
          h('td', {}, member.openLeads),
          h('td', {}, member.enabled ? pill(member.status === 'CONFIRMED' ? 'Ativa' : 'Por ativar', member.status === 'CONFIRMED' ? 'ok' : 'warn') : pill('Desativada', 'bad'))))))));
  },

  async operations(view) {
    const ops = await api('GET', '/v1/operations');
    const q = ops.queues;
    const queueCard = (depth, label, badWhen) => h('div', { class: 'card' }, h('div', { class: 'value' }, depth.waiting), h('div', { class: 'label' }, label), depth.inFlight ? h('div', { class: 'muted' }, `${depth.inFlight} em processamento`) : null, badWhen && depth.waiting ? pill('Requer atenção', 'bad') : null);
    view.append(
      h('h2', {}, 'Operações do pipeline'),
      h('p', { class: 'muted' }, `Verificado em ${when(ops.checkedAt)}.`),
      h('div', { class: 'cards' },
        queueCard(q.conversationEvents, 'Eventos por processar'), queueCard(q.failedEvents, 'Eventos falhados (DLQ)', true), queueCard(q.curatorTasks, 'Tarefas para curadores'),
        h('div', { class: 'card' }, h('div', { class: 'value' }, ops.churnReview ? ops.churnReview.queued : '—'), h('div', { class: 'label' }, 'Revisão diária: leads em atraso'), h('div', { class: 'muted' }, ops.churnReview ? `Última execução ${when(ops.churnReview.evaluatedAt)}` : 'Sem execução nos últimos 3 dias'))),
      h('div', { class: 'panel' }, h('h3', {}, 'Workers (últimas 24 h)'), h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, 'Função'), h('th', {}, 'Stack'), h('th', {}, 'Execuções'), h('th', {}, 'Erros'), h('th', {}, 'Limitações'), h('th', {}, 'Estado'), h('th', {}, 'Atualizada'))),
        h('tbody', {}, ops.workers.map(worker => h('tr', {},
          h('td', {}, worker.name.replace(/^BluCosta\w+-/, '')), h('td', {}, worker.stack.replace('BluCosta', '')),
          h('td', {}, worker.invocations24h), h('td', {}, worker.errors24h), h('td', {}, worker.throttles24h),
          h('td', {}, worker.errors24h ? pill('Com erros', 'bad') : worker.invocations24h ? pill('OK', 'ok') : pill('Sem atividade')),
          h('td', {}, when(worker.lastModified))))))),
    );
  },

  async governance(view) {
    const { manifest, evidence } = await api('GET', '/v1/governance');
    view.append(
      h('h2', {}, 'Governança e conformidade'),
      h('div', { class: 'notice' }, manifest.note || 'Mapeamento de apoio à auditoria; não constitui certificação.'),
      h('div', { class: 'cards' }, Object.entries(manifest.controls ?? {}).map(([key, value]) => h('div', { class: 'card' }, h('div', { class: 'label' }, key), pill(String(value), (key === 'automaticCustomerContact' ? !value : value) ? 'ok' : 'bad')))),
      h('div', { class: 'panel' }, h('h3', {}, 'Controlos e mapeamento proposto'), h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, 'Controlo'), h('th', {}, 'Evidência'), h('th', {}, 'Referências'))),
        h('tbody', {}, (manifest.mapping ?? []).map(item => h('tr', {}, h('td', {}, item.control), h('td', {}, item.evidence), h('td', {}, item.references.map(ref => h('div', {}, ref)))))))),
      h('p', { class: 'muted' }, `Revisão: ${manifest.reviewCadence === 'quarterly' ? 'trimestral' : manifest.reviewCadence ?? '—'}.`),
      h('div', { class: 'panel' }, h('h3', {}, 'Evidências recentes'), h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, 'Objeto'), h('th', {}, 'Data'), h('th', {}, 'Tamanho'), h('th', {}, 'ETag'))),
        h('tbody', {}, evidence.map(item => h('tr', {}, h('td', {}, item.key), h('td', {}, when(item.lastModified)), h('td', {}, `${item.size} B`), h('td', { class: 'muted' }, item.etag.slice(0, 12))))))),
    );
  },
};

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
  const chosen = new Set(lead.tags);
  const note = h('textarea', { rows: '3', maxlength: '1000', 'aria-label': 'Nota interna' });
  note.value = lead.curatorNote ?? '';
  const question = h('input', { type: 'text', maxlength: '1000', 'aria-label': 'Pergunta ao assistente interno', value: 'Resume o que este viajante procura e sugere o próximo passo.' });
  const answer = h('div');
  const journey = Object.entries({ ...lead.journey, stage: STAGES[lead.stage] ?? lead.stage }).filter(([, value]) => value);

  // replaceChildren escreveria null como texto; os blocos opcionais são filtrados.
  panel.replaceChildren(...[
    h('h3', {}, lead.journey.destination || lead.id), h('div', {}, statusPill(lead.status), ' ', lead.synthetic ? pill('demo') : null),
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
      lead.status === 'CONTACTED' ? null : act('Marcar contactado', () => api('POST', `/v1/leads/${id}/contacted`))),
    isCurator() ? null : h('p', { class: 'muted' }, 'Só curadores podem alterar leads.'),
    status,
    h('h3', {}, 'Conversa com o chatbot'),
    h('div', { class: 'chat' }, lead.messages.length ? lead.messages.map(message => h('div', { class: `bubble ${['customer', 'assistant'].includes(message.actor) ? message.actor : 'system'}` }, message.text, h('time', {}, `${when(message.at)} · ${message.channel}`))) : h('p', { class: 'muted' }, 'Sem mensagens guardadas.')),
    h('h3', { class: 'spaced' }, 'Etiquetas e nota interna'),
    h('div', { class: 'tags' }, Object.entries(TAGS).map(([key, label]) => {
      const box = h('input', { type: 'checkbox', checked: chosen.has(key), disabled: !isCurator(), onchange: event => (event.target.checked ? chosen.add(key) : chosen.delete(key)) });
      return h('label', {}, box, ' ', label);
    })),
    note,
    h('div', { class: 'actions' }, act('Guardar etiquetas e nota', () => api('PUT', `/v1/leads/${id}/tags`, { tags: [...chosen], note: note.value }))),
    h('h3', {}, 'Perguntar ao assistente interno'),
    question,
    h('div', { class: 'actions' }, h('button', { type: 'button', class: 'secondary', disabled: !isCurator(), onclick: async event => {
      const button = event.currentTarget;
      button.disabled = true;
      answer.replaceChildren(h('p', { class: 'muted' }, 'A pensar…'));
      try {
        const result = await api('POST', `/v1/leads/${id}/ask`, { question: question.value });
        answer.replaceChildren(h('div', { class: 'answer' }, result.answer), h('p', { class: 'muted' }, 'Sugestão gerada por IA: confirme antes de agir ou contactar o cliente.'));
      } catch (error) {
        answer.replaceChildren(h('p', { class: 'error' }, error.message));
      }
      button.disabled = false;
    } }, 'Perguntar')),
    answer,
  ].filter(Boolean));
}

async function show(tab) {
  for (const button of $('tabs').querySelectorAll('button')) {
    if (button.dataset.tab === tab) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
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
  $('login').addEventListener('click', () => login());
  if (!config) {
    $('signin-error').textContent = 'Configuração em falta: esta página só funciona depois do deploy.';
    $('login').disabled = true;
    return;
  }
  try {
    if (config.mock) session.claims = config.mock.claims;
    else if (!(await finishLogin())) return;
  } catch (error) {
    $('signin-error').textContent = error.message;
    return;
  }
  $('signin').hidden = true;
  $('view').hidden = false;
  $('tabs').hidden = false;
  $('who').hidden = false;
  $('who-name').textContent = session.claims.name || session.claims.email || '';
  $('logout').addEventListener('click', () => (config.mock ? location.reload() : location.assign(logoutUrl(config))));
  $('tabs').addEventListener('click', event => event.target.dataset?.tab && show(event.target.dataset.tab));
  show('dashboard');
}

start();
