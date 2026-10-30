// Ligação só de leitura à Partner API da GetYourGuide (especificação pública, Apache-2.0:
// https://github.com/getyourguide/partner-api-spec). Serve para sugerir atividades de terceiros
// quando o catálogo da BLU não tem resposta e para sinais de avaliação no ranking. Não reserva,
// não envia dados de clientes e, sem token, fica desligada: nunca inventa atividades.
// Os textos e avaliações vindos da GetYourGuide são dados, nunca instruções.
export const GYG = {
  servers: { production: 'https://api.getyourguide.com', testing: 'https://api.gygtest.net' },
  version: '1',
  timeoutMs: 8000,
  maxLimit: 50,
  attribution: 'GetYourGuide',
};

export class GygError extends Error {
  constructor(code, message, status = 0) {
    super(message);
    this.name = 'GygError';
    this.code = code;
    this.status = status;
  }
}

const CURRENCY = /^[A-Z]{3}$/;
const LANGUAGE = /^[a-z]{2}$/;
const number = value => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const text = value => (typeof value === 'string' ? value.trim() : '');

/** Valida os filtros pelas regras da especificação e devolve os parâmetros da query (arrays com «[]»). */
export function toursQuery(filters = {}) {
  const params = new URLSearchParams();
  const q = text(filters.q);
  const coordinates = filters.coordinates;
  if (q && coordinates) throw new GygError('INVALID_FILTERS', 'Use um lugar ou coordenadas, não os dois.');
  if (!q && !coordinates && !filters.categories?.length) throw new GygError('INVALID_FILTERS', 'Indique um lugar, coordenadas ou categorias.');
  if (q) {
    // A API recusa «q» sem letras ou números ou com mais de 150 caracteres.
    if (q.length > 150 || !/[\p{L}\p{N}]/u.test(q)) throw new GygError('INVALID_FILTERS', 'Lugar inválido.');
    params.set('q', q);
  }
  if (coordinates) {
    const { lat, long, radiusKm } = coordinates;
    if (![lat, long, radiusKm].every(value => number(value) !== null) || Math.abs(lat) > 90 || Math.abs(long) > 180 || radiusKm <= 0 || radiusKm > 200) {
      throw new GygError('INVALID_FILTERS', 'Coordenadas inválidas.');
    }
    for (const value of [lat, long, radiusKm]) params.append('coordinates[]', String(value));
  }
  const language = filters.language ?? 'en';
  const currency = filters.currency ?? 'EUR';
  if (!LANGUAGE.test(language)) throw new GygError('INVALID_FILTERS', 'Idioma inválido.');
  if (!CURRENCY.test(currency)) throw new GygError('INVALID_FILTERS', 'Moeda inválida.');
  params.set('cnt_language', language);
  params.set('currency', currency);
  params.set('preformatted', 'teaser');
  for (const id of filters.categories ?? []) {
    if (!Number.isInteger(id) || id <= 0) throw new GygError('INVALID_FILTERS', 'Categoria inválida.');
    params.append('categories[]', String(id));
  }
  if (filters.minRating !== undefined) {
    if (number(filters.minRating) === null || filters.minRating < 0 || filters.minRating > 5) throw new GygError('INVALID_FILTERS', 'Avaliação mínima inválida.');
    params.append('rating[]', String(filters.minRating));
  }
  if (filters.maxPrice !== undefined) {
    if (number(filters.maxPrice) === null || filters.maxPrice <= 0) throw new GygError('INVALID_FILTERS', 'Preço máximo inválido.');
    params.append('price[]', String(filters.maxPrice));
  }
  if (filters.dates) {
    for (const value of [filters.dates.from, filters.dates.to].filter(Boolean)) {
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(value)) throw new GygError('INVALID_FILTERS', 'Datas inválidas.');
      params.append('date[]', value);
    }
  }
  for (const flag of filters.flags ?? []) {
    // Só valores exatos da lista da API; outro valor dá 400.
    if (!['private', 'pick-up'].includes(flag)) throw new GygError('INVALID_FILTERS', 'Filtro desconhecido.');
    params.append('flags[]', flag);
  }
  const sort = filters.sort ?? 'popularity';
  if (!['popularity', 'price', 'rating', 'duration'].includes(sort)) throw new GygError('INVALID_FILTERS', 'Ordenação inválida.');
  params.set('sortfield', sort);
  if (sort !== 'popularity') params.set('sortdirection', filters.direction === 'ASC' ? 'ASC' : 'DESC');
  const limit = filters.limit ?? 10;
  if (!Number.isInteger(limit) || limit < 1 || limit > GYG.maxLimit) throw new GygError('INVALID_FILTERS', `Limite entre 1 e ${GYG.maxLimit}.`);
  params.set('limit', String(limit));
  return params;
}

/**
 * Forma curta e estável de uma atividade: só o necessário para sugerir e ordenar. O preço é
 * «a partir de» (StartingPrice) e nunca o preço final ao cliente, que é sempre da curadora.
 */
