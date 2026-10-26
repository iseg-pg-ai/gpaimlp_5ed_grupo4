import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import http from 'node:http';
import { COOKIE, createGate, readCookie, verifyIdToken } from '../portal/gate.mjs';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const keys = [{ ...publicKey.export({ format: 'jwk' }), kid: 'test-key', alg: 'RS256', use: 'sig' }];
const issuer = 'https://cognito-idp.eu-west-1.amazonaws.com/eu-west-1_test';
const settings = { keys, issuer, clientId: 'portal-client', allowedGroups: ['founders', 'curators'] };
const now = () => Math.floor(Date.now() / 1000);

function token(claims = {}, header = {}, key = privateKey) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const body = `${encode({ alg: 'RS256', kid: 'test-key', ...header })}.${encode({ iss: issuer, aud: 'portal-client', token_use: 'id', exp: now() + 3600, 'cognito:groups': ['curators'], email: 'curadora@example.com', ...claims })}`;
  return `${body}.${sign('RSA-SHA256', Buffer.from(body), key).toString('base64url')}`;
}

test('o ID token só é aceite com assinatura, emissor, cliente, validade e grupo certos', () => {
  assert.equal(verifyIdToken(token(), settings).email, 'curadora@example.com');
  assert.equal(verifyIdToken(token({ 'cognito:groups': ['founders', 'testers'] }), settings)['cognito:groups'][0], 'founders');
  const other = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
  for (const [bad, reason] of [
    [token({}, {}, other), 'signature'],
    [token({ iss: 'https://evil.example' }), 'audience'],
    [token({ aud: 'intranet-client' }), 'audience'],
    [token({ token_use: 'access' }), 'audience'],
    [token({ exp: now() - 3600 }), 'expired'],
    [token({ 'cognito:groups': ['testers'] }), 'forbidden'],
    [token({ 'cognito:groups': undefined }), 'forbidden'],
    [token({}, { kid: 'unknown' }), 'unknown key'],
    [token({}, { alg: 'none' }), 'algorithm'],
    ['not.a-token', 'malformed'],
    ['', 'malformed'],
  ]) assert.throws(() => verifyIdToken(bad, settings), { message: reason });
});

test('readCookie encontra o cookie do portal entre outros', () => {
  assert.equal(readCookie(`a=1; ${COOKIE}=abc.def.ghi; b=2`, COOKIE), 'abc.def.ghi');
  assert.equal(readCookie('a=1', COOKIE), '');
  assert.equal(readCookie(undefined, COOKIE), '');
});

async function withGate(run) {
  const seen = [];
  const upstream = http.createServer((req, res) => {
    seen.push({ method: req.method, url: req.url, cookie: req.headers.cookie, proto: req.headers['x-forwarded-proto'] });
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('portal');
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const gate = http.createServer(createGate({
    region: 'eu-west-1', userPoolId: 'eu-west-1_test', clientId: 'portal-client', keys,
    authDomain: 'https://login.example', publicOrigin: 'https://portal.example',
    upstreamHost: '127.0.0.1', upstreamPort: upstream.address().port,
  }));
  await new Promise(resolve => gate.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${gate.address().port}`;
  try {
    await run({ base, seen });
  } finally {
    gate.close();
    upstream.close();
  }
}

test('sem sessão, as páginas vão para o login e os pedidos de dados recebem 401', () => withGate(async ({ base, seen }) => {
  const page = await fetch(`${base}/itineraries?x=1`, { headers: { accept: 'text/html' }, redirect: 'manual' });
  assert.equal(page.status, 302);
  assert.equal(page.headers.get('location'), '/auth/login?next=%2Fitineraries%3Fx%3D1');
  const data = await fetch(`${base}/api/versions`, { method: 'POST', redirect: 'manual' });
  assert.equal(data.status, 401);
  const forbidden = await fetch(`${base}/`, { headers: { cookie: `${COOKIE}=${token({ 'cognito:groups': ['governance'] })}` } });
  assert.equal(forbidden.status, 403);
  assert.equal(seen.length, 0);
}));

test('com sessão válida, o pedido chega ao portal sem o cookie do token', () => withGate(async ({ base, seen }) => {
  const response = await fetch(`${base}/api/leads?status=open`, { headers: { cookie: `theme=dark; ${COOKIE}=${token()}` } });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'portal');
  assert.deepEqual(seen, [{ method: 'GET', url: '/api/leads?status=open', cookie: 'theme=dark', proto: 'https' }]);
}));

test('a sessão só nasce de um token válido, enviado do próprio portal em JSON', () => withGate(async ({ base }) => {
  const post = (body, headers = {}) => fetch(`${base}/auth/session`, { method: 'POST', headers: { origin: 'https://portal.example', 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const ok = await post({ idToken: token() });
  assert.equal(ok.status, 204);
  const cookie = ok.headers.get('set-cookie');
  assert.match(cookie, new RegExp(`^${COOKIE}=`));
  assert.match(cookie, /Secure; HttpOnly; SameSite=Lax; Max-Age=3[56]\d\d/);
  assert.equal((await post({ idToken: token() }, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await post({ idToken: token() }, { 'content-type': 'text/plain' })).status, 415);
  assert.equal((await post({ idToken: token({ exp: now() - 3600 }) })).status, 401);
  assert.equal((await post({ idToken: token({ 'cognito:groups': ['testers'] }) })).status, 403);
  assert.equal((await post({ idToken: 'x'.repeat(9000) })).status, 413);
}));

test('as páginas de login são públicas, sem cache e com CSP restrita', () => withGate(async ({ base, seen }) => {
  for (const pathname of ['/auth/login', '/auth/callback', '/auth/signed-out', '/auth/login.js', '/auth/auth.js', '/auth/login.css', '/auth/health']) {
    const response = await fetch(`${base}${pathname}`);
    assert.equal(response.status, 200, pathname);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.match(response.headers.get('content-security-policy'), /script-src 'self'; style-src 'self'; connect-src 'self' https:\/\/login\.example/);
  }
  const config = await (await fetch(`${base}/auth/config.json`)).json();
  assert.deepEqual(config, { authDomain: 'https://login.example', clientId: 'portal-client', origin: 'https://portal.example' });
  const logout = await fetch(`${base}/auth/logout`, { redirect: 'manual' });
  assert.equal(logout.status, 302);
  assert.equal(logout.headers.get('location'), 'https://login.example/logout?client_id=portal-client&logout_uri=https%3A%2F%2Fportal.example%2Fauth%2Fsigned-out');
  assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal(seen.length, 0);
}));

test('o portal parado devolve 502 com uma mensagem simples', async () => {
  const gate = http.createServer(createGate({ region: 'eu-west-1', userPoolId: 'eu-west-1_test', clientId: 'portal-client', keys, authDomain: 'https://login.example', publicOrigin: 'https://portal.example', upstreamPort: 1 }));
  await new Promise(resolve => gate.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${gate.address().port}/`, { headers: { cookie: `${COOKIE}=${token()}` } });
    assert.equal(response.status, 502);
    assert.match(await response.text(), /a arrancar/);
  } finally {
    gate.close();
  }
});
