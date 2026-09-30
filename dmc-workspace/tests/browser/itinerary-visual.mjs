import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const snapshot = JSON.parse(readFileSync(new URL('./fixture.json', import.meta.url), 'utf8'));
  Object.assign(snapshot.brief, { childrenAges: '', specialOccasion: '', notes: '', accommodation: 'Boutique', diningPace: 'Relaxed Dining (~90m)' });
  snapshot.itinerary[0].items[0].isLocked = true;
  delete snapshot.itinerary[0].items[0].source;
  snapshot.itinerary[0].items[0].pendingChecks = ['Confirmar acessibilidade'];
  await page.addInitScript(snapshot => {
    localStorage.setItem('blu-portal-language', 'pt');
    localStorage.setItem('blu-trips-v1', JSON.stringify([{ ...snapshot, id: 'visual-test', version: 1, messages: [] }]));
  }, snapshot);
  await page.route('**/api/translate', r => r.fulfill({ json: { texts: r.request().postDataJSON().items.map(i => i.text) } }));
  await page.route('**/api/versions?*', r => r.fulfill({ json: [{ version: 1, exportedAt: '2026-09-30T12:00:00Z', createdAt: '2026-09-30T12:00:00Z', filename: 'test.pdf' }] }));
  await page.goto(process.env.PORTAL_URL ?? 'http://127.0.0.1:3001');
  await page.locator('aside:visible button').filter({ hasText: snapshot.brief.customerName }).click();
  await page.locator('[data-status="exported"]').waitFor();
  assert.equal(await page.locator('[data-testid="proposal-preferences"]').getAttribute('open'), null);
  assert.equal(await page.locator('[data-testid="proposal-tools"]').getAttribute('open'), null);
  const card = page.locator('[data-testid="activity-card"]').first();
  assert.ok(await card.locator('[data-status="pending"]').isVisible());
  assert.ok(await card.locator('[data-status="protected"]').isVisible());
  await card.locator('summary').last().click();
  assert.ok(await card.getByText('Confirmar acessibilidade', { exact: false }).isVisible());
  const days = page.locator('[data-testid="day-navigation"] button');
  await days.nth(1).click();
  assert.equal(await days.nth(1).getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('main h2').count(), 1);
  await days.first().click();
  assert.equal(await page.locator('main h2').count(), snapshot.itinerary.length);
  const before = await page.locator('main').boundingBox();
  await page.locator('[data-testid="collapse-assistant"]').click();
  await page.waitForTimeout(350);
  assert.ok(!await page.locator('#curation-assistant').isVisible());
  assert.ok((await page.locator('main').boundingBox()).width > before.width + 250);
  await page.locator('[aria-controls="curation-assistant"]').click();
  await page.locator('#curation-assistant').waitFor({ state: 'visible' });
  assert.equal(Math.round((await page.locator('main').boundingBox()).width), Math.round(before.width));
  console.log('Visual itinerary: states, details without source, days and desktop assistant OK');
} finally {
  await browser.close();
}
