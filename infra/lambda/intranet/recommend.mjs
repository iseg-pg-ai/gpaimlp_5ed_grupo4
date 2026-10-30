// Recomendação de serviços para um lead: os dois parceiros que melhor servem a viagem.
// Começa como regra explicável (zona, lugares, qualidade medida) e passa a aprender com o que
// aconteceu a cada proposta (enviada, aceite) quando há resultados suficientes. Nunca recomenda
// um parceiro que não serve a zona da viagem e diz sempre de que base vem a ordem.
export const RECO = { status: 'RECO_OUTCOME', top: 2, minLearned: 10, windowDays: 180, weights: { area: 50, seats: 15, quality: 25, learned: 10 } };

const fold = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const words = value => [...new Set(fold(value).split(/[^a-z0-9]+/).filter(word => word.length > 2))];

/** Número de pessoas do grupo: soma os números da descrição («2 adults, 1 child» → 3). */
export const partySize = party => (String(party ?? '').match(/\d+/g) ?? []).reduce((sum, value) => sum + Number(value), 0);

const str = (item, key) => item?.[key]?.S ?? '';
export const toReco = item => ({ conversationId: str(item, 'conversationId'), partnerId: str(item, 'partnerId'), outcome: str(item, 'outcome'), at: str(item, 'followUpAt') });

export function recoRecord({ partnerId, outcome, user, now }) {
  return { recordKey: `RECO#${partnerId}#${outcome}#${now.toISOString()}`, followUpStatus: RECO.status, followUpAt: now.toISOString(), partnerId, outcome, recordedBy: user.email, recordedAt: now.toISOString() };
}

/** Os dois melhores parceiros para este lead, com o motivo de cada um. */
export function recommend(lead, partners, cards, history = []) {
  const place = words(lead.journey?.destination);
  const size = partySize(lead.journey?.party);
  const learned = history.length >= RECO.minLearned;
  const items = [];
  for (const partner of partners) {
    const area = words(partner.area);
    const hit = place.filter(word => area.includes(word));
    if (!hit.length) continue;
    const card = cards.find(item => item.id === partner.id);
    const reasons = [`Serve ${partner.area}, onde é a viagem`];
    const seats = !size || partner.seats >= size ? 1 : partner.seats / size;
    reasons.push(!size ? 'Grupo por confirmar' : seats === 1 ? `Cabem ${size} pessoas (${partner.seats} lugares)` : `Só ${partner.seats} lugares para ${size} pessoas: precisa de mais de um serviço`);
    const quality = card?.score === null || card?.score === undefined ? 0.5 : card.score / 100;
    reasons.push(card?.score === null || card?.score === undefined ? 'Ainda sem serviços suficientes para pontuar' : `Pontuação ${card.score}/100 nos últimos serviços`);
    const sent = history.filter(item => item.partnerId === partner.id && item.outcome === 'sent').length;
    const accepted = history.filter(item => item.partnerId === partner.id && item.outcome === 'accepted').length;
    const rate = (accepted + 1) / (sent + 2);
    if (learned && sent) reasons.push(`Aceite em ${accepted} de ${sent} propostas`);
    const w = RECO.weights;
    const score = Math.round((w.area * (hit.length / place.length) + w.seats * seats + w.quality * quality + (learned ? w.learned * rate : 0)) / (learned ? 100 : 90) * 100);
    items.push({ partnerId: partner.id, name: partner.name, kind: partner.kind, area: partner.area, demo: Boolean(partner.demo), score, reasons });
  }
  items.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return { basis: learned ? 'learned' : 'heuristic', outcomes: history.length, items: items.slice(0, RECO.top) };
}
