import test from 'node:test';
import assert from 'node:assert/strict';
import { GygError, createGygClient, toActivity, toRatingOutline, toursQuery } from '../lambda/intranet/getyourguide.mjs';

// Respostas com a forma da especificação pública (spec/paths/tours.yaml e reviews.yaml); dados fictícios.
const tour = (id, extra = {}) => ({
  tour_id: id, title: `Tour ${id}`, abstract: 'Short text', overall_rating: 4.6, number_of_ratings: 120,
  price: { values: { amount: 39 }, description: 'per person' }, activity_type: 'guidedTour', partner_business_category: 'Walking Tours',
  categories: [{ category_id: 55, name: 'x' }], cond_language: ['en', 'pt'], has_pick_up: false, bestseller: true,
  not_suitable_for: ['People with impeded movement.'], locations: [{ type: 'poi', name: 'Alfama' }, { type: 'city', name: 'Lisbon' }],
  coordinates: { lat: 38.71, long: -9.13 }, url: 'https://www.getyourguide.com/lisbon-l42/x-t1/', pictures: [{ url: 'x' }], description: 'long', ...extra,
});
const ok = body => ({ ok: true, status: 200, json: async () => body });
const fetchStub = (responses, seen = []) => async (url, init) => { seen.push({ url, init }); return responses.shift(); };

test('the query follows the API rules: place or coordinates, exact flags, limits', () => {
  const params = toursQuery({ q: 'Lisboa', minRating: 4, maxPrice: 80, flags: ['private'], categories: [55], limit: 6 });
  assert.equal(params.get('q'), 'Lisboa');
  assert.equal(params.get('cnt_language'), 'en');
  assert.equal(params.get('currency'), 'EUR');
  assert.deepEqual(params.getAll('rating[]'), ['4']);
  assert.deepEqual(params.getAll('price[]'), ['80']);
  assert.deepEqual(params.getAll('flags[]'), ['private']);
  assert.equal(params.get('sortfield'), 'popularity');
  assert.equal(params.get('sortdirection'), null);
  assert.deepEqual(toursQuery({ coordinates: { lat: 38.7, long: -9.1, radiusKm: 10 } }).getAll('coordinates[]'), ['38.7', '-9.1', '10']);
  for (const bad of [{}, { q: 'Lisboa', coordinates: { lat: 1, long: 1, radiusKm: 1 } }, { q: '!!!' }, { q: 'x'.repeat(151) }, { q: 'Lisboa', flags: ['Private'] }, { q: 'Lisboa', limit: 51 }, { q: 'Lisboa', minRating: 6 }, { q: 'Lisboa', currency: 'eur' }, { coordinates: { lat: 91, long: 0, radiusKm: 5 } }]) {
    assert.throws(() => toursQuery(bad), error => error instanceof GygError && error.code === 'INVALID_FILTERS', JSON.stringify(bad));
  }
});

test('a tour becomes a short activity: from-price, unknown stays unknown, no long text or pictures', () => {
  const activity = toActivity(tour(1));
  assert.deepEqual(Object.keys(activity).sort(), ['abstract', 'activityType', 'attribution', 'bestseller', 'businessCategory', 'categories', 'city', 'coordinates', 'fromPrice', 'hasPickUp', 'id', 'languages', 'likelyToSellOut', 'notSuitableFor', 'rating', 'ratings', 'source', 'title', 'url'].sort());
  assert.deepEqual(activity.fromPrice, { amount: 39, currency: 'EUR', basis: 'per person' });
  assert.equal(activity.city, 'Lisbon');
  assert.equal(activity.attribution, 'GetYourGuide');
  // Sem preço nem avaliação: null, nunca 0; sem id ou título, fora.
  const bare = toActivity(tour(2, { price: undefined, overall_rating: undefined, url: 'javascript:alert(1)' }));
  assert.equal(bare.fromPrice, null);
  assert.equal(bare.rating, null);
  assert.equal(bare.url, '');
  assert.equal(toActivity({ title: 'x' }), null);
});

test('rating outline keeps only the distribution, never reviewer names or comments', () => {
  const outline = toRatingOutline({ data: { reviews: { outline: [{ rating: 4, number_of_reviews: 10, share: 20 }, { rating: 5, number_of_reviews: 40, share: 80 }], review_items: [{ reviewer_name: 'Ana – Portugal', comment: 'Super' }] } } });
  assert.deepEqual(outline, [{ rating: 5, count: 40 }, { rating: 4, count: 10 }]);
  assert.doesNotMatch(JSON.stringify(outline), /Ana|Super/);
});

test('without a token the client is off and never calls out', async () => {
  const seen = [];
  const client = createGygClient({ fetch: fetchStub([], seen) });
  assert.equal(client.enabled, false);
  await assert.rejects(client.searchTours({ q: 'Lisboa' }), error => error.code === 'NOT_CONFIGURED');
  assert.equal(seen.length, 0);
});

test('search calls the testing server with the token header and normalises the answer', async () => {
  const seen = [];
  const client = createGygClient({ token: 'tok-123', fetch: fetchStub([ok({ _metadata: { totalCount: 127 }, data: { tours: [tour(1), { title: 'no id' }, tour(3)] } })], seen) });
  const result = await client.searchTours({ q: 'Lisboa', minRating: 4, limit: 3 });
  assert.equal(result.total, 127);
  assert.deepEqual(result.activities.map(activity => activity.id), [1, 3]);
  assert.match(seen[0].url, /^https:\/\/api\.gygtest\.net\/1\/tours\?q=Lisboa&/);
  assert.equal(seen[0].init.headers['X-ACCESS-TOKEN'], 'tok-123');
});

test('API failures become clear codes without leaking the token', async () => {
  const fail = status => ({ ok: false, status, json: async () => ({ errors: [{ errorMessage: 'Unauthorized. The access token is invalid.' }] }) });
  const cases = [[fail(401), 'ACCESS_DENIED'], [fail(429), 'BUSY'], [fail(400), 'INVALID_FILTERS'], [fail(500), 'UNAVAILABLE'], [{ ok: true, status: 200, json: async () => { throw new SyntaxError('x'); } }, 'INVALID_RESPONSE']];
  for (const [response, code] of cases) {
    const client = createGygClient({ token: 'tok-secret', fetch: fetchStub([response]) });
    await assert.rejects(client.searchTours({ q: 'Lisboa' }), error => error.code === code && !String(error.message).includes('tok-secret'), code);
  }
  const down = createGygClient({ token: 'tok', fetch: async () => { throw new TypeError('fetch failed'); } });
  await assert.rejects(down.searchTours({ q: 'Lisboa' }), error => error.code === 'UNAVAILABLE');
  const slow = createGygClient({ token: 'tok', timeoutMs: 10, fetch: (url, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))) });
  await assert.rejects(slow.searchTours({ q: 'Lisboa' }), error => error.code === 'TIMEOUT');
  await assert.rejects(createGygClient({ token: 'tok' }).ratingOutline(-1), error => error.code === 'INVALID_FILTERS');
});
