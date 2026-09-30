import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
try {
 for (const width of [360, 1440]) {
  const page = await browser.newPage({ viewport: { width, height: 800 } });
  const snapshot = JSON.parse(readFileSync(new URL('./fixture.json', import.meta.url), 'utf8'));
  Object.assign(snapshot.brief, { childrenAges: '', specialOccasion: '', notes: '', accommodation: 'Boutique', diningPace: 'Relaxed Dining (~90m)' });
  snapshot.itinerary[0].items[0].isLocked = false;
  snapshot.itinerary[0].items[0].pendingChecks = ['Disponibilidade'];
  const catalogDetails = { location: 'Morada do catálogo', price: '12 EUR por pessoa', supplier: 'Operador', contact: 'contact@example.com', hours: '09:00–18:00', accessibility: 'Entrada acessível', dietary: '', verification: '' };
  if (width === 1440) snapshot.itinerary[0].items[0].catalogDetails = catalogDetails;
  await page.route('**/api/catalog/itinerary?*', r => r.fulfill({ json: catalogDetails }));
  await page.addInitScript(snapshot => { localStorage.setItem('blu-portal-language', 'pt'); if (!localStorage.getItem('blu-trips-v1')) localStorage.setItem('blu-trips-v1', JSON.stringify([{ ...snapshot, id: 'confirm-test', version: 1, messages: [] }])); }, snapshot);
  let version = 1, fail = true;
  await page.route('**/api/versions?*', r => r.fulfill({ json: [] }));
  await page.route('**/api/versions', r => { if (fail) { fail = false; return r.fulfill({ status: 500, json: { error: 'Falha de teste' } }); } return r.fulfill({ json: { version: ++version } }); });
  await page.route('**/api/translate', r => r.fulfill({ json: { texts: r.request().postDataJSON().items.map(i => i.text) } }));
  await page.goto(process.env.PORTAL_URL ?? 'http://127.0.0.1:3001');
  async function selectTrip() { if (width < 1024) await page.locator('[aria-controls="trip-navigation"]').click(); await page.locator('aside:visible button').filter({ hasText: snapshot.brief.customerName }).click(); }
  await selectTrip();
  const card = page.getByTestId('activity-card').first(), editor = card.getByTestId('activity-confirmations');
  await editor.locator('summary').click();
  await page.waitForFunction(() => document.querySelector('[name="confirmation-supplier"]')?.value === 'Operador');
  assert.equal(await editor.locator('[name="confirmation-price"]').inputValue(), '12 EUR por pessoa');
  assert.equal(await editor.locator('[name="confirmation-time"]').inputValue(), '');
  await editor.locator('[name="confirmation-time"]').fill('10:30');
  await editor.locator('[name="confirmation-location"]').fill('Entrada principal');
  await editor.locator('[name="confirmation-price"]').fill('20 EUR por pessoa');
  await editor.locator('[name="confirmation-notes"]').fill('Email do fornecedor');
  await editor.getByRole('button', { name: 'Guardar progresso' }).click();
  await editor.getByRole('alert').waitFor();
  assert.equal(await editor.locator('[name="confirmation-time"]').inputValue(), '10:30');
  await editor.getByRole('button', { name: 'Guardar progresso' }).click();
  await editor.getByRole('status').waitFor();
  await editor.getByRole('button', { name: 'Confirmar atividade', exact: true }).click();
  await editor.getByRole('alert').waitFor();
  assert.ok(await card.locator('[data-status="pending"]').isVisible());
  await editor.locator('textarea[aria-label="Disponibilidade"]').fill('Fornecedor confirmou');
  await editor.locator('input[type="checkbox"]').check();
  await editor.getByRole('button', { name: 'Confirmar atividade', exact: true }).click();
  await card.locator('[data-status="confirmed"]').waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.reload(); await selectTrip();
  await card.locator('[data-status="confirmed"]').waitFor();
  await editor.locator('summary').click();
  await editor.getByRole('button', { name: 'Guardar e voltar a pendente' }).click();
  await card.locator('[data-status="pending"]').waitFor();
  console.log(width, 'confirmation save, failure recovery, reload and reopen OK');
  await page.close();
 }
} finally { await browser.close(); }
