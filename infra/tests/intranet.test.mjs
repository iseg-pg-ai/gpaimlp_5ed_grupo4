import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { NotFound, createApp } from '../lambda/intranet/app.mjs';
import { CONTACTED, LEAD_TAGS, OPEN_STATUSES, atRisk, groupsOf, metrics, toLead } from '../lambda/intranet/model.mjs';
import { createDispatcher } from '../lambda/intranet/dispatch-core.mjs';
import { lisbonToUtc, outcome, parseActivity, plan } from '../lambda/intranet/schedule.mjs';
import { addWorkingDays, deadlineState, parseCase, parseCaseUpdate, portugueseHolidays } from '../lambda/intranet/cases.mjs';
import { dueState, parseTask, parseTaskUpdate } from '../lambda/intranet/tasks.mjs';
import { challengeFor, claimsOf, expired, loginUrl, refreshRequest, tokenRequest } from '../../frontend/intranet/auth.js';

const infraDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const S = value => ({ S: value });

const profile = (id, extra = {}) => ({
  conversationId: S(id), recordKey: S('PROFILE'), followUpStatus: S('PENDING'), followUpAt: S('2026-10-28T10:00:00Z'),
  lastActivityAt: S('2026-10-25T10:00:00Z'), lastChannel: S('website'), messageCount: { N: '2' },
  consentAt: S('2026-10-25T10:00:00Z'), journeyJson: S(JSON.stringify({ destination: 'Algarve', journeyReference: id })), ...extra,
});

function fakeDeps(overrides = {}) {
  const calls = [];
  return {
    calls,
    deps: {
      now: () => new Date('2026-10-26T12:00:00Z'),
      queryStatus: async status => (status === 'PENDING' ? [profile('BLU-AAAAAAAA0001')] : []),
      getRecords: async id => (id === 'BLU-AAAAAAAA0001' ? [profile(id)] : []),
      getTranscript: async () => [
        { occurredAtId: S('2026-10-25T10:00:01Z#b'), actor: S('assistant'), channel: S('website'), text: S('Olá!') },
        { occurredAtId: S('2026-10-25T10:00:00Z#a'), actor: S('customer'), channel: S('website'), text: S('Algarve, ana@example.com, +351 912 345 678') },
      ],
      updateProfile: async (...args) => { calls.push(['update', ...args]); },
      askRag: async (...args) => { calls.push(['ask', ...args]); return { answer: 'Resumo.', sourceIds: ['x'] }; },
      listTeam: async () => [{ email: 'ana@blu.pt', name: 'Ana', groups: ['curators'], status: 'CONFIRMED', enabled: true }],
      operations: async () => ({ queues: {} }),
      governance: async () => ({ manifest: {}, evidence: [] }),
      putRecords: async () => {},
      queryRecords: async () => [],
      policyReport: async () => null,
      newId: () => 'id-00000001',
      ...overrides,
    },
  };
}

const request = (routeKey, { groups = '[curators]', id, body, query, email = 'ana@blu.pt', name, params } = {}) => ({
  routeKey,
  pathParameters: id || params ? { ...(id ? { id } : {}), ...params } : undefined,
  queryStringParameters: query,
  body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  requestContext: { authorizer: { jwt: { claims: { email, ...(name ? { name } : {}), 'cognito:groups': groups } } } },
});

test('the Lambda model keeps the portal lead contract', async () => {
  const source = await readFile(path.join(infraDir, '../dmc-workspace/src/lib/leads-model.ts'), 'utf8');
  assert.match(source, new RegExp(`OPEN_STATUSES = \\[${OPEN_STATUSES.map(status => `"${status}"`).join(', ')}\\]`));
  assert.match(source, new RegExp(`CONTACTED = "${CONTACTED}"`));
  const block = source.slice(source.indexOf('LEAD_TAGS'), source.indexOf('};', source.indexOf('LEAD_TAGS')));
  assert.deepEqual([...block.matchAll(/^\s+"?([a-z-]+)"?:/gm)].map(match => match[1]), LEAD_TAGS);
});

