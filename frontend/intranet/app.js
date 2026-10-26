import { challengeFor, claimsOf, expired, loginUrl, logoutUrl, randomString, refreshRequest, tokenRequest } from './auth.js';

// Intranet da equipa. Todo o texto vindo da API é inserido com textContent (nunca HTML).
const config = window.BLU_INTRANET;
const session = { idToken: '', refreshToken: '', claims: null };
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
const isRecent = iso => Boolean(iso) && Date.now() - Date.parse(iso) < 864e5;
const VERDICT_TONE = { good: 'ok', improve: 'warn', wrong: 'bad' };
const statusPill = status => pill(...(STATUS[status] ?? [status || '—', '']));
const notifyPill = status => pill(...(NOTIFY_STATUS[status] ?? [status, '']));
const groupsNow = () => session.claims?.['cognito:groups'] ?? [];
// Fundadores e curadores alteram leads e agenda; só fundadores gerem acessos.
const isCurator = () => groupsNow().some(group => ['curators', 'founders'].includes(group));
const isFounder = () => groupsNow().includes('founders');
const ROLE_LABEL = { founders: 'Fundador(a)', curators: 'Curador(a)', governance: 'Governança', testers: 'Testes' };
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
const ROLE_PERMS = { founders: ['tasks', 'cases', 'security', 'team-admin', 'feedback'], curators: ['tasks', 'cases'], governance: ['tasks', 'cases', 'security'], testers: [] };
const can = permission => groupsNow().some(group => ROLE_PERMS[group]?.includes(permission));
const DEADLINE = { overdue: ['Fora do prazo', 'bad'], 'due-soon': ['Prazo próximo', 'warn'], 'on-track': ['No prazo', 'ok'], closed: ['Fechado', ''] };
let casePrefill = {};
// Filtro e lead aberto sobrevivem a «Atualizar» e ao regresso ao separador.
const leadsState = { filter: 'open', selected: '' };
let teamCache;
const loadTeam = async () => (teamCache ??= (await api('GET', '/v1/team')).members);
// «Bloqueado» já aparece no estado da tarefa; a urgência só o usa para ordenar e colorir.
const URGENCY = { risk: ['Risco de desistência', 'bad'], overdue: ['Em atraso', 'bad'], soon: ['Prazo próximo', 'warn'] };
const WORK_KIND = { task: 'Tarefa', lead: 'Lead', reminder: 'Lembrete', case: 'Caso' };
const TASK_TONE = { todo: '', doing: 'ok', blocked: 'warn', done: 'ok' };
// Um toque avança a tarefa: o botão principal é o passo seguinte.
const NEXT_STEP = { todo: ['doing', 'Começar'], doing: ['done', 'Feito'], blocked: ['doing', 'Desbloquear'], done: ['todo', 'Reabrir'] };
const workState = { board: 'open', flash: '' };
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

