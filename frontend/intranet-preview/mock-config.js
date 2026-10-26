// Só para pré-visualização local (excluído do deploy): dados fictícios, sem AWS nem login.
window.BLU_INTRANET = { mock: { claims: { name: 'Fundadora de teste', email: 'fundadora@example.com', 'cognito:username': 'u-founder', 'cognito:groups': ['founders'] } } };
const hours = n => new Date(Date.now() + n * 36e5).toISOString();
const leads = [
  { id: 'BLU-DEMO000000000004', status: 'PENDING', followUpAt: hours(70), lastActivityAt: hours(-1), channel: 'website', messageCount: 9, synthetic: false, stage: 'curator-follow-up', consentAt: hours(-3), assignedTo: 'fundadora@example.com', assignedAt: hours(-1), journey: { destination: 'Algarve e Açores', timeframe: 'meados de março 2027', party: '2 adultos', budget: '3000–6000 EUR' }, tags: [], churnSignalAt: hours(-1), churnSignal: 'give up', atRisk: true },
  { id: 'BLU-DEMO000000000001', status: 'QUEUED_FOR_REVIEW', followUpAt: hours(-20), lastActivityAt: hours(-90), channel: 'website', messageCount: 4, synthetic: false, stage: 'curator-follow-up', consentAt: hours(-92), journey: { destination: 'Costa norte e Algarve', timeframe: '25 nov – 10 dez 2026', party: '3 adultos', budget: '3000 EUR', interests: 'surf, vinho, vegano', pace: 'ativo', socialSource: 'instagram' }, tags: ['hot'], curatorNote: 'Prefere contacto por email.' },
  { id: 'BLU-DEMO000000000002', status: 'PENDING', followUpAt: hours(30), lastActivityAt: hours(-40), channel: 'website', messageCount: 6, synthetic: false, stage: 'ready-for-curator', consentAt: hours(-41), assignedTo: 'curador@example.com', assignedAt: hours(-2), journey: { destination: 'Lisboa e Sintra', timeframe: 'maio 2027', party: 'casal', interests: 'história romana' }, tags: [] },
  { id: 'BLU-DEMO000000000003', status: 'CONTACTED', followUpAt: hours(-50), contactedAt: hours(-60), lastActivityAt: hours(-80), channel: 'whatsapp', messageCount: 3, synthetic: true, consentAt: hours(-85), journey: { destination: 'Douro' }, tags: ['vip'] },
];
const messages = [
  { at: hours(-92), actor: 'customer', channel: 'website', eventType: 'conversation.message.recorded', text: 'Viagem de surf na costa norte e Algarve, 3 adultos, 3000 EUR. demo@example.com' },
  { at: hours(-92), actor: 'assistant', channel: 'website', eventType: 'conversation.message.recorded', text: 'Que bom! Posso pedir a um curador que entre em contacto por email?' },
  { at: hours(-91), actor: 'system', channel: 'website', eventType: 'lead.consent.granted', text: 'O visitante aceitou ser contactado por um curador.' },
];
// Tarefas e feed em memória: as alterações duram até recarregar a página.
const day = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const TASK_STATUS = { todo: 'Por fazer', doing: 'Em curso', blocked: 'Bloqueado', done: 'Feito' };
const names = { 'fundadora@example.com': 'Fundadora de teste', 'curador@example.com': 'Curador de teste' };
const tasks = [
  { id: 'task-0001', partition: 'BLU-DEMO000000000004', leadId: 'BLU-DEMO000000000004', leadLabel: 'Algarve e Açores', title: 'Confirmar tuk-tuk para Algarve e Açores', note: '', owner: 'fundadora@example.com', due: day(-1), status: 'doing', blockedReason: '', updatedAt: hours(-5) },
  { id: 'task-0002', partition: 'TASKS-UNLINKED', leadId: '', title: 'Resposta do hotel em Sintra', note: 'Pedido de 2 quartos para maio.', owner: 'fundadora@example.com', due: day(2), status: 'blocked', blockedReason: 'À espera do parceiro', updatedAt: hours(-3) },
  { id: 'task-0003', partition: 'BLU-DEMO000000000002', leadId: 'BLU-DEMO000000000002', leadLabel: 'Lisboa e Sintra', title: 'Preparar proposta Lisboa e Sintra', note: '', owner: 'curador@example.com', due: day(5), status: 'todo', blockedReason: '', updatedAt: hours(-8) },
];
const feed = [
  { at: hours(-3), by: 'fundadora@example.com', byName: 'Fundadora de teste', text: 'bloqueou «Resposta do hotel em Sintra»: À espera do parceiro' },
  { at: hours(-5), by: 'curador@example.com', byName: 'Curador de teste', text: 'criou «Confirmar tuk-tuk para Algarve e Açores» para Fundadora de teste' },
];
const taskLog = {};
const AUTO_TYPES = { thanks: 'Agradecimento logo após o consentimento', nudge: 'Reativação quando o cliente fica 3 dias em silêncio depois do contacto', reminders: 'Lembretes de recolhas e excursões aprovadas' };
const settings = { replyHours: 4, auto: { thanks: false, nudge: false, reminders: true }, updatedBy: '', updatedAt: '' };
const attestations = {};
const VERDICTS = { good: 'Boa resposta', improve: 'A melhorar', wrong: 'Errada' };
const feedbackGiven = { 'BLU-DEMO000000000001': [{ verdict: 'improve', note: 'Devia ter perguntado as datas antes de falar de hotéis.', by: 'fundadora@example.com', byName: 'Fundadora de teste', at: hours(-20) }] };
const dueState = task => (task.status === 'done' ? 'done' : !task.due ? 'none' : task.due < day(0) ? 'overdue' : task.due <= day(2) ? 'soon' : 'on-track');
const withState = task => {
  const state = dueState(task);
  return { ...task, dueState: state, urgency: task.status === 'blocked' ? 'blocked' : state === 'overdue' ? 'overdue' : state === 'soon' ? 'soon' : 'normal' };
};
const rank = { risk: 0, overdue: 1, blocked: 2, soon: 3, normal: 4 };
const byUrgency = (a, b) => rank[a.urgency] - rank[b.urgency] || (a.due || '9999').localeCompare(b.due || '9999');
const announce = text => feed.unshift({ at: new Date().toISOString(), by: 'fundadora@example.com', byName: 'Fundadora de teste', text });
function taskRoutes(method, path, body = {}) {
  const me = 'fundadora@example.com';
  if (path === '/v1/work') return { statuses: TASK_STATUS, today: day(0), items: [
    ...tasks.filter(task => task.owner === me && task.status !== 'done').map(withState).map(task => ({ kind: 'task', id: task.id, partition: task.partition, title: task.title, due: task.due, urgency: task.urgency, task })),
    { kind: 'lead', id: 'BLU-DEMO000000000004', partition: 'BLU-DEMO000000000004', title: 'Algarve e Açores', due: day(3), detail: 'meados de março 2027 · 2 adultos', urgency: 'risk' },
    { kind: 'reminder', id: 'NOTIFY#a1', partition: 'BLU-DEMO000000000001', title: 'Recolha no hotel', due: day(0), detail: 'Sem contacto para este canal; enviar manualmente.', urgency: 'overdue' },
    { kind: 'case', id: 'case-0001', partition: 'BLU-DEMO000000000001', title: 'Recolha atrasada 40 min', due: '2026-11-10', detail: 'Livro de Reclamações', urgency: 'normal' },
  ].sort(byUrgency) };
  if (path.startsWith('/v1/tasks?')) {
    const done = path.includes('done');
    return { statuses: TASK_STATUS, today: day(0), tasks: tasks.filter(task => (task.status === 'done') === done).map(withState).sort(done ? (a, b) => b.updatedAt.localeCompare(a.updatedAt) : byUrgency) };
  }
  if (path === '/v1/tasks' && method === 'POST') {
    if (!body.title?.trim()) throw new Error('Indique o que há a fazer.');
    const task = { id: `task-${String(tasks.length + 1).padStart(4, '0')}`, partition: body.leadId || 'TASKS-UNLINKED', leadId: body.leadId || '', leadLabel: '', title: body.title.trim(), note: body.note || '', owner: body.owner || me, due: body.due || '', status: 'todo', blockedReason: '', updatedAt: new Date().toISOString() };
    tasks.push(task);
    taskLog[task.id] = [{ at: task.updatedAt, by: me, text: `Tarefa criada para ${names[task.owner] ?? task.owner}.` }];
    announce(task.owner === me ? `criou «${task.title}»` : `criou «${task.title}» para ${names[task.owner] ?? task.owner}`);
    return { taskId: task.id, partition: task.partition };
  }
  const match = path.match(/\/tasks\/(task-\d+)$/);
  if (!match) return undefined;
  const task = tasks.find(item => item.id === match[1]);
  if (method === 'GET') return { ...withState(task), log: taskLog[task.id] ?? [{ at: task.updatedAt, by: task.owner, text: 'Tarefa criada.' }] };
  if (body.status === 'blocked' && !body.blockedReason?.trim()) throw new Error('Diga o que está a bloquear a tarefa.');
  let text = `comentou «${task.title}»`;
  if (body.status) { task.status = body.status; task.blockedReason = body.status === 'blocked' ? body.blockedReason : ''; text = body.status === 'blocked' ? `bloqueou «${task.title}»: ${body.blockedReason}` : `moveu «${task.title}» para ${TASK_STATUS[body.status]}`; }
  if (body.owner) { task.owner = body.owner; text = `passou «${task.title}» a ${names[body.owner] ?? body.owner}`; }
  if (body.due !== undefined) { task.due = body.due; text = `mudou o prazo de «${task.title}» para ${body.due || 'sem prazo'}`; }
  task.updatedAt = new Date().toISOString();
  (taskLog[task.id] ??= []).unshift({ at: task.updatedAt, by: me, text: `Fundadora de teste ${text}.${body.note ? ` ${body.note}` : ''}` });
  announce(text);
  return null;
}