test('founders give feedback to conversations, which are listed newest first', async () => {
  const stored = [];
  const { deps } = fakeDeps({
    queryStatus: async status => (status === 'PENDING' ? [profile('BLU-AAAAAAAA0001'), profile('BLU-AAAAAAAA0002', { lastActivityAt: S('2026-10-26T09:00:00Z') })] : []),
    putRecords: async (id, records) => { stored.push([id, ...records]); },
    queryRecords: async (id, prefix) => (prefix === 'FEEDBACK#' ? stored.filter(([lead]) => lead === id).map(([, record]) => Object.fromEntries(Object.entries(record).map(([key, value]) => [key, S(value)]))) : []),
  });
  const handler = createApp(deps);
  const body = { verdict: 'improve', note: 'Devia perguntar as datas mais cedo.' };
  assert.equal((await handler(request('POST /v1/leads/{id}/feedback', { id: 'BLU-AAAAAAAA0001', body }))).statusCode, 403);
  assert.equal((await handler(request('POST /v1/leads/{id}/feedback', { groups: '[founders]', id: 'BLU-AAAAAAAA0001', body: { verdict: 'improve', note: 'ok' } }))).statusCode, 400);
  assert.equal((await handler(request('POST /v1/leads/{id}/feedback', { groups: '[founders]', id: 'BLU-AAAAAAAA0001', body: { verdict: 'great', note: 'Uma frase completa.' } }))).statusCode, 400);
  assert.equal((await handler(request('POST /v1/leads/{id}/feedback', { groups: '[founders]', id: 'BLU-BBBBBBBB0009', body }))).statusCode, 404);
  assert.equal((await handler(request('POST /v1/leads/{id}/feedback', { groups: '[founders]', id: 'BLU-AAAAAAAA0001', body, name: 'Gisela' }))).statusCode, 201);
  assert.equal(stored.filter(([id]) => id === 'BLU-AAAAAAAA0001').length, 1);
  const { conversations } = JSON.parse((await handler(request('GET /v1/conversations', { groups: '[testers]' }))).body);
  assert.deepEqual(conversations.map(item => [item.id, item.feedbackCount]), [['BLU-AAAAAAAA0002', 0], ['BLU-AAAAAAAA0001', 1]]);
  assert.equal(conversations[1].lastFeedback.note, body.note);
  const { feedback } = JSON.parse((await handler(request('GET /v1/leads/{id}/feedback', { id: 'BLU-AAAAAAAA0001' }))).body);
  assert.deepEqual(feedback.map(item => [item.verdict, item.byName]), [['improve', 'Gisela']]);
});

test('Cognito groups are read from arrays and from the HTTP API "[a b]" form', () => {
  assert.deepEqual(groupsOf({ 'cognito:groups': ['curators'] }), ['curators']);
  assert.deepEqual(groupsOf({ 'cognito:groups': '[curators governance]' }), ['curators', 'governance']);
  assert.deepEqual(groupsOf({}), []);
});

test('only staff groups reach the API and only curators change leads', async () => {
  const { deps, calls } = fakeDeps();
  const handler = createApp(deps);
  assert.equal((await handler(request('GET /v1/leads', { groups: '[]' }))).statusCode, 403);
  assert.equal((await handler(request('GET /v1/leads', { groups: '[governance]' }))).statusCode, 200);
  assert.equal((await handler(request('POST /v1/leads/{id}/contacted', { groups: '[governance]', id: 'BLU-AAAAAAAA0001' }))).statusCode, 403);
  assert.equal(calls.length, 0);
  assert.equal((await handler(request('GET /v1/unknown'))).statusCode, 404);
});

test('lead routes validate input and return the chatbot transcript in order', async () => {
  const { deps, calls } = fakeDeps();
  const handler = createApp(deps);
  assert.equal((await handler(request('GET /v1/leads/{id}', { id: 'bad id' }))).statusCode, 400);
  assert.equal((await handler(request('GET /v1/leads/{id}', { id: 'BLU-MISSING00001' }))).statusCode, 404);
  assert.equal((await handler(request('GET /v1/leads', { query: { status: 'everything' } }))).statusCode, 400);
  const detail = JSON.parse((await handler(request('GET /v1/leads/{id}', { id: 'BLU-AAAAAAAA0001' }))).body);
  assert.deepEqual(detail.messages.map(message => message.actor), ['customer', 'assistant']);
  assert.deepEqual(detail.emails, ['ana@example.com']);
  assert.deepEqual(detail.phones, ['+351912345678']);
  assert.equal(detail.journey.journeyReference, undefined);
  assert.equal((await handler(request('PUT /v1/leads/{id}/tags', { id: 'BLU-AAAAAAAA0001', body: '{' }))).statusCode, 400);
  assert.equal((await handler(request('POST /v1/leads/{id}/ask', { id: 'BLU-AAAAAAAA0001', body: { question: ' ' } }))).statusCode, 400);
  assert.equal(calls.length, 0);
});

test('curator actions write only the allowed profile fields', async () => {
  const { deps, calls } = fakeDeps();
  const handler = createApp(deps);
  const id = 'BLU-AAAAAAAA0001';
  assert.equal((await handler(request('POST /v1/leads/{id}/contacted', { id }))).statusCode, 204);
  assert.equal((await handler(request('POST /v1/leads/{id}/assign', { id, body: {} }))).statusCode, 204);
  assert.equal((await handler(request('POST /v1/leads/{id}/assign', { id, body: { release: true } }))).statusCode, 204);
  assert.equal((await handler(request('PUT /v1/leads/{id}/tags', { id, body: { tags: ['hot', 'hot', 'evil'], note: ' x '.repeat(600) } }))).statusCode, 204);
  const ask = await handler(request('POST /v1/leads/{id}/ask', { id, body: { question: 'Resume.' } }));
  assert.deepEqual(JSON.parse(ask.body), { answer: 'Resumo.', sourceIds: ['x'], requiresHumanApproval: true });
  const [contacted, assign, release, tags, rag] = calls;
  assert.deepEqual(contacted[2], { followUpStatus: 'CONTACTED', contactedAt: '2026-10-26T12:00:00.000Z', contactedBy: 'ana@blu.pt', updatedAt: '2026-10-26T12:00:00.000Z' });
  assert.deepEqual(assign[2], { assignedTo: 'ana@blu.pt', assignedAt: '2026-10-26T12:00:00.000Z', updatedAt: '2026-10-26T12:00:00.000Z' });
  assert.deepEqual(release[3], ['assignedTo', 'assignedAt']);
  assert.deepEqual(tags[2].tags, ['hot']);
  assert.ok(tags[2].curatorNote.length <= 1000);
  assert.deepEqual(rag, ['ask', id, 'Resume.']);
});

