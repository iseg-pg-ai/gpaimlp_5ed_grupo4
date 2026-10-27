// Portão de login do portal: só deixa passar pedidos com um ID token Cognito válido
// de fundadores ou curadores. Corre no servidor privado, à frente do Next.js, sem
// dependências nem acesso à internet: as chaves públicas (JWKS) vêm com o build.
import { createPublicKey, verify } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const COOKIE = '__Host-blu-portal';
const SKEW_SECONDS = 60;
const BODY_LIMIT = 8192;
const here = path.dirname(fileURLToPath(import.meta.url));
// O PKCE reutiliza o módulo de login da intranet (uma só implementação).
const PUBLIC_FILES = {
  '/auth/login.js': [path.join(here, 'public/login.js'), 'text/javascript; charset=utf-8'],
  '/auth/login.css': [path.join(here, 'public/login.css'), 'text/css; charset=utf-8'],
  '/auth/auth.js': [path.join(here, '../../frontend/intranet/auth.js'), 'text/javascript; charset=utf-8'],
};

const base64url = text => Buffer.from(text, 'base64url');

/** Devolve as claims de um ID token válido para o portal, ou lança um erro sem detalhes do token. */
export function verifyIdToken(token, { keys, issuer, clientId, allowedGroups }, now = Date.now() / 1000) {
  const parts = typeof token === 'string' ? token.split('.') : [];
  if (parts.length !== 3) throw new Error('malformed');
  let header;
  let claims;
  try {
    header = JSON.parse(base64url(parts[0]).toString('utf8'));
    claims = JSON.parse(base64url(parts[1]).toString('utf8'));
  } catch {
    throw new Error('malformed');
  }
  if (header.alg !== 'RS256') throw new Error('algorithm');
  const jwk = keys.find(key => key.kid === header.kid && key.kty === 'RSA');
  if (!jwk) throw new Error('unknown key');
  const signed = verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), createPublicKey({ key: jwk, format: 'jwk' }), base64url(parts[2]));
  if (!signed) throw new Error('signature');
  if (claims.iss !== issuer || claims.aud !== clientId || claims.token_use !== 'id') throw new Error('audience');
  if (typeof claims.exp !== 'number' || claims.exp + SKEW_SECONDS < now) throw new Error('expired');
  const groups = Array.isArray(claims['cognito:groups']) ? claims['cognito:groups'] : [];
  if (!groups.some(group => allowedGroups.includes(group))) throw new Error('forbidden');
  return claims;
}

export function readCookie(header, name) {
  for (const part of String(header ?? '').split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return value.join('=');
  }
  return '';
}

function withoutCookie(header, name) {
  return String(header ?? '').split(';').map(part => part.trim()).filter(part => part && !part.startsWith(`${name}=`)).join('; ');
}

const AUTH_PAGE = (title, text) => `<!doctype html>
<html lang="pt-PT"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow">
<title>${title}</title><link rel="stylesheet" href="/auth/login.css"><script type="module" src="/auth/login.js"></script></head>
<body><main><h1>Portal BLU</h1><p id="status">${text}</p><p><a href="/auth/login">Entrar</a></p></main></body></html>`;

