// Login gerido do Cognito com código de autorização e PKCE. Os tokens ficam só em
// memória; o verificador PKCE e o estado ficam em sessionStorage apenas até ao regresso.
// Ao recarregar a página, a sessão do login gerido, enquanto válida, devolve um código novo sem pedir MFA.
const base64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function randomString(size = 32) {
  return base64url(crypto.getRandomValues(new Uint8Array(size)));
}

export async function challengeFor(verifier) {
  return base64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
}

export function loginUrl(config, { state, challenge }) {
  const url = new URL('/oauth2/authorize', config.authDomain);
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: 'openid email profile',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  }).toString();
  return url.toString();
}

export function logoutUrl(config) {
  const url = new URL('/logout', config.authDomain);
  url.search = new URLSearchParams({ client_id: config.clientId, logout_uri: config.redirectUri }).toString();
  return url.toString();
}

const tokenEndpoint = (config, fields) => ({
  url: new URL('/oauth2/token', config.authDomain).toString(),
  init: {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: config.clientId, ...fields }).toString(),
  },
});

export function tokenRequest(config, { code, verifier }) {
  return tokenEndpoint(config, { grant_type: 'authorization_code', code, redirect_uri: config.redirectUri, code_verifier: verifier });
}

/** Renova o ID token com o refresh token (12 h, também só em memória) sem voltar ao login. */
export function refreshRequest(config, refreshToken) {
  return tokenEndpoint(config, { grant_type: 'refresh_token', refresh_token: refreshToken });
}

/** Lê as reivindicações do ID token para mostrar nome e grupos; a API volta a validá-lo. */
export function claimsOf(idToken) {
  const part = idToken.split('.')[1] ?? '';
  const json = atob(part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '='));
  return JSON.parse(decodeURIComponent(escape(json)));
}

export const expired = (claims, now = Date.now()) => !claims?.exp || claims.exp * 1000 <= now + 30_000;