test('missing profiles return 404 and internal errors are not leaked', async () => {
  const errors = [];
  const original = console.error;
  console.error = line => errors.push(line);
  try {
    const handler = createApp(fakeDeps({
      updateProfile: async () => { throw new NotFound(); },
      listTeam: async () => { throw Object.assign(new Error('ana@example.com secret'), { name: 'AccessDenied' }); },
    }).deps);
    assert.equal((await handler(request('POST /v1/leads/{id}/contacted', { id: 'BLU-AAAAAAAA0001' }))).statusCode, 404);
    const failed = await handler(request('GET /v1/team'));
    assert.equal(failed.statusCode, 500);
    assert.doesNotMatch(failed.body + errors.join(''), /ana@example|secret/);
  } finally {
    console.error = original;
  }
});

test('metrics exclude synthetic leads and count overdue and unassigned work', () => {
  const lead = extra => toLead(profile('BLU-AAAAAAAA0001', extra));
  const result = metrics([
    lead({ followUpAt: S('2026-10-20T00:00:00Z') }),
    lead({ followUpStatus: S('CONTACTED'), contactedAt: S('2026-10-25T14:00:00Z') }),
    lead({ assignedTo: S('ana@blu.pt') }),
    lead({ synthetic: { BOOL: true } }),
  ], new Date('2026-10-26T00:00:00Z'));
  assert.equal(result.total, 3);
  assert.equal(result.synthetic, 1);
  assert.equal(result.overdue, 1);
  assert.equal(result.unassigned, 1);
  assert.equal(result.medianHoursToContact, 4);
});

test('team view counts open leads per owner', async () => {
  const handler = createApp(fakeDeps({ queryStatus: async status => (status === 'PENDING' ? [profile('BLU-AAAAAAAA0001', { assignedTo: S('ana@blu.pt') })] : []) }).deps);
  const { members } = JSON.parse((await handler(request('GET /v1/team'))).body);
  assert.equal(members[0].openLeads, 1);
});

