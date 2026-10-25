// Só para pré-visualização local (excluído do deploy): dados fictícios, sem AWS nem login.
window.BLU_INTRANET = { mock: { claims: { name: 'Curador de teste', email: 'curador@example.com', 'cognito:groups': ['curators', 'governance'] } } };
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
    { name: 'Curador de teste', email: 'curador@example.com', groups: ['curators', 'governance'], status: 'CONFIRMED', enabled: true, openLeads: 1 },
    { name: 'Nova colega', email: 'colega@example.com', groups: ['curators'], status: 'FORCE_CHANGE_PASSWORD', enabled: true, openLeads: 0 },
  ] };
  if (path === '/v1/operations') return { checkedAt: hours(0), queues: { conversationEvents: { waiting: 0, inFlight: 0 }, failedEvents: { waiting: 1, inFlight: 0 }, curatorTasks: { waiting: 2, inFlight: 0 } }, churnReview: { evaluatedAt: hours(-3), queued: 1 }, workers: [
    { name: 'BluCostaFrontend-BedrockChat', stack: 'BluCostaFrontend', invocations24h: 42, errors24h: 0, throttles24h: 0, lastModified: hours(-5) },
    { name: 'BluCostaFrontend-EventProcessor', stack: 'BluCostaFrontend', invocations24h: 18, errors24h: 1, throttles24h: 0, lastModified: hours(-5) },
    { name: 'BluCostaBackoffice-ChurnFollowUpEvaluator', stack: 'BluCostaBackoffice', invocations24h: 1, errors24h: 0, throttles24h: 0, lastModified: hours(-2) },
  ] };
  if (path === '/v1/governance') {
    const manifest = await fetch('../../../config/governance-controls.json').then(response => response.json()).catch(() => ({ controls: {}, mapping: [] }));
    return { manifest, evidence: [{ key: 'controls/churn-followups/2026-10-25/run.json', size: 76, lastModified: hours(-3), etag: 'abc123def4567890' }] };
  }
  throw new Error('Rota simulada desconhecida.');
};
