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
import { CONTACTED, LEAD_TAGS, OPEN_STATUSES, groupsOf, metrics, toLead } from '../lambda/intranet/model.mjs';
import { challengeFor, claimsOf, expired, loginUrl, tokenRequest } from '../../frontend/intranet/auth.js';

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
      ...overrides,
    },
  };
}

const request = (routeKey, { groups = '[curators]', id, body, query } = {}) => ({
  routeKey,
  pathParameters: id ? { id } : undefined,
  queryStringParameters: query,
  body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  requestContext: { authorizer: { jwt: { claims: { email: 'ana@blu.pt', 'cognito:groups': groups } } } },
});

test('the Lambda model keeps the portal lead contract', async () => {
  const source = await readFile(path.join(infraDir, '../dmc-workspace/src/lib/leads-model.ts'), 'utf8');
  assert.match(source, new RegExp(`OPEN_STATUSES = \\[${OPEN_STATUSES.map(status => `"${status}"`).join(', ')}\\]`));
  assert.match(source, new RegExp(`CONTACTED = "${CONTACTED}"`));
  const block = source.slice(source.indexOf('LEAD_TAGS'), source.indexOf('};', source.indexOf('LEAD_TAGS')));
  assert.deepEqual([...block.matchAll(/^\s+"?([a-z-]+)"?:/gm)].map(match => match[1]), LEAD_TAGS);
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
  const token = `x.${Buffer.from(JSON.stringify({ email: 'ana@blu.pt', exp: 2e9 })).toString('base64url')}.y`;
  assert.equal(claimsOf(token).email, 'ana@blu.pt');
  assert.equal(expired({ exp: 1 }), true);
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
    assert.equal(routes.length, 11);
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
    assert.doesNotMatch(JSON.stringify(apiPolicy.Properties.PolicyDocument), /dynamodb:(Scan|DeleteItem|PutItem|BatchWriteItem)|dynamodb:\*|s3:Delete|s3:Put/);
    const groups = of('AWS::Cognito::UserPoolGroup').map(group => group.Properties.GroupName).sort();
    assert.deepEqual(groups, ['curators', 'governance']);
  } finally {
    await rm(outdir, { recursive: true, force: true });
  }
});
