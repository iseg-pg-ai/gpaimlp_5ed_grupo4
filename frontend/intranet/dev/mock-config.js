// Só para pré-visualização local (excluído do deploy): dados fictícios, sem AWS nem login.
window.BLU_INTRANET = { mock: { claims: { name: 'Fundadora de teste', email: 'fundadora@example.com', 'cognito:username': 'u-founder', 'cognito:groups': ['founders'] } } };
const hours = n => new Date(Date.now() + n * 36e5).toISOString();
const leads = [
  { id: 'BLU-DEMO000000000001', status: 'QUEUED_FOR_REVIEW', followUpAt: hours(-20), lastActivityAt: hours(-90), channel: 'website', messageCount: 4, synthetic: false, stage: 'curator-follow-up', consentAt: hours(-92), journey: { destination: 'Costa norte e Algarve', timeframe: '25 nov – 10 dez 2026', party: '3 adultos', budget: '3000 EUR', interests: 'surf, vinho, vegano', pace: 'ativo', socialSource: 'instagram' }, tags: ['hot'], curatorNote: 'Prefere contacto por email.' },
  { id: 'BLU-DEMO000000000002', status: 'PENDING', followUpAt: hours(30), lastActivityAt: hours(-40), channel: 'website', messageCount: 6, synthetic: false, stage: 'ready-for-curator', consentAt: hours(-41), assignedTo: 'curador@example.com', assignedAt: hours(-2), journey: { destination: 'Lisboa e Sintra', timeframe: 'maio 2027', party: 'casal', interests: 'história romana' }, tags: [] },
  { id: 'BLU-DEMO000000000003', status: 'CONTACTED', followUpAt: hours(-50), contactedAt: hours(-60), lastActivityAt: hours(-80), channel: 'whatsapp', messageCount: 3, synthetic: true, consentAt: hours(-85), journey: { destination: 'Douro' }, tags: ['vip'] },
];
const messages = [
  { at: hours(-92), actor: 'customer', channel: 'website', eventType: 'conversation.message.recorded', text: 'Viagem de surf na costa norte e Algarve, 3 adultos, 3000 EUR. demo@example.com' },
  { at: hours(-92), actor: 'assistant', channel: 'website', eventType: 'conversation.message.recorded', text: 'Que bom! Posso pedir a um curador que entre em contacto por email?' },
  { at: hours(-91), actor: 'system', channel: 'website', eventType: 'lead.consent.granted', text: 'O visitante aceitou ser contactado por um curador.' },
];
window.BLU_INTRANET_MOCK = async (method, path) => {
  await new Promise(resolve => setTimeout(resolve, 150));
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
  if (path.startsWith('/v1/metrics')) return { total: 2, synthetic: 1, open: 2, overdue: 1, contacted: 0, unassigned: 1, medianHoursToContact: null, byStatus: { QUEUED_FOR_REVIEW: 1, PENDING: 1 }, byStage: { 'curator-follow-up': 1, 'ready-for-curator': 1 }, bySource: { instagram: 1, website: 1 } };
  if (path.startsWith('/v1/leads?')) {
    const filter = new URLSearchParams(path.split('?')[1]).get('status');
    return { leads: leads.filter(lead => filter === 'all' || (filter === 'contacted') === (lead.status === 'CONTACTED')) };
  }
  if (path.endsWith('/ask')) return { answer: 'O viajante procura uma viagem ativa de surf com vinho e comida vegana. Próximo passo: enviar email com duas propostas.', sourceIds: [], requiresHumanApproval: true };
  if (method !== 'GET') return null;
  if (path.startsWith('/v1/leads/')) {
    const lead = leads.find(item => item.id === decodeURIComponent(path.split('/')[3]));
    return { ...lead, messages, emails: ['demo@example.com'], phones: [] };
  }
  if (path === '/v1/team') return { members: [
    { username: 'u-founder', name: 'Fundadora de teste', email: 'fundadora@example.com', groups: ['founders'], status: 'CONFIRMED', enabled: true, openLeads: 1 },
    { username: 'u-tester', name: 'Pessoa de testes', email: 'testes@example.com', groups: ['testers'], status: 'FORCE_CHANGE_PASSWORD', enabled: true, openLeads: 0 },
  ] };
  if (path === '/v1/operations') return { checkedAt: hours(0), queues: { conversationEvents: { waiting: 0, inFlight: 0 }, failedEvents: { waiting: 1, inFlight: 0 }, curatorTasks: { waiting: 2, inFlight: 0 } }, churnReview: { evaluatedAt: hours(-3), queued: 1 }, workers: [
    { name: 'BluCostaFrontend-BedrockChat', stack: 'BluCostaFrontend', invocations24h: 42, errors24h: 0, throttles24h: 0, lastModified: hours(-5) },
    { name: 'BluCostaFrontend-EventProcessor', stack: 'BluCostaFrontend', invocations24h: 18, errors24h: 1, throttles24h: 0, lastModified: hours(-5) },
    { name: 'BluCostaBackoffice-ChurnFollowUpEvaluator', stack: 'BluCostaBackoffice', invocations24h: 1, errors24h: 0, throttles24h: 0, lastModified: hours(-2) },
  ] };
  if (path === '/v1/governance') {
    const manifest = await fetch('../../../config/governance-controls.json').then(response => response.json()).catch(() => ({ controls: {}, mapping: [] }));
    const registry = await fetch('../../../config/policies.json').then(response => response.json());
    const result = policy => (policy.enforcement === 'manual' ? { status: 'manual', detail: 'Controlo manual.' } : ['rnavt-registration', 'adr-information'].includes(policy.id) ? { status: 'fail', detail: 'Por preencher em config/policies.json.' } : { status: 'pass', detail: 'Verificado no deploy.' });
    const policies = { evaluatedAt: hours(0), note: registry.note, summary: { pass: 9, fail: 2, manual: 3 }, policies: registry.policies.map(policy => ({ ...policy, result: result(policy) })) };
    return { manifest, policies, evidence: [{ key: 'controls/churn-followups/2026-10-25/run.json', size: 76, lastModified: hours(-3), etag: 'abc123def4567890' }] };
  }
  throw new Error('Rota simulada desconhecida.');
};