window.BLU_INTRANET_MOCK = async (method, path, body) => {
  await new Promise(resolve => setTimeout(resolve, 150));
  const taskResult = taskRoutes(method, path, body);
  if (taskResult !== undefined) return taskResult;
  if (path === '/v1/feed') return { feed, checkedAt: new Date().toISOString() };
  if (path === '/v1/settings' && method === 'POST') { Object.assign(settings, body, { auto: { ...settings.auto, ...body.auto }, updatedBy: 'fundadora@example.com', updatedAt: new Date().toISOString() }); announce('alterou as regras de seguimento'); return { ...settings, types: AUTO_TYPES }; }
  if (path === '/v1/settings') return { ...settings, types: AUTO_TYPES };
  if (path === '/v1/governance/attestations') {
    if (!body.note || body.note.trim().length < 5) throw new Error('Descreva em poucas palavras o que confirmou.');
    attestations[body.policyId] = { at: new Date().toISOString(), by: 'fundadora@example.com', byName: 'Fundadora de teste', note: body.note, proofUrl: body.proofUrl, value: body.value, validUntil: hours(90 * 24) };
    return { validUntil: hours(90 * 24) };
  }
  if (path === '/v1/alerts') return { alerts: [{ level: 'bad', text: '1 lead(s) disseram que vão desistir: contactar já.', tab: 'leads' }, { level: 'bad', text: '2 evento(s) do chat falharam e estão na fila de erros: verificar o processamento.', tab: 'operations' }, { level: 'warn', text: 'Nenhum lead das redes sociais nos últimos 7 dias: verificar as ligações das campanhas e a ponte /connect.', tab: 'operations' }, { level: 'warn', text: '1 lembrete(s) preparado(s) para enviar à mão.', tab: 'agenda' }] };
  const types = { feedback: { label: 'Feedback' }, complaint: { label: 'Reclamação' }, livro: { label: 'Livro de Reclamações' }, legal: { label: 'Litígio / contencioso' } };
  const cases = [
    { id: 'case-0001', partition: 'BLU-DEMO000000000001', leadId: 'BLU-DEMO000000000001', type: 'livro', title: 'Recolha atrasada 40 min', channel: 'livro', receivedOn: '2026-10-20', deadline: '2026-11-10', owner: 'fundadora@example.com', priority: 'high', caseStatus: 'in-progress', deadlineState: 'on-track', createdBy: 'fundadora@example.com', createdAt: hours(-120), resolution: '', reference: 'Folha 12345', description: 'O cliente esperou 40 minutos pelo tuk-tuk.' },
    { id: 'case-0002', partition: 'CASES-UNLINKED', leadId: '', type: 'legal', title: 'Pedido de reembolso por via judicial', channel: 'lawyer', receivedOn: '2026-09-01', deadline: '2026-10-24', owner: '', priority: 'high', caseStatus: 'new', deadlineState: 'overdue', createdBy: 'fundadora@example.com', createdAt: hours(-500), resolution: '', reference: 'Proc. 123/26', description: '' },
  ];
  if (path.startsWith('/v1/cases') && method === 'GET') return { cases: path.includes('closed') ? [] : cases, types, statuses: { new: 'Novo', 'in-progress': 'Em curso', 'waiting-customer': 'À espera do cliente', resolved: 'Resolvido', closed: 'Fechado' }, channels: { email: 'Email', phone: 'Telefone', livro: 'Livro de Reclamações', lawyer: 'Advogado / tribunal', other: 'Outro' }, today: '2026-10-25' };
  if (path === '/v1/cases') return { caseId: 'case-0003', partition: 'CASES-UNLINKED', deadline: '2026-11-13' };
  if (path.includes('/cases/case-') && method === 'GET') return { ...cases.find(item => path.includes(item.id)), log: [{ at: hours(-100), by: 'fundadora@example.com', text: 'Caso aberto (Livro de Reclamações); prazo 2026-11-10.' }] };
  if (path.includes('/cases/case-')) return null;
  if (path.endsWith('/cases')) return { cases: cases.filter(item => path.includes(item.partition)) };
  if (path === '/v1/security') return {
    findings: [{ level: 'warn', text: 'Só 1 fundador(a) ativo(s): recomenda-se pelo menos 2 para não perder o acesso de gestão.' }, { level: 'bad', text: '1 caso(s) de reclamação ou litígio fora do prazo.' }],
    accounts: { total: 2, active: 2, disabled: 0, pendingInvites: 1, founders: 1 }, policies: { pass: 10, fail: 2, manual: 3 },
    controls: [{ area: 'Identidade', control: 'Login Cognito com MFA obrigatório', status: 'on' }, { area: 'Proteção web', control: 'AWS WAF à frente da intranet e da API', status: 'off' }],
  };
  if (path === '/v1/partners') return {
    partners: [
      { id: 'tuk-alfama', name: 'Tuk-tuk Alfama (demo)', kind: 'tuk-tuk', area: 'Lisboa: Alfama, Baixa', seats: 6, whatsapp: '', demo: true },
      { id: 'transfer-sintra', name: 'Transfer Sintra', kind: 'transfer', area: 'Sintra, Cascais', seats: 8, whatsapp: '351900000000', license: { type: 'RNAAT', number: '0000/2020' } },
    ],
    reminders: [
      { id: 'traveller-evening', label: 'Viajante: véspera às 18:00' }, { id: 'traveller-1h', label: 'Viajante: 1 h antes' },
      { id: 'partner-evening', label: 'Parceiro: véspera às 18:00' }, { id: 'partner-2h', label: 'Parceiro: 2 h antes' },
    ],
  };
  if (path.startsWith('/v1/agenda')) return { notifications: [
    { conversationId: 'BLU-DEMO000000000001', activityId: 'a1', audience: 'partner', kind: 'pickup', title: 'Recolha no hotel', sendAt: hours(-2), occurrenceAt: hours(14), status: 'NOTIFY_PREPARED', reason: 'Sem contacto para este canal; enviar manualmente.', hasNumber: false, channel: 'whatsapp', place: 'Hotel Alfama', people: 3, partnerName: 'Tuk-tuk Alfama (demo)', text: 'BLU Costa: recolha "Recolha no hotel" em Hotel Alfama, amanhã 09:30, 3 pessoa(s). Responda OK para confirmar.' },
    { conversationId: 'BLU-DEMO000000000001', activityId: 'a1', audience: 'traveller', kind: 'pickup', title: 'Recolha no hotel', sendAt: hours(13), occurrenceAt: hours(14), status: 'NOTIFY_PENDING', hasNumber: true, channel: 'email', place: 'Hotel Alfama', people: 3, partnerName: 'Tuk-tuk Alfama (demo)', text: 'BLU Costa reminder: your pickup "Recolha no hotel" at Hotel Alfama, Tue 09:30, 3 people.' },
    { conversationId: 'BLU-DEMO000000000002', activityId: 'a2', audience: 'traveller', kind: 'excursion', title: 'Sintra e Cabo da Roca', sendAt: hours(30), occurrenceAt: hours(40), status: 'NOTIFY_PENDING', hasNumber: true, channel: 'sms', place: 'Rossio', people: 2, partnerName: 'Bolt', text: 'BLU Costa reminder: your excursion "Sintra e Cabo da Roca" at Rossio, Wed 10:00, 2 people. Please book a Bolt ride to arrive on time: https://bolt.eu/' },
  ] };
  if (path.endsWith('/activities') && method === 'POST') return { activityId: 'a3', notifications: 4, warnings: ['Tuk-tuk Alfama (demo) não tem número WhatsApp: os lembretes ao parceiro ficam preparados.'] };
  if (path.endsWith('/activities')) return {
    activities: [{ id: 'a1', kind: 'pickup', title: 'Recolha no hotel', place: 'Hotel Alfama', date: '2026-11-02', time: '09:30', repeatUntil: '2026-11-05', people: 3, partnerId: 'tuk-alfama', status: 'ACTIVE', reminders: [] }],
    notifications: [{ activityId: 'a1', status: 'NOTIFY_PENDING' }, { activityId: 'a1', status: 'NOTIFY_PREPARED' }],
  };
  if (path.endsWith('/cancel')) return null;
  if (path === '/v1/team/invite' || path.startsWith('/v1/team/u-')) return null;
  if (path === '/v1/access') return {
    roles: [
      { id: 'founders', label: 'Fundador(a)', can: ['read', 'leads', 'team-admin'] }, { id: 'curators', label: 'Curador(a)', can: ['read', 'leads'] },
      { id: 'governance', label: 'Governança', can: ['read'] }, { id: 'testers', label: 'Testes', can: ['read'] },
    ],
    identity: { provider: 'Amazon Cognito', mfa: 'Obrigatório (aplicação de autenticação)', passwordPolicy: 'Mínimo 12 caracteres, maiúsculas, minúsculas e números', selfSignUp: false, session: 'Token de 1 h; sessão máxima de 12 h' },
    secrets: [{ name: 'WhatsAppChannelSecret', purpose: 'WhatsApp Business (envio de lembretes e mensagens)', lastChanged: hours(-200), rotation: false }],
  };
  if (path.startsWith('/v1/metrics')) return { total: 2, synthetic: 1, open: 2, overdue: 1, contacted: 0, unassigned: 1, medianHoursToContact: null, replyLate: 2, replyHours: settings.replyHours, byStatus: { QUEUED_FOR_REVIEW: 1, PENDING: 1 }, byStage: { 'curator-follow-up': 1, 'ready-for-curator': 1 }, bySource: { instagram: 1, website: 1 } };
  if (path.startsWith('/v1/leads?')) {
    const filter = new URLSearchParams(path.split('?')[1]).get('status');
    const reply = lead => (lead.status === 'CONTACTED' ? {} : { replyDueAt: new Date(Date.parse(lead.lastActivityAt) + settings.replyHours * 36e5).toISOString(), replyLate: Date.parse(lead.lastActivityAt) + settings.replyHours * 36e5 < Date.now() });
    return { leads: leads.filter(lead => filter === 'all' || (filter === 'contacted') === (lead.status === 'CONTACTED')).map(lead => ({ ...lead, ...reply(lead) })) };
  }
  if (path.endsWith('/feedback')) {
    const id = decodeURIComponent(path.split('/')[3]);
    if (method === 'POST') { (feedbackGiven[id] ??= []).unshift({ ...body, by: 'fundadora@example.com', byName: 'Fundadora de teste', at: new Date().toISOString() }); announce(`deu feedback à conversa ${id}`); return { at: new Date().toISOString() }; }
    return { verdicts: VERDICTS, feedback: feedbackGiven[id] ?? [] };
  }
  if (path === '/v1/conversations') return { verdicts: VERDICTS, conversations: [...leads].sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt)).map(lead => ({
    id: lead.id, journey: lead.journey, stage: lead.stage, status: lead.status, synthetic: lead.synthetic, messageCount: lead.messageCount, lastActivityAt: lead.lastActivityAt,
    feedbackCount: (feedbackGiven[lead.id] ?? []).length, lastFeedback: (feedbackGiven[lead.id] ?? [])[0] ?? null,
  })) };
  if (path.endsWith('/ask')) return { answer: 'O viajante procura uma viagem ativa de surf com vinho e comida vegana. Próximo passo: enviar email com duas propostas.', sourceIds: [], requiresHumanApproval: true };
  if (method !== 'GET') return null;
  if (path.startsWith('/v1/leads/')) {
    const lead = leads.find(item => item.id === decodeURIComponent(path.split('/')[3]));
    return { ...lead, messages, emails: ['demo@example.com'], phones: [] };
  }
  if (path === '/v1/team') return { members: [
    ...[
      { username: 'u-founder', name: 'Fundadora de teste', email: 'fundadora@example.com', groups: ['founders'], status: 'CONFIRMED', enabled: true, openLeads: 1 },
      { username: 'u-curator', name: 'Curador de teste', email: 'curador@example.com', groups: ['curators'], status: 'CONFIRMED', enabled: true, openLeads: 1 },
      { username: 'u-tester', name: 'Pessoa de testes', email: 'testes@example.com', groups: ['testers'], status: 'FORCE_CHANGE_PASSWORD', enabled: true, openLeads: 0 },
    ].map(member => {
      const own = tasks.filter(task => task.owner === member.email && task.status !== 'done').map(withState);
      return { ...member, openTasks: own.length, overdueTasks: own.filter(task => task.dueState === 'overdue').length, blockedTasks: own.filter(task => task.status === 'blocked').length };
    }),
  ] };
  if (path === '/v1/operations') return { checkedAt: hours(0), queues: { conversationEvents: { waiting: 0, inFlight: 0 }, failedEvents: { waiting: 1, inFlight: 0 }, curatorTasks: { waiting: 2, inFlight: 0 } }, churnReview: { evaluatedAt: hours(-3), queued: 1 }, workers: [
    { name: 'BluCostaFrontend-BedrockChat', stack: 'BluCostaFrontend', invocations24h: 42, errors24h: 0, throttles24h: 0, lastModified: hours(-5) },
    { name: 'BluCostaFrontend-EventProcessor', stack: 'BluCostaFrontend', invocations24h: 18, errors24h: 1, throttles24h: 0, lastModified: hours(-5) },
    { name: 'BluCostaBackoffice-ChurnFollowUpEvaluator', stack: 'BluCostaBackoffice', invocations24h: 1, errors24h: 0, throttles24h: 0, lastModified: hours(-2) },
  ] };
  if (path === '/v1/governance') {
    const manifest = await fetch('../../config/governance-controls.json').then(response => response.json()).catch(() => ({ controls: {}, mapping: [] }));
    const registry = await fetch('../../config/policies.json').then(response => response.json()).catch(() => ({ note: 'Pré-visualização sem acesso a config/policies.json.', policies: [] }));
    const result = policy => (policy.enforcement === 'manual' ? { status: 'manual', detail: 'Controlo manual.' } : ['rnavt-registration', 'adr-information'].includes(policy.id) ? { status: 'fail', detail: 'Por preencher em config/policies.json.' } : { status: 'pass', detail: 'Verificado no deploy.' });
    const rows = registry.policies.map(policy => ({ ...policy, result: result(policy) })).map(policy => (attestations[policy.id] && policy.result.status !== 'pass' ? { ...policy, attestation: attestations[policy.id], result: { status: 'attested', detail: attestations[policy.id].note } } : policy));
    const count = status => rows.filter(policy => policy.result.status === status).length;
    const policies = { evaluatedAt: hours(0), note: registry.note, summary: { pass: count('pass'), attested: count('attested'), fail: count('fail'), manual: count('manual') }, policies: rows };
    manifest.controls = { ...manifest.controls, automaticCustomerContact: settings.auto.thanks || settings.auto.nudge };
    return { valueRules: { 'rnavt-registration': 'Número RNAVT', 'adr-information': 'Entidade de RAL' }, manifest, policies, evidence: [{ key: 'controls/churn-followups/2026-10-25/run.json', size: 76, lastModified: hours(-3), etag: 'abc123def4567890' }] };
  }
  throw new Error('Rota simulada desconhecida.');
};