test('the web login uses PKCE S256 and keeps the exchange on the Cognito domain', async () => {
  // Vetor de teste do RFC 7636, apêndice B.
  assert.equal(await challengeFor('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  const config = { authDomain: 'https://login.example.auth.eu-west-1.amazoncognito.com', clientId: 'client', redirectUri: 'https://intranet.example/' };
  const url = new URL(loginUrl(config, { state: 'st', challenge: 'ch' }));
  assert.equal(url.pathname, '/oauth2/authorize');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('redirect_uri'), config.redirectUri);
  const exchange = tokenRequest(config, { code: 'c', verifier: 'v' });
  assert.equal(new URL(exchange.url).origin, config.authDomain);
  assert.match(exchange.init.body, /code_verifier=v/);
  const renewal = refreshRequest(config, 'r');
  assert.equal(renewal.url, exchange.url);
  assert.equal(new URLSearchParams(renewal.init.body).get('grant_type'), 'refresh_token');
  assert.equal(new URLSearchParams(renewal.init.body).get('refresh_token'), 'r');
  const token = `x.${Buffer.from(JSON.stringify({ email: 'ana@blu.pt', exp: 2e9 })).toString('base64url')}.y`;
  assert.equal(claimsOf(token).email, 'ana@blu.pt');
  assert.equal(expired({ exp: 1 }), true);
});

const partners = [{ id: 'tuk-alfama', name: 'Tuk-tuk Alfama', whatsapp: '351910000000', license: { type: 'RNAAT', number: '1-2020' } }, { id: 'tuk-belem', name: 'Tuk-tuk Belém', whatsapp: '' }];
const morning = { kind: 'pickup', title: 'Recolha no hotel', place: 'Hotel Alfama', date: '2026-11-02', time: '09:30', people: '3', partnerId: 'tuk-alfama' };

test('activity requests are validated before anything is scheduled', () => {
  const now = new Date('2026-10-26T12:00:00Z');
  assert.match(parseActivity({ ...morning, kind: 'helicopter' }, partners, now).error, /recolha ou excursão/);
  assert.match(parseActivity({ ...morning, time: '25:00' }, partners, now).error, /data e hora/);
  assert.match(parseActivity({ ...morning, repeatUntil: '2026-12-31' }, partners, now).error, /31 dias/);
  assert.match(parseActivity({ ...morning, partnerId: 'nobody' }, partners, now).error, /Parceiro/);
  assert.match(parseActivity({ ...morning, date: '2026-10-01' }, partners, now).error, /já passou/);
  assert.equal(parseActivity({ ...morning, repeatUntil: '2026-11-04' }, partners, now).activity.days, 3);
});

test('Lisbon times convert to UTC in summer and winter time', () => {
  assert.equal(lisbonToUtc('2026-07-01', '09:30').toISOString(), '2026-07-01T08:30:00.000Z');
  assert.equal(lisbonToUtc('2026-12-01', '09:30').toISOString(), '2026-12-01T09:30:00.000Z');
});

test('daily pickups plan one reminder set per day for traveller and partner', () => {
  const now = new Date('2026-10-26T12:00:00Z');
  const { activity } = parseActivity({ ...morning, repeatUntil: '2026-11-03' }, partners, now);
  const notifications = plan(activity, { activityId: 'act-12345678', travellerPhone: '351912345678', partner: partners[0], now });
  assert.equal(notifications.length, 8);
  const first = notifications.filter(n => n.occurrenceAt === '2026-11-02T09:30:00.000Z');
  assert.deepEqual(first.map(n => n.sendAt).sort(), ['2026-11-01T18:00:00.000Z', '2026-11-01T18:00:00.000Z', '2026-11-02T07:30:00.000Z', '2026-11-02T08:30:00.000Z']);
  assert.match(first.find(n => n.audience === 'partner').text, /Responda OK/);
  assert.match(first.find(n => n.audience === 'traveller').text, /Tuk-tuk Alfama will meet you/);
  assert.ok(notifications.every(n => n.recordKey.startsWith(`NOTIFY#${n.sendAt}#act-12345678#`)));
});

test('travellers can get reminders by email or SMS and never without consent', () => {
  const now = new Date('2026-10-26T12:00:00Z');
  const { activity } = parseActivity({ ...morning, travellerChannel: 'email', partnerChannel: 'sms' }, partners, now);
  const notifications = plan(activity, { activityId: 'act-12345678', travellerPhone: '351912345678', travellerEmail: 'ana@example.com', partner: partners[0], now });
  assert.deepEqual([...new Set(notifications.filter(n => n.audience === 'traveller').map(n => `${n.channel}:${n.to}`))], ['email:ana@example.com']);
  assert.deepEqual([...new Set(notifications.filter(n => n.audience === 'partner').map(n => n.channel))], ['sms']);
  assert.equal(parseActivity({ ...morning, travellerChannel: 'pigeon' }, partners, now).activity.travellerChannel, 'whatsapp');
  const noConsent = plan(activity, { activityId: 'act-12345678', travellerEmail: 'ana@example.com', partner: partners[0], travellerConsent: false, now });
  assert.ok(noConsent.every(n => n.audience === 'partner'));
});

test('real partners without a licence cannot be booked', () => {
  const unlicensed = [{ id: 'tuk-real', name: 'Tuk real', whatsapp: '351910000001' }];
  assert.match(parseActivity({ ...morning, partnerId: 'tuk-real' }, unlicensed, new Date('2026-10-26T12:00:00Z')).error, /licença/);
});

test('Bolt rides send the traveller a booking link and nothing to partners', () => {
  const now = new Date('2026-10-26T12:00:00Z');
  const { activity } = parseActivity({ ...morning, partnerId: 'bolt' }, partners, now);
  const notifications = plan(activity, { activityId: 'act-12345678', travellerPhone: '', partner: undefined, now });
  assert.deepEqual([...new Set(notifications.map(n => n.audience))], ['traveller']);
  assert.match(notifications[0].text, /https:\/\/bolt\.eu\//);
  assert.equal(notifications[0].to, '');
});

test('send outcomes: no number or no WhatsApp setup is prepared, stale reminders are skipped', () => {
  assert.equal(outcome({ to: '', error: '' }).status, 'NOTIFY_PREPARED');
  assert.equal(outcome({ to: '351', error: 'WhatsApp accessToken is not configured' }).status, 'NOTIFY_PREPARED');
  assert.equal(outcome({ to: 'a@b.pt', error: 'Email channel is not configured' }).status, 'NOTIFY_PREPARED');
  assert.equal(outcome({ to: '351', error: 'provider code 131047' }).status, 'NOTIFY_FAILED');
  assert.equal(outcome({ to: '351', error: '', late: true }).status, 'NOTIFY_MISSED');
  assert.equal(outcome({ to: '351', error: '' }).status, 'NOTIFY_SENT');
});

test('the dispatcher sends each due reminder once and records evidence without content', async () => {
  const item = (key, extra = {}) => ({ conversationId: S('BLU-AAAAAAAA0001'), recordKey: S(key), followUpAt: S('2026-11-02T08:30:00.000Z'), to: S('351912345678'), text: S('Olá'), audience: S('traveller'), approvedBy: S('ana@blu.pt'), ...extra });
  const sent = [];
  const finished = [];
  let evidence;
  const dispatch = createDispatcher({
    now: () => new Date('2026-11-02T08:31:00Z'),
    queryDue: async () => [item('NOTIFY#a'), item('NOTIFY#b'), item('NOTIFY#c', { to: S('') })],
    claim: async (id, key) => key !== 'NOTIFY#b',
    send: async message => { sent.push(message); },
    requestIdFor: key => `notify-${key.length}0000000`,
    finish: async (id, key, set) => { finished.push([key, set.followUpStatus]); },
    evidence: async (now, results) => { evidence = results; },
  });
  const summary = await dispatch();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].approvedBy, 'ana@blu.pt');
  assert.deepEqual(finished, [['NOTIFY#a', 'NOTIFY_SENT'], ['NOTIFY#c', 'NOTIFY_PREPARED']]);
  assert.doesNotMatch(JSON.stringify(evidence), /351912345678|Olá/);
  assert.equal(summary.sent, 1);
});

