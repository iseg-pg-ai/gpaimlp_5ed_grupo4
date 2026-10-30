// Login do portal: o navegador troca o código PKCE no Cognito e entrega o ID token ao portão,
// que o valida e o guarda num cookie HttpOnly. O token não fica acessível ao portal Next.js.
import { challengeFor, loginUrl, randomString, tokenRequest } from './auth.js';

const status = document.getElementById('status');
const config = await (await fetch('/auth/config.json')).json();
const auth = { authDomain: config.authDomain, clientId: config.clientId, redirectUri: `${config.origin}/auth/callback` };
const KEY = 'blu-portal-auth';
// Só caminhos do próprio portal: evita redirecionamentos para outros sites.
const safeNext = value => (typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/auth/') ? value : '/');

// O fragmento (#mapa) não chega ao servidor: o navegador mantém-no no redirecionamento para
// /auth/login e guardamo-lo aqui, para a ligação direta abrir o sítio certo depois do login.
const safeHash = value => (/^#[A-Za-z0-9-]{1,40}$/.test(value) ? value : '');

async function begin() {
  const state = randomString();
  const verifier = randomString(48);
  sessionStorage.setItem(KEY, JSON.stringify({ state, verifier, next: safeNext(new URLSearchParams(location.search).get('next')) + safeHash(location.hash) }));
  location.assign(loginUrl(auth, { state, challenge: await challengeFor(verifier) }));
}

async function finish() {
  const params = new URLSearchParams(location.search);
  const saved = JSON.parse(sessionStorage.getItem(KEY) || '{}');
  sessionStorage.removeItem(KEY);
  if (!params.get('code') || params.get('state') !== saved.state) return begin();
  const { url, init } = tokenRequest(auth, { code: params.get('code'), verifier: saved.verifier });
  const tokens = await fetch(url, init).then(response => (response.ok ? response.json() : Promise.reject(new Error('token'))));
  const session = await fetch('/auth/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idToken: tokens.id_token }) });
  if (session.status === 403) {
    status.textContent = 'A sua conta não tem acesso ao portal. Peça acesso de curador a uma fundadora.';
    return;
  }
  if (!session.ok) throw new Error('session');
  location.replace(safeNext(saved.next));
}

try {
  if (location.pathname === '/auth/callback') await finish();
  else if (location.pathname === '/auth/login') await begin();
} catch {
  status.textContent = 'Não foi possível entrar. Recarregue a página para tentar de novo.';
}
