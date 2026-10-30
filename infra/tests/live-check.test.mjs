import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../lambda/intranet/app.mjs';
import { DEMO, apiEvent, demoActivity, demoMessages, demoProfile, demoScheduled, fileMismatches, summary } from '../scripts/live-check-core.mjs';

const now = new Date('2026-10-28T15:00:00Z');

test('o lead de demonstração é sintético, sem contactos e com o seguimento fora do prazo', () => {
  const profile = demoProfile(now);
  assert.equal(profile.synthetic.BOOL, true);
  assert.ok(profile.followUpAt.S < now.toISOString());
  assert.ok(profile.consentAt.S);
  const text = JSON.stringify([profile, ...demoMessages(now)]);
  assert.doesNotMatch(text, /@|\+?\d{9,}/);
  assert.deepEqual(demoActivity(now).date, '2026-10-29');
  assert.deepEqual(demoActivity(now).repeatUntil, '2026-11-27');
});

// O mesmo caminho do script: a rota real agenda a recolha e a Agenda mostra-a.
test('a recolha de demonstração passa pela rota real e aparece na Agenda sem alertar a equipa', async () => {
  const records = [];
  const items = [demoProfile(now)];
  const deps = {
    now: () => now,
    partners: [],
    newId: () => 'demo-activity-0001',
    getRecords: async id => (id === DEMO.leadId ? items : []),
    getTranscript: async () => demoMessages(now),
    queryRecords: async () => [],
    queryStatus: async status => (status === 'PENDING' ? items : []),
    putRecords: async (id, list) => records.push(...list.map(record => ({ conversationId: id, ...record }))),
    // Agenda e alertas leem o que a rota gravou, como o índice FollowUpIndex.
    queryAgenda: async (status, from, to) => records.filter(record => record.followUpStatus === status && record.followUpAt >= from && record.followUpAt <= to)
      .map(record => Object.fromEntries(Object.entries(record).map(([key, value]) => [key, { S: String(value) }]))),
    operations: async () => ({ queues: { failedEvents: { waiting: 0 }, conversationEvents: { waiting: 0 } }, workers: [], churnReview: { evaluatedAt: now.toISOString() } }),
    policyReport: async () => null,
  };
  const handler = createApp(deps);
  const call = async (...args) => {
    const response = await handler(apiEvent(...args));
    return { statusCode: response.statusCode, body: response.body ? JSON.parse(response.body) : null };
  };
  const created = await call('POST /v1/leads/{id}/activities', { pathParameters: { id: DEMO.leadId }, body: demoActivity(now) });
  assert.equal(created.statusCode, 201);
  assert.equal(created.body.notifications, 30);
  const agenda = await call('GET /v1/agenda', { query: { days: '3' } });
  assert.equal(agenda.statusCode, 200);
  assert.ok(demoScheduled(agenda.body.notifications, now));
  assert.equal(demoScheduled(agenda.body.notifications, new Date('2027-01-01T00:00:00Z')), false);
  // Mesmo preparados (sem número), os lembretes de demonstração não geram alertas.
  for (const record of records.filter(item => item.followUpStatus)) record.followUpStatus = 'NOTIFY_PREPARED';
  for (const record of records.filter(item => item.followUpAt)) record.followUpAt = new Date(+now - 36e5).toISOString();
  const { body } = await call('GET /v1/alerts');
  assert.ok(!body.alerts.some(alert => /lembrete/.test(alert.text)), JSON.stringify(body.alerts));
});

test('o resumo compara ficheiros publicados com o Git e só reprova falhas', () => {
  assert.deepEqual(fileMismatches({ 'app.js': 'a\r\nb', 'index.html': 'x' }, { 'app.js': 'a\nb', 'index.html': 'y', 'auth.js': 'z' }), ['index.html', 'auth.js']);
  const result = summary([{ name: 'a', ok: true }, { name: 'b', ok: 'warn', detail: 'cuidado' }]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.lines, ['OK  a', 'AVISO b: cuidado']);
  assert.equal(summary([{ name: 'c', ok: false, detail: 'x' }]).ok, false);
});