test('curators schedule and cancel activities; the API never returns phone numbers', async () => {
  const records = [];
  const updates = [];
  const { deps } = fakeDeps({
    partners,
    newId: () => 'act-12345678',
    putRecords: async (id, list) => { records.push(...list); },
    queryRecords: async (id, prefix) => records.filter(r => r.recordKey.startsWith(prefix)).map(r => Object.fromEntries(Object.entries({ conversationId: id, ...r }).map(([k, v]) => [k, S(String(v))]))),
    setRecord: async (...args) => { updates.push(args); },
  });
  const handler = createApp(deps);
  const id = 'BLU-AAAAAAAA0001';
  assert.equal((await handler(request('POST /v1/leads/{id}/activities', { id, groups: '[governance]', body: morning }))).statusCode, 403);
  assert.equal((await handler(request('POST /v1/leads/{id}/activities', { id, body: { ...morning, title: '' } }))).statusCode, 400);
  const created = await handler(request('POST /v1/leads/{id}/activities', { id, body: morning }));
  assert.equal(created.statusCode, 201);
  assert.equal(JSON.parse(created.body).notifications, 4);
  assert.equal(records.find(r => r.recordKey.startsWith('NOTIFY#') && r.audience === 'traveller').to, '351912345678');
  const listed = (await handler(request('GET /v1/leads/{id}/activities', { id }))).body;
  assert.doesNotMatch(listed, /351912345678|351910000000/);
  assert.equal(JSON.parse(listed).activities[0].title, 'Recolha no hotel');
  const cancel = await handler({ ...request('POST /v1/leads/{id}/activities/{activityId}/cancel', { id }), pathParameters: { id, activityId: 'act-12345678' } });
  assert.equal(cancel.statusCode, 204);
  assert.equal(updates.filter(u => u[2].followUpStatus === 'NOTIFY_CANCELLED').length, 4);
});

test('working days skip weekends and Portuguese national holidays', () => {
  assert.ok(portugueseHolidays(2026).has('2026-04-03'));
  assert.ok(portugueseHolidays(2026).has('2026-06-04'));
  assert.equal(addWorkingDays('2026-11-27', 1), '2026-11-30');
  assert.equal(addWorkingDays('2026-11-30', 1), '2026-12-02');
  assert.equal(addWorkingDays('2026-10-26', 15), '2026-11-16');
});

test('Livro de Reclamações cases keep the 15 working-day legal deadline', () => {
  const staff = ['ana@blu.pt'];
  const livro = parseCase({ type: 'livro', title: 'Reclamação 123', receivedOn: '2026-10-26', deadline: '2026-12-31' }, { staff, today: '2026-10-26' });
  assert.equal(livro.record.deadline, '2026-11-16');
  assert.match(parseCase({ type: 'legal', title: 'Processo' }, { staff, today: '2026-10-26' }).error, /prazo/);
  assert.match(parseCase({ type: 'complaint', title: 'x', owner: 'stranger@x.pt' }, { staff, today: '2026-10-26' }).error, /equipa/);
  assert.match(parseCase({ type: 'complaint', title: 'x', receivedOn: '2026-12-01' }, { staff, today: '2026-10-26' }).error, /futura/);
  assert.match(parseCaseUpdate({ deadline: '2026-12-31' }, livro.record, { staff }).error, /não pode ser alargado/);
  assert.match(parseCaseUpdate({ status: 'closed' }, livro.record, { staff }).error, /resolução/);
  assert.equal(parseCaseUpdate({ status: 'closed', resolution: 'Reembolso parcial.' }, livro.record, { staff }).set.followUpStatus, 'CASE_CLOSED');
  assert.equal(deadlineState({ caseStatus: 'new', deadline: '2026-10-20' }, '2026-10-26'), 'overdue');
  assert.equal(deadlineState({ caseStatus: 'new', deadline: '2026-10-27' }, '2026-10-26'), 'due-soon');
});

test('cases are opened against a lead or unlinked, and testers cannot see them', async () => {
  const stored = [];
  const handler = createApp(fakeDeps({
    newId: () => 'case-12345678',
    putRecords: async (id, list) => { stored.push(...list.map(record => ({ id, ...record }))); },
  }).deps);
  assert.equal((await handler(request('GET /v1/cases', { groups: '[testers]' }))).statusCode, 403);
  assert.equal((await handler(request('POST /v1/cases', { body: { type: 'complaint', title: 'x', leadId: 'BLU-MISSING00001' } }))).statusCode, 404);
  const linked = await handler(request('POST /v1/cases', { body: { type: 'complaint', title: 'Atraso na recolha', leadId: 'BLU-AAAAAAAA0001', owner: 'ana@blu.pt' } }));
  assert.equal(linked.statusCode, 201);
  assert.equal(JSON.parse(linked.body).partition, 'BLU-AAAAAAAA0001');
  const unlinked = await handler(request('POST /v1/cases', { groups: '[governance]', body: { type: 'livro', title: 'Livro 42' } }));
  assert.equal(JSON.parse(unlinked.body).partition, 'CASES-UNLINKED');
  assert.ok(stored.some(record => record.recordKey === 'CASE#case-12345678' && record.followUpStatus === 'CASE_OPEN'));
  assert.ok(stored.some(record => record.recordKey.startsWith('CASELOG#case-12345678#')));
});

