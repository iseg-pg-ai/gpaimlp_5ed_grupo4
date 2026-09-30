import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { emptyFields, categories } from '../../src/lib/catalog-schema.ts';
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
try {
  for (const width of [320, 1440]) for (const locale of ['pt', 'en', 'es', 'fr', 'de', 'zh']) {
    const page = await browser.newPage({ viewport: { width, height: 800 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(l => localStorage.setItem('blu-portal-language', l), locale);
    const records = categories.map((category, i) => ({ id: `cat-test-${String(i).padStart(20, '0')}`, category, status: 'review', revision: 1, updatedAt: new Date().toISOString(), reason: 'Importação', raw: {}, fields: { ...emptyFields(), name: `Oferta ${i}`, location: 'Lisboa', description: 'Descrição de teste' } }));
    const history = records.map(r => structuredClone(r));
    let conflict = false;
    await page.route('**/api/catalog*', async route => {
      const request = route.request();
      if (request.method() === 'POST') {
        if (conflict) { conflict = false; return route.fulfill({ status: 409, json: { error: 'Existe uma revisão mais recente.' } }); }
        const input = request.postDataJSON();
        const record = { ...input, id: input.id ?? 'cat-test-created-00000000', revision: (input.baseRevision ?? 0) + 1, updatedAt: new Date().toISOString(), raw: {} };
        const index = records.findIndex(r => r.id === record.id);
        if (index >= 0) records[index] = record; else records.push(record);
        history.push(structuredClone(record)); return route.fulfill({ json: record });
      }
      const id = new URL(request.url()).searchParams.get('id');
      return route.fulfill({ json: id ? history.filter(r => r.id === id).reverse() : records });
    });
    await page.route('**/api/translate', r => r.fulfill({ json: { texts: r.request().postDataJSON().items.map(i => i.text) } }));
    await page.route('**/api/catalog/publish', r => { records.forEach(record => { record.published = record.status === 'approved'; }); return r.fulfill({ json: { ok: true } }); });
    await page.goto(`${process.env.PORTAL_URL ?? 'http://127.0.0.1:3001'}/catalog`);
    await page.getByTestId('catalog-record').first().waitFor();
    await page.waitForFunction(l => document.documentElement.lang.startsWith(l), locale);
    const filters = page.locator('#catalog-panel > div').first().locator('select');
    await filters.first().selectOption('inactive');
    assert.equal(await page.getByTestId('catalog-record').count(), 0);
    await filters.first().selectOption('review');
    await filters.nth(1).selectOption('Lisboa');
    assert.equal(await page.getByTestId('catalog-record').count(), 1);
    await filters.first().selectOption(''); await filters.nth(1).selectOption('');
    for (const category of categories) {
      await page.locator(`#tab-${category}`).click();
      await page.getByTestId('catalog-record').first().locator('button').first().click();
      const form = page.getByTestId('catalog-editor');
      assert.equal(await form.locator('[name="cuisine"]').count(), category === 'restaurantes' ? 1 : 0);
      assert.equal(await form.locator('[name="provider"]').count(), category === 'experiencias' ? 1 : 0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth || [...document.querySelectorAll('main')].some(e => e.scrollWidth > e.clientWidth + 1)), false);
      await form.locator('button[type="button"]').click();
    }
    if (locale === 'pt' && width === 1440) {
      await page.locator('#tab-atracoes').click();
      await page.getByRole('button', { name: '+ Novo Registo', exact: true }).click();
      const form = page.getByTestId('catalog-editor');
      await form.locator('[name="name"]').fill('Portal Test');
      await form.locator('button[type="submit"]').click();
      await form.waitFor({ state: 'hidden' });
      await page.getByTestId('catalog-search').fill('portal test');
      assert.equal(await page.getByTestId('catalog-record').count(), 1);
      const card = page.getByTestId('catalog-record');
      await card.getByRole('button', { name: 'Editar', exact: true }).click();
      await form.locator('[name="reason"]').fill('Correção');
      for (const field of ['location', 'description', 'duration', 'price', 'accessibility', 'source']) await form.locator(`[name="${field}"]`).fill('Dados revistos');
      await form.locator('[name="effort"]').selectOption('Baixo');
      await form.locator('[name="status"]').selectOption('approved');
      conflict = true;
      await form.locator('button[type="submit"]').click();
      await page.locator('main').getByRole('alert').waitFor();
      assert.ok(await form.isVisible());
      await form.locator('button[type="submit"]').click();
      await form.waitFor({ state: 'hidden' });
      await card.getByText('Aguarda atualização do catálogo', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Atualizar catálogo para os roteiros', exact: true }).click();
      await card.getByText('Disponível para novos roteiros', { exact: true }).waitFor();
      await card.getByRole('button', { name: 'Inativar', exact: true }).click();
      await card.getByText('Inativo', { exact: true }).waitFor();
      await card.getByRole('button', { name: 'Histórico', exact: true }).click();
      await page.getByTestId('catalog-history').waitFor();
      assert.equal(await page.getByTestId('catalog-history').locator('li').count(), 3);
    }
    assert.deepEqual(errors, []);
    console.log(width, locale, 'catalog OK');
    await page.close();
  }
} finally { await browser.close(); }
