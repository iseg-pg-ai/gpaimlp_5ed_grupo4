// Avaliação dos parceiros a partir do que acontece em cada serviço: depois de uma recolha ou
// excursão, quem acompanhou regista o resultado (a horas, atraso, falta, cancelamento), a avaliação
// do cliente e, se souber, o custo e o preço. Daqui saem pontualidade, fiabilidade, avaliação,
// margem, ROI e preço por pessoa, e uma pontuação para ordenar os parceiros de cada tipo.
// Com menos de MIN_SERVICES serviços não há pontuação: desconhecido não é bom nem mau.
export const OUTCOME_STATUS = 'PARTNER_OUTCOME';
export const OUTCOMES = { 'on-time': 'A horas', late: 'Atrasado', 'no-show': 'Não apareceu', cancelled: 'Cancelado pelo parceiro' };
export const SCORE = { windowDays: 90, minServices: 3, recent: 10, weights: { punctuality: 30, rating: 30, reliability: 25, margin: 15 }, fullMargin: 0.3 };

const money = value => {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(String(value).replace(',', '.'));
  return Number.isFinite(number) && number >= 0 && number <= 1e6 ? Math.round(number * 100) / 100 : NaN;
};

/**
 * Valida o resultado de uma ocorrência. O dia tem de pertencer à atividade e já ter passado;
 * custo e preço são opcionais (desconhecido não é zero), na mesma moeda.
 */
export function parseOutcome(body, activity, occurrenceAt, now = new Date()) {
  const result = OUTCOMES[body?.result] ? body.result : '';
  if (!result) return { error: 'Escolha o resultado do serviço.' };
  if (!activity?.partnerId || activity.partnerId === 'bolt') return { error: 'Esta atividade não tem parceiro para avaliar.' };
  if (!(occurrenceAt instanceof Date) || Number.isNaN(+occurrenceAt)) return { error: 'Dia inválido para esta atividade.' };
  if (occurrenceAt > now) return { error: 'O serviço ainda não aconteceu.' };
  const delayMinutes = result === 'late' ? Number.parseInt(body.delayMinutes, 10) : 0;
  if (result === 'late' && !(delayMinutes >= 1 && delayMinutes <= 600)) return { error: 'Indique o atraso em minutos (1 a 600).' };
  const rating = body.rating === undefined || body.rating === '' ? null : Number.parseInt(body.rating, 10);
  if (rating !== null && !(rating >= 1 && rating <= 5)) return { error: 'A avaliação do cliente vai de 1 a 5.' };
  // Recomendação (NPS): «de 0 a 10, recomendaria?», a resposta ao pedido enviado no dia seguinte.
  const recommend = body.recommend === undefined || body.recommend === '' ? null : Number.parseInt(body.recommend, 10);
  if (recommend !== null && !(recommend >= 0 && recommend <= 10)) return { error: 'A recomendação do cliente vai de 0 a 10.' };
  const cost = money(body.cost);
  const price = money(body.price);
  if (Number.isNaN(cost) || Number.isNaN(price)) return { error: 'Custo e preço têm de ser valores positivos.' };
  const currency = /^[A-Z]{3}$/.test(body.currency ?? '') ? body.currency : 'EUR';
  const comment = typeof body.comment === 'string' ? body.comment.trim().slice(0, 500) : '';
  return { outcome: { result, delayMinutes, rating, recommend, cost, price, currency, comment } };
}

/** Campos guardados: um registo por ocorrência, encontrado pelo índice como os lembretes. */
export function outcomeRecord({ activityId, date, occurrenceAt, activity, outcome, user, now }) {
  const optional = (key, value) => (value === null || value === undefined || value === '' ? {} : { [key]: String(value) });
  return {
    recordKey: `OUTCOME#${activityId}#${date}`, activityId, date, followUpStatus: OUTCOME_STATUS, followUpAt: occurrenceAt.toISOString(),
    partnerId: activity.partnerId, kind: activity.kind, title: activity.title, people: String(activity.people ?? ''),
    result: outcome.result, delayMinutes: String(outcome.delayMinutes), currency: outcome.currency,
    ...optional('rating', outcome.rating), ...optional('recommend', outcome.recommend), ...optional('cost', outcome.cost), ...optional('price', outcome.price), ...optional('comment', outcome.comment),
    recordedBy: user.email, recordedAt: now.toISOString(),
  };
}

const str = (item, key) => item?.[key]?.S ?? '';
const num = (item, key) => (str(item, key) === '' ? null : Number(str(item, key)));
export const toOutcome = item => ({
  conversationId: str(item, 'conversationId'), activityId: str(item, 'activityId'), date: str(item, 'date'), at: str(item, 'followUpAt'),
  partnerId: str(item, 'partnerId'), kind: str(item, 'kind'), title: str(item, 'title'), people: num(item, 'people') ?? 0,
  result: str(item, 'result'), delayMinutes: num(item, 'delayMinutes') ?? 0, rating: num(item, 'rating'), recommend: num(item, 'recommend'), cost: num(item, 'cost'), price: num(item, 'price'),
  currency: str(item, 'currency') || 'EUR', comment: str(item, 'comment'), recordedBy: str(item, 'recordedBy'),
});