test('alerts point each problem to the screen that fixes it', async () => {
  const handler = createApp(fakeDeps({
    operations: async () => ({ queues: { failedEvents: { waiting: 2 }, conversationEvents: { waiting: 0 }, curatorTasks: { waiting: 0 } }, workers: [{ name: 'BluCostaFrontend-BedrockChat', errors24h: 3 }], churnReview: null }),
    policyReport: async () => ({ summary: { fail: 2 } }),
    queryAgenda: async status => (status === 'NOTIFY_PREPARED' ? [{}] : []),
  }).deps);
  const { alerts } = JSON.parse((await handler(request('GET /v1/alerts', { groups: '[testers]' }))).body);
  const tabs = Object.fromEntries(alerts.map(alert => [alert.text.split(' ')[1], alert.tab]));
  assert.equal(alerts[0].level, 'bad');
  assert.ok(alerts.some(alert => alert.tab === 'operations' && /fila de erros/.test(alert.text)));
  assert.ok(alerts.some(alert => alert.tab === 'operations' && /BedrockChat/.test(alert.text)));
  assert.ok(alerts.some(alert => alert.tab === 'operations' && /redes sociais/.test(alert.text)));
  assert.ok(alerts.some(alert => alert.tab === 'agenda'));
  assert.ok(alerts.some(alert => alert.tab === 'governance'));
  assert.ok(!alerts.some(alert => alert.tab === 'cases'));
  assert.ok(tabs);
});

test('security overview is limited to founders and governance', async () => {
  const handler = createApp(fakeDeps({ policyReport: async () => ({ summary: { pass: 10, fail: 2, manual: 3 } }) }).deps);
  assert.equal((await handler(request('GET /v1/security'))).statusCode, 403);
  const overview = JSON.parse((await handler(request('GET /v1/security', { groups: '[governance]' }))).body);
  assert.match(overview.findings.map(item => item.text).join(' '), /fundador/);
  assert.equal(overview.policies.fail, 2);
});

test('tasks validate owner, due date and the reason for a block', () => {
  const staff = ['ana@blu.pt', 'gisela@blu.pt'];
  const user = { email: 'Ana@blu.pt' };
  assert.equal(parseTask({ title: ' ' }, { staff, user }).error, 'Indique o que há a fazer.');
  assert.equal(parseTask({ title: 'x', owner: 'fora@example.com' }, { staff, user }).error, 'O responsável tem de ser um membro da equipa.');
  assert.equal(parseTask({ title: 'x', due: '26/10' }, { staff, user }).error, 'Prazo inválido.');
  assert.deepEqual(parseTask({ title: 'Confirmar tuk-tuk' }, { staff, user }).record, { title: 'Confirmar tuk-tuk', note: '', owner: 'ana@blu.pt', due: '', caseId: '', taskStatus: 'todo' });
  const current = { title: 'x', owner: 'ana@blu.pt', due: '', status: 'blocked', blockedReason: 'À espera do hotel' };
  assert.equal(parseTaskUpdate({ status: 'blocked' }, { ...current, status: 'todo', blockedReason: '' }, { staff }).error, 'Diga o que está a bloquear a tarefa.');
  assert.deepEqual(parseTaskUpdate({ status: 'doing' }, current, { staff }).set, { taskStatus: 'doing', blockedReason: '' });
  assert.equal(parseTaskUpdate({}, current, { staff }).error, 'Nada para atualizar.');
  assert.equal(dueState({ status: 'todo', due: '2026-10-25' }, '2026-10-26'), 'overdue');
  assert.equal(dueState({ status: 'todo', due: '2026-10-28' }, '2026-10-26'), 'soon');
  assert.equal(dueState({ status: 'done', due: '2026-10-25' }, '2026-10-26'), 'done');
  assert.equal(dueState({ status: 'todo', due: '' }, '2026-10-26'), 'none');
});

// Tabela em memória com o mesmo contrato de index.mjs (registos novos, atualização, consultas).
function taskTable(extra = {}) {
  const rows = [];
  const dyn = row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, { S: String(value) }]));
  let next = 0;
  let tick = 0;
  const { deps } = fakeDeps({
    // Cada pedido um segundo depois do anterior, para o feed ter uma ordem estável.
    now: () => new Date(Date.parse('2026-10-26T12:00:00Z') + tick++ * 1000),
    newId: () => `id-${String(++next).padStart(8, '0')}`,
    putRecords: async (id, list) => { rows.push(...list.map(record => Object.fromEntries(Object.entries({ conversationId: id, ...record }).filter(([, value]) => value !== '' && value !== undefined)))); },
    setRecord: async (id, key, set) => { const row = rows.find(item => item.conversationId === id && item.recordKey === key); if (!row) throw new NotFound(); Object.assign(row, set); },
    queryRecords: async (id, prefix) => rows.filter(item => item.conversationId === id && item.recordKey.startsWith(prefix)).map(dyn),
    queryStatus: async status => (status === 'PENDING' ? [profile('BLU-AAAAAAAA0001', extra.profile ?? {})] : rows.filter(item => item.followUpStatus === status).map(dyn)),
    queryAgenda: async (status, from, to) => rows.filter(item => item.followUpStatus === status && item.followUpAt >= from && item.followUpAt <= to).map(dyn),
    listTeam: async () => [
      { email: 'ana@blu.pt', name: 'Ana', groups: ['curators'], status: 'CONFIRMED', enabled: true },
      { email: 'gisela@blu.pt', name: 'Gisela', groups: ['founders'], status: 'CONFIRMED', enabled: true },
    ],
  });
  return { rows, handler: createApp(deps) };
}

