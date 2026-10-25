// Login gerido do Cognito com código de autorização e PKCE. Os tokens ficam só em
// memória; o verificador PKCE e o estado ficam em sessionStorage apenas até ao regresso.
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

export function tokenRequest(config, { code, verifier }) {
  return {
    url: new URL('/oauth2/token', config.authDomain).toString(),
    init: {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', client_id: config.clientId, code, redirect_uri: config.redirectUri, code_verifier: verifier }).toString(),
    },
  };
}

/** Lê as reivindicações do ID token para mostrar nome e grupos; a API volta a validá-lo. */
export function claimsOf(idToken) {
  const part = idToken.split('.')[1] ?? '';
  const json = atob(part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '='));
  return JSON.parse(decodeURIComponent(escape(json)));
}

export const expired = (claims, now = Date.now()) => !claims?.exp || claims.exp * 1000 <= now + 30_000;
