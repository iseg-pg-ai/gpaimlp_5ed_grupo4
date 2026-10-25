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
const statusPill = status => pill(...(STATUS[status] ?? [status || '—', '']));
const notifyPill = status => pill(...(NOTIFY_STATUS[status] ?? [status, '']));
const groupsNow = () => session.claims?.['cognito:groups'] ?? [];
// Fundadores e curadores alteram leads e agenda; só fundadores gerem acessos.
const isCurator = () => groupsNow().some(group => ['curators', 'founders'].includes(group));
const isFounder = () => groupsNow().includes('founders');
const ROLE_LABEL = { founders: 'Fundador(a)', curators: 'Curador(a)', governance: 'Governança', testers: 'Testes' };
const CHANNEL = { whatsapp: 'WhatsApp', sms: 'SMS', email: 'Email' };

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
    const { manifest, policies, evidence } = await api('GET', '/v1/governance');
    const RESULT = { pass: ['Cumpre', 'ok'], fail: ['Em falta', 'bad'], manual: ['Manual', 'warn'] };
    view.append(
      h('h2', {}, 'Governança e conformidade'),
      h('div', { class: 'notice' }, manifest.note || 'Mapeamento de apoio à auditoria; não constitui certificação.'),
      h('div', { class: 'cards' }, Object.entries(manifest.controls ?? {}).map(([key, value]) => h('div', { class: 'card' }, h('div', { class: 'label' }, key), pill(String(value), (key === 'automaticCustomerContact' ? !value : value) ? 'ok' : 'bad')))),
      h('div', { class: 'panel' }, h('h3', {}, 'Controlos e mapeamento proposto'), h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, 'Controlo'), h('th', {}, 'Evidência'), h('th', {}, 'Referências'))),
        h('tbody', {}, (manifest.mapping ?? []).map(item => h('tr', {}, h('td', {}, item.control), h('td', {}, item.evidence), h('td', {}, item.references.map(ref => h('div', {}, ref)))))))),
      h('p', { class: 'muted' }, `Revisão: ${manifest.reviewCadence === 'quarterly' ? 'trimestral' : manifest.reviewCadence ?? '—'}.`),
      policies ? h('div', { class: 'panel spaced' },
        h('h3', {}, 'Regulação europeia e portuguesa (políticas como código)'),
        h('p', { class: 'muted' }, `${policies.note} Avaliado no deploy em ${when(policies.evaluatedAt)}: ${policies.summary.pass} cumprem, ${policies.summary.fail} em falta, ${policies.summary.manual} manuais.`),
        h('table', {},
          h('thead', {}, h('tr', {}, h('th', {}, 'Regra'), h('th', {}, 'Fonte'), h('th', {}, 'Estado'), h('th', {}, 'Verificação'), h('th', {}, 'Dono'))),
          h('tbody', {}, policies.policies.map(policy => h('tr', {},
            h('td', {}, h('strong', {}, policy.title), h('div', { class: 'muted' }, policy.requirement), pill(policy.jurisdiction), policy.severity === 'blocking' ? pill('bloqueia deploy', 'bad') : null),
            h('td', {}, policy.sources.map(source => h('div', {}, h('a', { href: source.url, target: '_blank', rel: 'noopener noreferrer' }, source.name), h('span', { class: 'muted' }, ` ${source.ref}`)))),
            h('td', {}, pill(...(RESULT[policy.result.status] ?? [policy.result.status, '']))),
            h('td', { class: 'message' }, policy.result.detail),
            h('td', {}, policy.owner)))))) : null,
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
  const roles = groupsNow().map(group => ROLE_LABEL[group]).filter(Boolean).join(', ');
  $('who-name').textContent = [session.claims.name || session.claims.email || '', roles].filter(Boolean).join(' · ');
  $('logout').addEventListener('click', () => (config.mock ? location.reload() : location.assign(logoutUrl(config))));
  $('tabs').addEventListener('click', event => event.target.dataset?.tab && show(event.target.dataset.tab));
  show('dashboard');
}

start();