test('a task moves from Por fazer to Feito, is archived, logged and shown in the team feed', async () => {
  const { rows, handler } = taskTable();
  const ana = { email: 'ana@blu.pt', name: 'Ana' };
  const gisela = { email: 'gisela@blu.pt', name: 'Gisela', groups: '[founders]' };
  const created = await handler(request('POST /v1/tasks', { ...ana, body: { title: 'Confirmar tuk-tuk', owner: 'gisela@blu.pt', due: '2026-10-25', leadId: 'BLU-AAAAAAAA0001' } }));
  assert.equal(created.statusCode, 201);
  const { taskId, partition } = JSON.parse(created.body);
  assert.equal(partition, 'BLU-AAAAAAAA0001');
  const task = rows.find(row => row.recordKey === `TASK#${taskId}`);
  assert.equal(task.followUpStatus, 'TASK_OPEN');
  assert.equal(task.leadLabel, 'Algarve');

  const work = JSON.parse((await handler(request('GET /v1/work', gisela))).body);
  assert.deepEqual(work.items.map(item => [item.kind, item.title, item.urgency]), [['task', 'Confirmar tuk-tuk', 'overdue']]);
  assert.equal(JSON.parse((await handler(request('GET /v1/work', ana))).body).items.length, 0);

  const path = { params: { taskId }, id: partition };
  assert.equal((await handler(request('POST /v1/leads/{id}/tasks/{taskId}', { ...gisela, ...path, body: { status: 'blocked' } }))).statusCode, 400);
  assert.equal((await handler(request('POST /v1/leads/{id}/tasks/{taskId}', { ...gisela, ...path, body: { status: 'blocked', blockedReason: 'À espera do parceiro' } }))).statusCode, 204);
  const members = JSON.parse((await handler(request('GET /v1/team', gisela))).body).members;
  assert.deepEqual(members.map(member => [member.name, member.openTasks, member.overdueTasks, member.blockedTasks]), [['Ana', 0, 0, 0], ['Gisela', 1, 1, 1]]);

  assert.equal((await handler(request('POST /v1/leads/{id}/tasks/{taskId}', { ...gisela, ...path, body: { status: 'done' } }))).statusCode, 204);
  assert.equal(task.followUpStatus, 'TASK_DONE');
  assert.equal(task.blockedReason, '');
  assert.equal(JSON.parse((await handler(request('GET /v1/tasks', gisela))).body).tasks.length, 0);
  assert.deepEqual(JSON.parse((await handler(request('GET /v1/tasks', { ...gisela, query: { status: 'done' } }))).body).tasks.map(item => item.id), [taskId]);

  const detail = JSON.parse((await handler(request('GET /v1/leads/{id}/tasks/{taskId}', { ...gisela, ...path }))).body);
  assert.equal(detail.log.length, 3);
  assert.match(detail.log[0].text, /Gisela moveu «Confirmar tuk-tuk» para Feito/);
  const { feed } = JSON.parse((await handler(request('GET /v1/feed', { groups: '[testers]', email: 'teste@blu.pt' }))).body);
  assert.deepEqual(feed.map(entry => `${entry.byName} ${entry.text}`), [
    'Gisela moveu «Confirmar tuk-tuk» para Feito',
    'Gisela bloqueou «Confirmar tuk-tuk»: À espera do parceiro',
    'Ana criou «Confirmar tuk-tuk» para Gisela',
  ]);
  assert.ok(!rows.some(row => row.recordKey.startsWith('TASK#') && row.followUpStatus === undefined));
});

test('testers see work and feed but cannot change tasks; case news stays with case roles', async () => {
  const { handler } = taskTable();
  const tester = { groups: '[testers]', email: 'teste@blu.pt' };
  assert.equal((await handler(request('GET /v1/work', tester))).statusCode, 200);
  assert.equal((await handler(request('POST /v1/tasks', { ...tester, body: { title: 'x' } }))).statusCode, 403);
  assert.equal((await handler(request('POST /v1/leads/{id}/tasks/{taskId}', { ...tester, id: 'TASKS-UNLINKED', params: { taskId: 'id-00000001' }, body: { status: 'done' } }))).statusCode, 403);
  assert.equal((await handler(request('DELETE /v1/leads/{id}/tasks/{taskId}', { id: 'TASKS-UNLINKED', params: { taskId: 'id-00000001' } }))).statusCode, 404);
  assert.equal((await handler(request('POST /v1/leads/{id}/tasks/{taskId}', { id: 'TASKS-UNLINKED', params: { taskId: 'bad' }, body: {} }))).statusCode, 400);
  const own = await handler(request('POST /v1/tasks', { groups: '[governance]', email: 'gov@blu.pt', body: { title: 'Rever política', owner: 'ana@blu.pt' } }));
  assert.equal(JSON.parse(own.body).partition, 'TASKS-UNLINKED');
  await handler(request('POST /v1/cases', { body: { type: 'complaint', title: 'Atraso na recolha' } }));
  const seen = async groups => JSON.parse((await handler(request('GET /v1/feed', { groups }))).body).feed.map(entry => entry.text);
  assert.ok((await seen('[curators]')).some(text => /abriu o caso/.test(text)));
  assert.ok(!(await seen('[testers]')).some(text => /caso/.test(text)));
});