const views = {
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
    const open = item => {
      if (item.kind === 'lead') { leadsState.filter = 'open'; leadsState.selected = item.id; show('leads'); }
      if (item.kind === 'case') show('cases');
      if (item.kind === 'reminder') show('agenda');
    };
    const workItem = item => h('li', { class: `work-item ${item.urgency}` },
      h('div', {}, pill(WORK_KIND[item.kind] ?? item.kind), ' ', urgencyPill(item.urgency), item.task ? [' ', pill(statuses[item.task.status] ?? item.task.status, TASK_TONE[item.task.status])] : null),
      h('strong', {}, item.title),
      ...(item.task ? taskBlock(item.task) : [
        h('div', { class: 'muted' }, [item.detail, item.due ? `até ${item.due}` : ''].filter(Boolean).join(' · ')),
        h('div', { class: 'actions task-actions' }, h('button', { type: 'button', class: 'secondary', onclick: () => open(item) }, 'Abrir')),
      ]));

    // Nova tarefa: para mim ou para um colega, ligada a um lead se fizer sentido.
    const title = h('input', { type: 'text', maxlength: '140', placeholder: 'Ex.: Confirmar tuk-tuk para Algarve e Açores', 'aria-label': 'Tarefa', value: taskPrefill.title ?? '' });
    const owner = h('select', { 'aria-label': 'Responsável' }, members.map(member => h('option', { value: member.email.toLowerCase(), selected: member.email.toLowerCase() === session.claims?.email?.toLowerCase() }, member.name)));
    const due = h('input', { type: 'date', 'aria-label': 'Prazo' });
    const leadId = h('input', { type: 'text', maxlength: '80', placeholder: 'BLU-… (opcional)', 'aria-label': 'Lead', value: taskPrefill.leadId ?? '' });
    const note = h('input', { type: 'text', maxlength: '1000', placeholder: 'Nota (opcional)', 'aria-label': 'Nota' });
    const prefilled = Boolean(taskPrefill.leadId);
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
    const boardButton = (key, label) => h('button', { type: 'button', class: 'secondary', 'aria-pressed': String(state.board === key), onclick: () => { state.board = key; rerender(); } }, label);
    const card = (value, label) => h('div', { class: 'card' }, h('div', { class: 'value' }, value), h('div', { class: 'label' }, label));
    view.append(
      h('h2', {}, 'O meu trabalho'),
      h('p', { class: 'muted' }, 'Tudo o que é seu, por ordem de urgência. Cada alteração aparece no feed da equipa; nada é apagado e só há mensagens automáticas a clientes se estiverem ligadas nas regras de seguimento.'),
      h('div', { class: 'cards' },
        card(items.length, 'Na minha lista'), card(items.filter(item => ['risk', 'overdue'].includes(item.urgency)).length, 'Urgentes ou em atraso'),
        card(mine.filter(item => item.task.status === 'blocked').length, 'Tarefas bloqueadas'), card(items.filter(item => item.kind === 'lead').length, 'Leads que assumi')),
      status,
      can('tasks') ? h('details', { class: 'panel', open: prefilled }, h('summary', {}, 'Nova tarefa'), create) : h('p', { class: 'muted' }, 'Pode ver as tarefas e o feed; só curadores, governança e fundadores as alteram.'),
      h('div', { class: 'split spaced' },
        h('div', {},
          h('div', { class: 'panel' }, h('h3', {}, 'A minha lista'), items.length
            ? h('ul', { class: 'work-list' }, items.map(workItem))
            : h('p', { class: 'muted' }, 'Nada pendente. Assuma um lead em Seguimento ou crie uma tarefa.')),
          h('div', { class: 'panel spaced' }, h('h3', {}, 'Tarefas da equipa'),
            h('div', { class: 'filters' }, boardButton('open', 'Em aberto'), boardButton('done', 'Feitas (arquivo)')),
            tasks.length
              ? h('ul', { class: 'work-list' }, tasks.map(task => h('li', { class: `work-item ${task.urgency ?? ''}` },
                h('div', {}, pill(statuses[task.status] ?? task.status, TASK_TONE[task.status]), ' ', urgencyPill(task.urgency)),
                h('strong', {}, task.title), ...taskBlock(task))))
              : h('p', { class: 'muted' }, state.board === 'open' ? 'Sem tarefas em aberto.' : 'Sem tarefas feitas.'))),
        h('div', { class: 'panel' }, h('h3', {}, 'O que se passa'),
          h('p', { class: 'muted' }, 'Últimos 7 dias. Atualiza ao voltar ao separador ou em «Atualizar».'),
          feed.length
            ? h('ul', { class: 'feed' }, feed.map(entry => h('li', {}, h('strong', {}, entry.byName || entry.by), ` ${entry.text}`, h('time', {}, when(entry.at)))))
            : h('p', { class: 'muted' }, 'Ainda sem movimento.'))),
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
          h('button', { type: 'button', class: 'link', onclick: () => show(alert.tab) }, 'Abrir'))))
        : h('p', { class: 'muted' }, 'Tudo em ordem no pipeline.')),
      h('p', { class: 'muted' }, `Conversas com consentimento. ${m.synthetic} registo(s) de demonstração excluídos dos indicadores.`),
      h('div', { class: 'cards' },
        card(m.open, 'Leads em aberto'), card(m.replyLate ?? 0, `Sem resposta há mais de ${m.replyHours ?? '—'} h`), card(m.overdue, 'Clientes em silêncio há 3 dias'), card(m.unassigned, 'Sem responsável'),
        card(m.contacted, 'Contactados'), card(m.medianHoursToContact === null ? '—' : `${m.medianHoursToContact} h`, 'Mediana até ao contacto')),
      load.length ? h('div', { class: 'panel' }, h('h3', {}, 'Carga da equipa'), h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, 'Pessoa'), h('th', {}, 'Tarefas'), h('th', {}, 'Em atraso'), h('th', {}, 'Bloqueadas'), h('th', {}, 'Leads'))),
        h('tbody', {}, load.map(member => h('tr', {}, h('td', {}, member.name), h('td', {}, member.openTasks ?? 0), countCell(member.overdueTasks ?? 0, 'bad'), countCell(member.blockedTasks ?? 0, 'warn'), h('td', {}, member.openLeads)))))) : null,
      h('div', { class: 'grid2 spaced' }, breakdown('Por estado', m.byStatus, STATUS), breakdown('Por etapa do percurso', m.byStage, STAGES), breakdown('Por origem', m.bySource)),
    );
  },

  async leads(view, state = leadsState) {
    const [{ leads }, settings] = await Promise.all([api('GET', `/v1/leads?status=${state.filter}`), api('GET', '/v1/settings').catch(() => null)]);
    rememberLeads(leads);
    const detail = h('div', { class: 'panel' }, h('p', { class: 'muted' }, 'Escolha um lead para ver a conversa com o chatbot.'));
    // Conversas mais recentes primeiro; os leads em risco continuam no alerta acima da tabela.
    const rows = state.filter === 'contacted' ? leads : [...leads].sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
    const select = id => { state.selected = id; for (const row of view.querySelectorAll('tr.clickable')) row.classList.toggle('selected', row.dataset.id === id); showLead(detail, id, () => rerender()); };
    const rerender = () => { view.replaceChildren(); views.leads(view, state).catch(error => view.append(h('p', { class: 'error' }, error.message))); };
    const filterButton = (key, label) => h('button', { type: 'button', class: 'secondary', 'aria-pressed': String(state.filter === key), onclick: () => { state.filter = key; state.selected = ''; rerender(); } }, label);
    const churning = leads.filter(lead => lead.atRisk);
    view.append(
      h('h2', {}, 'Seguimento de leads'),
      churning.length ? h('div', { class: 'panel risk', role: 'alert' },
        h('h3', {}, `${churning.length} lead(s) em risco de desistência`),
        h('p', {}, 'O cliente disse que vai desistir. Contacte-o já e use «Marcar contactado» para limpar o alerta.'),
        h('div', { class: 'actions' }, churning.map(lead => h('button', { type: 'button', class: 'secondary', onclick: () => select(lead.id) }, lead.journey.destination || lead.id)))) : '',
      settings ? followUpRules(settings, rerender) : null,
      h('div', { class: 'filters' }, filterButton('open', 'Em aberto'), filterButton('contacted', 'Contactados'), filterButton('all', 'Todos')),
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

  async agenda(view) {
    const { notifications } = await api('GET', '/v1/agenda?days=7');
    // Agrupa por dia da atividade e, dentro do dia, por atividade: cada cartão diz em
    // linguagem simples quem recebe o quê, por que canal e quando.
    const dayKey = iso => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date(iso));
    const today = dayKey(new Date().toISOString());
    const tomorrow = dayKey(new Date(Date.now() + 864e5).toISOString());
    const relative = iso => {
      const key = dayKey(iso);
      const prefix = key === today ? 'hoje' : key === tomorrow ? 'amanhã' : key < today ? 'ontem' : lisbonDay(iso);
      return `${prefix} às ${lisbonTime(iso)}`;
    };
    const days = new Map();
    for (const item of notifications) {
      const day = dayKey(item.occurrenceAt);
      const slots = days.get(day) ?? new Map();
      const key = `${item.activityId}|${item.occurrenceAt}`;
      slots.set(key, [...(slots.get(key) ?? []), item]);
      days.set(day, slots);
    }
    const heading = day => (day === today ? 'Hoje' : day === tomorrow ? 'Amanhã' : lisbonDay(`${day}T12:00:00Z`));
    const counts = Object.groupBy ? Object.groupBy(notifications, n => n.status) : {};
    view.append(
      h('h2', {}, 'Agenda'),
      h('p', { class: 'muted' }, 'Recolhas e excursões dos próximos 7 dias e os lembretes de cada uma (hora de Lisboa). Os lembretes saem sozinhos à hora marcada; os "preparados" têm de ser enviados à mão.'),
      h('div', { class: 'cards' },
        h('div', { class: 'card' }, h('div', { class: 'value' }, (counts.NOTIFY_PENDING ?? []).length), h('div', { class: 'label' }, 'Lembretes agendados')),
        h('div', { class: 'card' }, h('div', { class: 'value' }, (counts.NOTIFY_SENT ?? []).length), h('div', { class: 'label' }, 'Enviados (24 h)')),
        h('div', { class: 'card' }, h('div', { class: 'value' }, (counts.NOTIFY_PREPARED ?? []).length), h('div', { class: 'label' }, 'Para enviar à mão')),
        h('div', { class: 'card' }, h('div', { class: 'value' }, [...(counts.NOTIFY_FAILED ?? []), ...(counts.NOTIFY_MISSED ?? [])].length), h('div', { class: 'label' }, 'Falhados ou atrasados'))),
      ...(notifications.length ? [...days].sort(([a], [b]) => a.localeCompare(b)).map(([day, slots]) => h('section', { class: 'day spaced' },
        h('h3', { class: 'day-title' }, heading(day)),
        ...[...slots.values()].sort((a, b) => a[0].occurrenceAt.localeCompare(b[0].occurrenceAt)).map(items => {
          const first = items[0];
          return h('article', { class: 'slot' },
            h('div', { class: 'slot-time' }, lisbonTime(first.occurrenceAt)),
            h('div', { class: 'slot-body' },
              h('strong', {}, `${KIND[first.kind] ?? first.kind}: ${first.title}`),
              h('div', { class: 'muted' }, [first.place, first.people ? `${first.people} pessoa(s)` : '', first.partnerName, first.conversationId].filter(Boolean).join(' · ')),
              h('ul', { class: 'reminders' }, items.sort((a, b) => a.sendAt.localeCompare(b.sendAt)).map(item => h('li', {},
                h('span', {}, `${CHANNEL[item.channel] ?? item.channel} ao ${(AUDIENCE[item.audience] ?? item.audience).toLowerCase()}, ${relative(item.sendAt)}`), ' ',
                notifyPill(item.status),
                item.reason ? h('div', { class: 'muted' }, item.reason) : null,
                h('details', {}, h('summary', { class: 'muted' }, 'Ver mensagem'), h('p', { class: 'message' }, item.text)))))));
        }))) : [h('p', { class: 'muted' }, 'Nada agendado. Abra um lead em Seguimento e use "Agendar recolha ou excursão".')]),
    );
  },

  async partners(view) {
    const { partners } = await loadPartners();
    view.append(h('h2', {}, 'Parceiros'), h('p', { class: 'muted' }, 'Tuk-tuks, transfers e guias que recebem lembretes por WhatsApp. A lista vem de config/partners.json.'),
      h('div', { class: 'panel' }, h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, 'Parceiro'), h('th', {}, 'Tipo'), h('th', {}, 'Zona'), h('th', {}, 'Lugares'), h('th', {}, 'WhatsApp'), h('th', {}, 'Licença'))),
        h('tbody', {}, partners.map(partner => h('tr', {},
          h('td', {}, partner.name, partner.demo ? [' ', pill('demo')] : null), h('td', {}, partner.kind), h('td', {}, partner.area), h('td', {}, partner.seats),
          h('td', {}, partner.whatsapp ? pill('Configurado', 'ok') : pill('Em falta', 'warn')),
          h('td', {}, partner.license?.number ? `${partner.license.type} ${partner.license.number}` : pill(partner.demo ? 'Demo' : 'Em falta', partner.demo ? '' : 'bad'))))))));
  },

  async team(view) {
    const [{ members }, access] = await Promise.all([api('GET', '/v1/team'), api('GET', '/v1/access')]);
    const status = h('p', { class: 'muted', role: 'status' });
    const reload = () => show('team');
    const run = async (fn, done) => {
      try { await fn(); status.textContent = done; reload(); } catch (error) { status.textContent = error.message; }
    };
    const roleOf = member => ['founders', 'curators', 'governance', 'testers'].find(role => member.groups.includes(role)) ?? '';
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
          h('thead', {}, h('tr', {}, h('th', {}, 'Papel'), h('th', {}, 'Ver'), h('th', {}, 'Alterar leads e agenda'), h('th', {}, 'Gerir acessos'))),
          h('tbody', {}, access.roles.map(item => h('tr', {}, h('td', {}, item.label), ...['read', 'leads', 'team-admin'].map(permission => h('td', {}, item.can.includes(permission) ? '✓' : '—'))))))),
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
    const data = await api('GET', '/v1/security');
    const tone = { bad: 'bad', warn: 'warn', info: '' };
    view.append(
      h('h2', {}, 'Segurança'),
      h('p', { class: 'muted' }, 'Estado das proteções da intranet e do pipeline, e o que precisa de atenção.'),
      h('div', { class: 'panel' }, h('h3', {}, 'Requer atenção'), data.findings.length
        ? h('ul', { class: 'reminders' }, data.findings.map(item => h('li', {}, pill(item.level === 'bad' ? 'Urgente' : item.level === 'warn' ? 'Atenção' : 'Info', tone[item.level]), ' ', item.text)))
        : h('p', { class: 'muted' }, 'Nada pendente.')),
      h('div', { class: 'cards' },
        h('div', { class: 'card' }, h('div', { class: 'value' }, data.accounts.active), h('div', { class: 'label' }, 'Contas ativas')),
        h('div', { class: 'card' }, h('div', { class: 'value' }, data.accounts.founders), h('div', { class: 'label' }, 'Fundadores ativos')),
        h('div', { class: 'card' }, h('div', { class: 'value' }, data.accounts.pendingInvites), h('div', { class: 'label' }, 'Convites por aceitar')),
        h('div', { class: 'card' }, h('div', { class: 'value' }, data.accounts.disabled), h('div', { class: 'label' }, 'Contas desativadas')),
        data.policies ? h('div', { class: 'card' }, h('div', { class: 'value' }, `${data.policies.pass}/${data.policies.pass + data.policies.fail + data.policies.manual}`), h('div', { class: 'label' }, 'Políticas cumpridas')) : null),
      h('div', { class: 'panel' }, h('h3', {}, 'Controlos'), h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, 'Área'), h('th', {}, 'Controlo'), h('th', {}, 'Estado'))),
        h('tbody', {}, data.controls.map(item => h('tr', {}, h('td', {}, item.area), h('td', {}, item.control), h('td', {}, item.status === 'on' ? pill('Ativo', 'ok') : pill('Por ativar', 'warn'))))))),
    );
  },

  async operations(view, state = { selected: '' }) {
    const [ops, review] = await Promise.all([api('GET', '/v1/operations'), api('GET', '/v1/conversations').catch(error => ({ error: error.message }))]);
    const q = ops.queues;
    const queueCard = (depth, label, badWhen) => h('div', { class: 'card' }, h('div', { class: 'value' }, depth.waiting), h('div', { class: 'label' }, label), depth.inFlight ? h('div', { class: 'muted' }, `${depth.inFlight} em processamento`) : null, badWhen && depth.waiting ? pill('Requer atenção', 'bad') : null);
    view.append(
      h('h2', {}, 'Operações do pipeline'),
      h('p', { class: 'muted' }, `Verificado em ${when(ops.checkedAt)}.`),
      h('div', { class: 'cards' },
        queueCard(q.conversationEvents, 'Eventos por processar'), queueCard(q.failedEvents, 'Eventos falhados (DLQ)', true),
        h('div', { class: 'card' }, h('div', { class: 'value' }, q.curatorTasks.waiting), h('div', { class: 'label' }, 'Cópias para análise do backoffice'), h('div', { class: 'muted' }, 'Cópias de cada mensagem para a análise externa; as conversas para rever estão abaixo.')),
        h('div', { class: 'card' }, h('div', { class: 'value' }, ops.churnReview ? ops.churnReview.queued : '—'), h('div', { class: 'label' }, 'Revisão diária: leads em atraso'), h('div', { class: 'muted' }, ops.churnReview ? `Última execução ${when(ops.churnReview.evaluatedAt)}` : 'Sem execução nos últimos 3 dias'))),
      h('div', { class: 'panel' }, h('h3', {}, 'Workers (últimas 24 h)'), h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, 'Função'), h('th', {}, 'Stack'), h('th', {}, 'Execuções'), h('th', {}, 'Erros'), h('th', {}, 'Limitações'), h('th', {}, 'Estado'), h('th', {}, 'Atualizada'))),
        h('tbody', {}, ops.workers.map(worker => h('tr', {},
          h('td', {}, worker.name.replace(/^BluCosta\w+-/, '')), h('td', {}, worker.stack.replace('BluCosta', '')),
          h('td', {}, worker.invocations24h), h('td', {}, worker.errors24h), h('td', {}, worker.throttles24h),
          h('td', {}, worker.errors24h ? pill('Com erros', 'bad') : worker.invocations24h ? pill('OK', 'ok') : pill('Sem atividade')),
          h('td', {}, when(worker.lastModified))))))),
      conversationReview(review, state),
    );
  },

  // Escrito para a fundadora: linguagem simples primeiro, ações à mão, detalhe técnico dobrado.
  async governance(view, state = { open: '' }) {
    const { manifest, policies, evidence, valueRules = {} } = await api('GET', '/v1/governance');
    const RESULT = { pass: ['Cumpre', 'ok'], attested: ['Verificada', 'ok'], fail: ['Em falta', 'bad'], manual: ['Verificar à mão', 'warn'] };
    const rules = policies?.policies ?? [];
    const rerender = () => { view.replaceChildren(); views.governance(view, state).catch(error => view.append(h('p', { class: 'error' }, error.message))); };
    const card = (value, label, tone) => h('div', { class: `card ${tone ?? ''}` }, h('div', { class: 'value' }, value), h('div', { class: 'label' }, label));
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
          card(policies.summary.fail, 'em falta: precisam de si', policies.summary.fail ? 'bad' : 'ok'),
          card(policies.summary.manual, 'para verificar à mão', policies.summary.manual ? 'warn' : 'ok'))
        : h('div', { class: 'notice' }, 'O relatório das regras legais ainda não foi publicado. Aparece aqui depois da próxima publicação do backoffice.'),
      topics.length ? h('div', { class: 'topic-buttons' }, topics.map(([topic, list]) => {
        const ok = list.filter(done).length;
        return h('button', { type: 'button', class: `topic-button ${ok === list.length ? 'ok' : 'warn'}`, onclick: () => openTopic(topic) },
          h('span', { class: 'value' }, `${ok}/${list.length}`), h('span', {}, topic));
      })) : null,
      todo.length ? h('div', { class: 'panel risk' },
        h('h3', {}, 'O que precisa de si'),
        h('ul', { class: 'todo' }, todo.map(policy => h('li', {},
          h('strong', {}, ACTIONS[policy.id] ?? policy.requirement), ' ', pill(...RESULT[policy.result.status]),
          h('div', { class: 'muted' }, `${policy.title}. Responsável: ${policy.owner}.`),
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
      await api('POST', '/v1/settings', { replyHours: Number(data.get('replyHours')), auto: Object.fromEntries(Object.keys(settings.types).map(type => [type, data.has(type)])) });
      refresh();
    } catch (error) {
      status.textContent = error.message;
    }
  });
  const on = Object.entries(settings.auto).filter(([, value]) => value).map(([type]) => settings.types[type]?.split(' ')[0]).filter(Boolean);
  return h('details', { class: 'panel spaced' }, h('summary', {}, `Regras de seguimento: responder em ${settings.replyHours} h · automáticas: ${on.length ? on.join(', ') : 'nenhuma'}`),
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
    if (!seenLeads) return rememberLeads(leads);
    const fresh = leads.filter(lead => !seenLeads.has(lead.id) && !lead.synthetic);
    rememberLeads(leads);
    const late = leads.filter(lead => lead.replyLate && !lead.synthetic).length;
    document.title = `${late ? `(${late}) ` : ''}Intranet BLU`;
    if (!fresh.length) return;
    const text = fresh.length === 1 ? `Novo lead: ${fresh[0].journey.destination || fresh[0].id}` : `${fresh.length} novos leads`;
    toast(text, () => { leadsState.filter = 'open'; leadsState.selected = fresh[0].id; show('leads'); });
    if ('Notification' in window && Notification.permission === 'granted') new Notification('Intranet BLU', { body: text, icon: 'favicon.svg' });
    if (['leads', 'work', 'dashboard'].includes(current)) show(current);
  } catch {
    // Sem rede ou sessão expirada: tenta no minuto seguinte.
  }
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
  const chosen = new Set(lead.tags);
  const note = h('textarea', { rows: '3', maxlength: '1000', 'aria-label': 'Nota interna' });
  note.value = lead.curatorNote ?? '';
  const question = h('input', { type: 'text', maxlength: '1000', 'aria-label': 'Pergunta ao assistente interno', value: 'Resume o que este viajante procura e sugere o próximo passo.' });
  const answer = h('div');
  const journey = Object.entries({ ...lead.journey, stage: STAGES[lead.stage] ?? lead.stage }).filter(([, value]) => value);

  // replaceChildren escreveria null como texto; os blocos opcionais são filtrados.
  panel.replaceChildren(...[
    h('h3', {}, lead.journey.destination || lead.id), h('div', {}, statusPill(lead.status), ' ', lead.synthetic ? pill('demo') : null),
    lead.atRisk ? h('p', { class: 'error', role: 'alert' }, `Sinal de desistência em ${when(lead.churnSignalAt)} («${lead.churnSignal}»). Contactar já.`) : null,
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
    isCurator() ? null : h('p', { class: 'muted' }, 'Só curadores e fundadores podem alterar leads.'),
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
    can('cases') ? h('h3', { class: 'spaced' }, 'Reclamações e litígios') : null,
    can('cases') ? leadCases(id) : null,
    h('h3', { class: 'spaced' }, 'Agenda do viajante'),
    activityPanel(id, lead),
    h('h3', { class: 'spaced' }, 'Perguntar ao assistente interno'),
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
      h('td', {}, item.lastFeedback ? [pill(review.verdicts[item.lastFeedback.verdict] ?? item.lastFeedback.verdict, VERDICT_TONE[item.lastFeedback.verdict]), item.feedbackCount > 1 ? h('div', { class: 'muted' }, `${item.feedbackCount} notas`) : null] : h('span', { class: 'muted' }, 'Por rever')))))) : h('p', { class: 'muted' }, 'Ainda não há conversas guardadas.');
  let table = list();
  panel.append(h('div', { class: 'split' }, h('div', {}, table), detail));
  if (state.selected) select(state.selected);
  return panel;
}

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
        return h('div', { class: 'activity' },
          h('div', {}, h('strong', {}, `${KIND[activity.kind] ?? activity.kind}: ${activity.title}`), ' ', activity.status === 'CANCELLED' ? pill('Cancelada') : null),
          h('div', { class: 'muted' }, `${activity.date} às ${activity.time}${repeat} · ${activity.place} · ${activity.people} pessoa(s) · ${who}`),
          h('div', { class: 'muted' }, `${count('NOTIFY_PENDING')} lembrete(s) por enviar, ${count('NOTIFY_SENT')} enviado(s), ${count('NOTIFY_PREPARED')} preparado(s)`),
          activity.status === 'CANCELLED' || !isCurator() ? null : h('button', { type: 'button', class: 'secondary', onclick: async () => {
            try {
              await api('POST', `/v1/leads/${id}/activities/${activity.id}/cancel`);
              status.textContent = 'Atividade cancelada; lembretes por enviar cancelados.';
              refresh();
            } catch (error) {
              status.textContent = error.message;
            }
          } }, 'Cancelar'));
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
  loadPartners().then(({ partners, reminders: options }) => {
    partner.append(...partners.map(item => h('option', { value: item.id }, item.name)));
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

let current = 'work';
async function show(tab) {
  current = tab;
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
    else if (!(await finishLogin())) {
      // Recarregar a página perde os tokens em memória: volta-se logo ao login gerido,
      // salvo depois de «Sair», para não reentrar sem o pedir.
      const signedOut = sessionStorage.getItem('blu-intranet-signed-out');
      sessionStorage.removeItem('blu-intranet-signed-out');
      if (!signedOut) await login();
      return;
    }
  } catch (error) {
    $('signin-error').textContent = error.message;
    return;
  }
  $('signin').hidden = true;
  $('view').hidden = false;
  for (const button of $('tabs').querySelectorAll('[data-perm]')) button.hidden = !can(button.dataset.perm);
  $('tabs').hidden = false;
  $('who').hidden = false;
  const roles = groupsNow().map(group => ROLE_LABEL[group]).filter(Boolean).join(', ');
  $('who-name').textContent = [session.claims.name || session.claims.email || '', roles].filter(Boolean).join(' · ');
  $('logout').addEventListener('click', () => {
    if (config.mock) return location.reload();
    sessionStorage.setItem('blu-intranet-signed-out', '1');
    location.assign(logoutUrl(config));
  });
  $('tabs').addEventListener('click', event => event.target.dataset?.tab && show(event.target.dataset.tab));
  $('refresh').hidden = false;
  $('refresh').addEventListener('click', () => show(current));
  // Ao voltar ao separador depois de um minuto fora, recarrega a secção aberta.
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hiddenAt = Date.now();
    else if (hiddenAt && Date.now() - hiddenAt > 60_000) show(current);
  });
  show('work');
  watchLeads();
  setInterval(watchLeads, 60_000);
}

start();