export function createGate(config) {
  const settings = {
    issuer: `https://cognito-idp.${config.region}.amazonaws.com/${config.userPoolId}`,
    clientId: config.clientId,
    keys: config.keys,
    allowedGroups: config.allowedGroups ?? ['founders', 'curators'],
  };
  const origin = config.publicOrigin.replace(/\/$/, '');
  const authConfig = JSON.stringify({ authDomain: config.authDomain, clientId: config.clientId, origin });
  const securityHeaders = {
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'content-security-policy': `default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self' ${config.authDomain}; form-action 'none'; frame-ancestors 'none'; base-uri 'none'`,
  };
  const send = (res, status, body = '', headers = {}) => {
    res.writeHead(status, { ...securityHeaders, ...headers });
    res.end(body);
  };
  const html = (res, status, title, text) => send(res, status, AUTH_PAGE(title, text), { 'content-type': 'text/html; charset=utf-8' });

  async function startSession(req, res) {
    if (req.headers.origin !== origin) return send(res, 403, 'Origem inválida.');
    if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) return send(res, 415, 'JSON obrigatório.');
    let raw = '';
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > BODY_LIMIT) return send(res, 413, 'Pedido demasiado grande.');
    }
    let claims;
    let token;
    try {
      token = JSON.parse(raw).idToken;
      claims = verifyIdToken(token, settings);
    } catch (error) {
      return send(res, error.message === 'forbidden' ? 403 : 401, error.message === 'forbidden' ? 'Sem acesso ao portal.' : 'Sessão inválida.');
    }
    const maxAge = Math.max(0, Math.floor(claims.exp - Date.now() / 1000));
    send(res, 204, '', { 'set-cookie': `${COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${maxAge}` });
  }

  function proxy(req, res) {
    const headers = { ...req.headers, 'x-forwarded-proto': 'https', 'x-forwarded-host': req.headers.host ?? '' };
    const cookie = withoutCookie(req.headers.cookie, COOKIE);
    if (cookie) headers.cookie = cookie;
    else delete headers.cookie;
    const upstream = http.request({ host: config.upstreamHost ?? '127.0.0.1', port: config.upstreamPort ?? 3001, method: req.method, path: req.url, headers }, answer => {
      res.writeHead(answer.statusCode ?? 502, answer.headers);
      answer.pipe(res);
    });
    upstream.on('error', () => {
      if (!res.headersSent) send(res, 502, 'O portal está a arrancar. Tente daqui a um minuto.', { 'content-type': 'text/plain; charset=utf-8' });
      else res.destroy();
    });
    req.pipe(upstream);
  }

  return async function handle(req, res) {
    const url = new URL(req.url ?? '/', 'http://gate');
    if (url.pathname === '/auth/health') return send(res, 200, 'ok');
    if (url.pathname === '/auth/config.json') return send(res, 200, authConfig, { 'content-type': 'application/json' });
    if (PUBLIC_FILES[url.pathname]) {
      const [file, type] = PUBLIC_FILES[url.pathname];
      return send(res, 200, readFileSync(file), { 'content-type': type });
    }
    if (url.pathname === '/auth/login' || url.pathname === '/auth/callback') return html(res, 200, 'Entrar no portal BLU', 'A abrir o login da equipa…');
    if (url.pathname === '/auth/signed-out') return html(res, 200, 'Saiu do portal BLU', 'Saiu do portal.');
    if (url.pathname === '/auth/session' && req.method === 'POST') return startSession(req, res);
    if (url.pathname === '/auth/logout') {
      const logout = new URL('/logout', config.authDomain);
      logout.search = new URLSearchParams({ client_id: config.clientId, logout_uri: `${origin}/auth/signed-out` }).toString();
      return send(res, 302, '', { location: logout.toString(), 'set-cookie': `${COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0` });
    }
    try {
      verifyIdToken(readCookie(req.headers.cookie, COOKIE), settings);
    } catch (error) {
      if (error.message === 'forbidden') return send(res, 403, 'Sem acesso ao portal.', { 'content-type': 'text/plain; charset=utf-8' });
      const wantsPage = req.method === 'GET' && String(req.headers.accept ?? '').includes('text/html');
      if (wantsPage) return send(res, 302, '', { location: `/auth/login?next=${encodeURIComponent(url.pathname + url.search)}` });
      return send(res, 401, JSON.stringify({ error: 'Sessão expirada. Recarregue a página.' }), { 'content-type': 'application/json' });
    }
    return proxy(req, res);
  };
}

// Execução no servidor: GATE_CONFIG aponta para o JSON publicado pela stack, GATE_JWKS para as chaves do build.
// O servidor arranca-o por /srv/blu/current (ligação simbólica) e o Node resolve
// import.meta.url para o caminho real: comparar caminhos reais, senão sai em silêncio.
if (process.argv[1] && realpathSync(path.resolve(process.argv[1])) === fileURLToPath(import.meta.url)) {
  const config = JSON.parse(readFileSync(process.env.GATE_CONFIG ?? '/srv/blu/gate.json', 'utf8'));
  const { keys } = JSON.parse(readFileSync(process.env.GATE_JWKS ?? path.join(here, 'jwks.json'), 'utf8'));
  const port = Number(process.env.GATE_PORT ?? 8080);
  http.createServer(createGate({ ...config, keys })).listen(port, '0.0.0.0', () => console.log(`Portão do portal na porta ${port}`));
}