test('my work puts a lead who wants to quit before overdue tasks', async () => {
  const { handler } = taskTable({ profile: { assignedTo: S('ana@blu.pt'), churnSignalAt: S('2026-10-26T09:00:00Z'), churnSignal: S('desisto') } });
  await handler(request('POST /v1/tasks', { body: { title: 'Pedir resposta ao hotel', due: '2026-10-20' } }));
  await handler(request('POST /v1/tasks', { body: { title: 'Sem prazo' } }));
  const { items } = JSON.parse((await handler(request('GET /v1/work'))).body);
  assert.deepEqual(items.map(item => [item.kind, item.urgency]), [['lead', 'risk'], ['task', 'overdue'], ['task', 'normal']]);
});

const siteBuilt = existsSync(path.join(infraDir, '../frontend/blu-cloud-site/dist/client'));

test('the intranet stack protects every route and grants no destructive data access', { skip: !siteBuilt && 'build frontend/blu-cloud-site first' }, async () => {
  const outdir = await mkdtemp(path.join(tmpdir(), 'blu-intranet-'));
  try {
    await promisify(execFile)(process.execPath, ['aws-split-app.mjs'], {
      cwd: infraDir,
      env: { ...process.env, TARGET_AWS_ACCOUNT_ID: '123456789012', TARGET_AWS_REGION: 'eu-west-1', CDK_OUTDIR: outdir, CDK_CONTEXT_JSON: JSON.stringify({ 'aws:cdk:disable-asset-staging': true }) },
    });
    const template = JSON.parse(await readFile(path.join(outdir, 'BluCostaIntranet.template.json'), 'utf8'));
    const of = type => Object.values(template.Resources).filter(resource => resource.Type === type);
    const routes = of('AWS::ApiGatewayV2::Route');
    assert.equal(routes.length, 39);
    for (const route of routes) assert.equal(route.Properties.AuthorizationType, 'JWT', route.Properties.RouteKey);
    const [pool] = of('AWS::Cognito::UserPool');
    assert.equal(pool.Properties.MfaConfiguration, 'ON');
    assert.equal(pool.Properties.AdminCreateUserConfig.AllowAdminCreateUserOnly, true);
    assert.equal(Object.values(template.Resources).find(resource => resource.Type === 'AWS::Cognito::UserPool').DeletionPolicy, 'Retain');
    const [api] = of('AWS::ApiGatewayV2::Api');
    assert.equal(api.Properties.CorsConfiguration.AllowOrigins.length, 1);
    assert.doesNotMatch(JSON.stringify(api.Properties.CorsConfiguration), /"\*"/);
    // A função de deploy do CDK escreve no bucket do próprio site; a API não pode apagar nem escrever dados.
    const apiPolicy = of('AWS::IAM::Policy').find(policy => JSON.stringify(policy.Properties.Roles).includes('IntranetApiHandler'));
    assert.ok(apiPolicy);
    assert.doesNotMatch(JSON.stringify(apiPolicy.Properties.PolicyDocument), /dynamodb:(Scan|DeleteItem|BatchWriteItem)|dynamodb:\*|s3:Delete|s3:Put/);
    // Sem ciclo API → distribuição → cabeçalhos → API (o CloudFormation recusaria o deploy).
    const [headers] = of('AWS::CloudFront::ResponseHeadersPolicy');
    assert.doesNotMatch(JSON.stringify(headers.Properties), /IntranetApi/);
    const groups = of('AWS::Cognito::UserPoolGroup').map(group => group.Properties.GroupName).sort();
    assert.deepEqual(groups, ['curators', 'founders', 'governance', 'testers']);
  } finally {
    await rm(outdir, { recursive: true, force: true });
  }
});

test('leads that signal quitting come first, raise an alert and clear once contacted', async () => {
  const churning = profile('BLU-AAAAAAAA0002', { followUpAt: S('2026-10-29T10:00:00Z'), churnSignalAt: S('2026-10-26T11:00:00Z'), churnSignal: S('give up') });
  const handler = createApp(fakeDeps({
    queryStatus: async status => (status === 'PENDING' ? [profile('BLU-AAAAAAAA0001'), churning] : []),
    operations: async () => null,
    policyReport: async () => null,
    queryAgenda: async () => [],
  }).deps);
  const { leads } = JSON.parse((await handler(request('GET /v1/leads'))).body);
  assert.deepEqual(leads.map(lead => [lead.id, lead.atRisk]), [['BLU-AAAAAAAA0002', true], ['BLU-AAAAAAAA0001', false]]);
  const { alerts } = JSON.parse((await handler(request('GET /v1/alerts'))).body);
  assert.ok(alerts.some(alert => alert.level === 'bad' && alert.tab === 'leads' && /desistir/.test(alert.text)));
  assert.equal(atRisk(toLead({ ...churning, contactedAt: S('2026-10-26T11:30:00Z') })), false);
  assert.equal(atRisk(toLead({ ...churning, contactedAt: S('2026-10-20T11:30:00Z') })), true);
});