const share = (part, whole) => (whole ? part / whole : null);
const round = (value, digits = 2) => (value === null ? null : Math.round(value * 10 ** digits) / 10 ** digits);
const average = values => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null);

/**
 * Net Promoter Score das respostas de 0 a 10: % promotores (9–10) menos % detratores (0–6),
 * de −100 a 100. Sem respostas não há NPS: desconhecido não é zero.
 */
export function netPromoter(values) {
  const answers = values.filter(value => value !== null && value !== undefined);
  if (!answers.length) return { nps: null, responses: 0, promoters: 0, passives: 0, detractors: 0 };
  const promoters = answers.filter(value => value >= 9).length;
  const detractors = answers.filter(value => value <= 6).length;
  return { nps: Math.round((promoters - detractors) / answers.length * 100), responses: answers.length, promoters, passives: answers.length - promoters - detractors, detractors };
}

/** Indicadores e pontuação de cada parceiro na janela; ordenados por tipo e pontuação. */
export function scorecards(partners, outcomes, now = new Date()) {
  const since = new Date(+now - SCORE.windowDays * 864e5).toISOString();
  const cards = partners.map(partner => {
    const own = outcomes.filter(item => item.partnerId === partner.id && item.at >= since).sort((a, b) => b.at.localeCompare(a.at));
    const count = result => own.filter(item => item.result === result).length;
    const happened = own.length - count('cancelled');
    const late = own.filter(item => item.result === 'late');
    const ratings = own.map(item => item.rating).filter(value => value !== null);
    const promoter = netPromoter(own.map(item => item.recommend));
    const priced = own.filter(item => item.price !== null && item.cost !== null && item.price > 0);
    const margins = priced.map(item => (item.price - item.cost) / item.price);
    const withCost = priced.filter(item => item.cost > 0);
    // Preço por pessoa só com serviços cobrados (uma falta a 0 € não baixa o preço).
    const charged = own.filter(item => item.price !== null && item.price > 0);
    const people = charged.reduce((sum, item) => sum + item.people, 0);
    // Totais por moeda: moedas diferentes nunca se somam.
    const byCurrency = {};
    for (const item of priced) {
      const totals = byCurrency[item.currency] ??= { revenue: 0, cost: 0 };
      totals.revenue += item.price;
      totals.cost += item.cost;
    }
    const metrics = {
      services: own.length,
      people: own.reduce((sum, item) => sum + item.people, 0),
      punctuality: round(share(count('on-time'), happened)),
      averageDelay: late.length ? Math.round(average(late.map(item => item.delayMinutes))) : 0,
      noShows: count('no-show'),
      cancellations: count('cancelled'),
      reliability: round(share(own.length - count('no-show') - count('cancelled'), own.length)),
      rating: round(average(ratings), 1),
      ratings: ratings.length,
      nps: promoter.nps,
      npsResponses: promoter.responses,
      margin: round(average(margins)),
      roi: round(withCost.length ? average(withCost.map(item => (item.price - item.cost) / item.cost)) : null),
      pricePerPerson: people && new Set(charged.map(item => item.currency)).size === 1 ? round(charged.reduce((sum, item) => sum + item.price, 0) / people) : null,
      currency: Object.keys(byCurrency).length === 1 ? Object.keys(byCurrency)[0] : '',
      byCurrency,
    };
    // Componentes em falta (sem avaliações ou sem preços) não contam: o peso divide-se pelos outros.
    const parts = {
      punctuality: metrics.punctuality,
      // Avaliação do cliente: estrelas (1–5) quando registadas; senão a média da recomendação (0–10).
      rating: metrics.rating !== null ? (metrics.rating - 1) / 4 : promoter.responses ? average(own.map(item => item.recommend).filter(value => value !== null)) / 10 : null,
      reliability: metrics.reliability,
      margin: metrics.margin === null ? null : Math.max(0, Math.min(1, metrics.margin / SCORE.fullMargin)),
    };
    const known = Object.entries(parts).filter(([, value]) => value !== null);
    const weight = known.reduce((sum, [key]) => sum + SCORE.weights[key], 0);
    const score = own.length >= SCORE.minServices && weight ? Math.round(known.reduce((sum, [key, value]) => sum + SCORE.weights[key] * value, 0) / weight * 100) : null;
    return { id: partner.id, name: partner.name, kind: partner.kind, demo: Boolean(partner.demo), licensed: Boolean(partner.demo || partner.license?.number), score, metrics, recent: own.slice(0, SCORE.recent) };
  });
  // Posição dentro de cada tipo; sem pontuação fica no fim, sem posição.
  for (const kind of new Set(cards.map(card => card.kind))) {
    cards.filter(card => card.kind === kind && card.score !== null).sort((a, b) => b.score - a.score || b.metrics.services - a.metrics.services)
      .forEach((card, index) => { card.rank = index + 1; });
  }
  return cards.sort((a, b) => a.kind.localeCompare(b.kind) || (b.score ?? -1) - (a.score ?? -1) || a.name.localeCompare(b.name));
}