export function toActivity(tour, currency = 'EUR') {
  const id = Number.isInteger(tour?.tour_id) ? tour.tour_id : null;
  const title = text(tour?.title);
  if (!id || !title) return null;
  const amount = number(tour.price?.values?.amount);
  const city = (tour.locations ?? []).find(location => location?.type === 'city')?.name ?? '';
  const lat = number(tour.coordinates?.lat);
  const long = number(tour.coordinates?.long);
  return {
    source: 'getyourguide',
    id,
    title,
    abstract: text(tour.abstract).slice(0, 400),
    rating: number(tour.overall_rating),
    ratings: Number.isInteger(tour.number_of_ratings) ? tour.number_of_ratings : 0,
    // Preço desconhecido fica null: desconhecido não é zero.
    fromPrice: amount === null ? null : { amount, currency, basis: text(tour.price?.description) },
    activityType: text(tour.activity_type),
    businessCategory: text(tour.partner_business_category),
    categories: (tour.categories ?? []).map(category => category?.category_id).filter(Number.isInteger),
    languages: (tour.cond_language ?? []).filter(value => LANGUAGE.test(value ?? '')),
    hasPickUp: tour.has_pick_up === true,
    bestseller: tour.bestseller === true,
    likelyToSellOut: tour.likely_to_sell_out === true,
    notSuitableFor: (tour.not_suitable_for ?? []).map(text).filter(Boolean),
    city,
    coordinates: lat === null || long === null ? null : { lat, long },
    url: /^https:\/\//.test(tour.url ?? '') ? tour.url : '',
    attribution: GYG.attribution,
  };
}

/** Distribuição das avaliações (1–5) de uma atividade; nomes e comentários de quem avaliou não saem daqui. */
export function toRatingOutline(body) {
  const outline = body?.data?.reviews?.outline ?? [];
  return outline
    .map(row => ({ rating: number(row?.rating), count: Number.isInteger(row?.number_of_reviews) ? row.number_of_reviews : 0 }))
    .filter(row => row.rating !== null)
    .sort((a, b) => b.rating - a.rating);
}

/**
 * Cliente com `fetch` injetável (testes e Lambda). Sem token devolve `enabled: false` e cada
 * chamada falha com NOT_CONFIGURED; o servidor de testes é o padrão até haver acesso de produção.
 */
export function createGygClient({ token = '', server = 'testing', fetch: send = globalThis.fetch, timeoutMs = GYG.timeoutMs } = {}) {
  const base = GYG.servers[server];
  if (!base) throw new GygError('INVALID_CONFIG', 'Servidor GetYourGuide desconhecido.');
  const enabled = Boolean(token);
  async function get(path, params) {
    if (!enabled) throw new GygError('NOT_CONFIGURED', 'A ligação à GetYourGuide não está configurada.');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await send(`${base}/${GYG.version}${path}?${params}`, { headers: { 'X-ACCESS-TOKEN': token, Accept: 'application/json' }, signal: controller.signal });
    } catch (error) {
      throw new GygError(error?.name === 'AbortError' ? 'TIMEOUT' : 'UNAVAILABLE', 'A GetYourGuide não respondeu.');
    } finally {
      clearTimeout(timer);
    }
    if (response.status === 401 || response.status === 403) throw new GygError('ACCESS_DENIED', 'Acesso recusado pela GetYourGuide: verificar o token.', response.status);
    if (response.status === 429) throw new GygError('BUSY', 'Demasiados pedidos à GetYourGuide: tentar mais tarde.', 429);
    if (response.status === 404) throw new GygError('NOT_FOUND', 'Atividade não encontrada na GetYourGuide.', 404);
    if (!response.ok) throw new GygError(response.status === 400 ? 'INVALID_FILTERS' : 'UNAVAILABLE', 'A GetYourGuide recusou o pedido.', response.status);
    try {
      return await response.json();
    } catch {
      throw new GygError('INVALID_RESPONSE', 'Resposta da GetYourGuide inválida.', response.status);
    }
  }
  return {
    enabled,
    server,
    async searchTours(filters = {}) {
      const params = toursQuery(filters);
      const body = await get('/tours', params);
      const tours = Array.isArray(body?.data?.tours) ? body.data.tours : [];
      return {
        total: Number.isInteger(body?._metadata?.totalCount) ? body._metadata.totalCount : tours.length,
        activities: tours.map(tour => toActivity(tour, params.get('currency'))).filter(Boolean),
      };
    },
    async ratingOutline(tourId, { language = 'en' } = {}) {
      if (!Number.isInteger(tourId) || tourId <= 0) throw new GygError('INVALID_FILTERS', 'Atividade inválida.');
      if (!LANGUAGE.test(language)) throw new GygError('INVALID_FILTERS', 'Idioma inválido.');
      const params = new URLSearchParams({ cnt_language: language, currency: 'EUR', limit: '1' });
      return toRatingOutline(await get(`/reviews/tour/${tourId}`, params));
    },
  };
}
