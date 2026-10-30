// Biblioteca de propostas genéricas (PDF no S3): só entram as que uma pessoa aprovou em
// config/proposal-library.json (approved: true), porque as outras citam clientes anteriores.
// A escolha é por palavras-chave do destino e dos interesses do lead, sem modelo.
import { createHash, createHmac } from 'node:crypto';

export const LIBRARY = { top: 2, minScore: 40, maxExpires: 6 * 3600 };

const fold = value => String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const STOP = new Set(['and', 'the', 'with', 'for', 'por', 'com', 'para', 'dos', 'das']);
const words = value => [...new Set(fold(value).split(/[^a-z0-9]+/).filter(word => word.length > 2 && !STOP.has(word)))];

/** Até duas propostas aprovadas que servem o destino e os interesses do lead, com o motivo. */
export function matchLibrary(journey, entries = []) {
  const place = words(journey?.destination);
  const interests = words(journey?.interests);
  const matches = [];
  for (const entry of entries) {
    if (entry.approved !== true || !entry.file) continue;
    const keys = words((entry.keywords ?? []).join(' '));
    const where = place.filter(word => keys.includes(word));
    if (place.length && !where.length) continue;
    const what = interests.filter(word => keys.includes(word));
    // Servir o destino vale 50; cobrir todos os destinos pedidos mais 10; os interesses até 40.
    const score = Math.round((place.length ? 50 + 10 * where.length / place.length : 30) + (interests.length ? 40 * what.length / interests.length : 0));
    if (score < LIBRARY.minScore) continue;
    const reasons = [where.length ? `Destino: ${where.join(', ')}` : 'Sem destino indicado', what.length ? `Interesses: ${what.join(', ')}` : ''].filter(Boolean);
    matches.push({ id: entry.id, title: entry.title, file: entry.file, score, reasons });
  }
  return matches.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, LIBRARY.top);
}

const hmac = (key, data) => createHmac('sha256', key).update(data).digest();
const encode = value => encodeURIComponent(value).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);

/**
 * Link temporário (SigV4, GET) para um ficheiro do S3. Dura no máximo o que durarem as credenciais
 * da função (horas): serve para a pessoa rever e enviar logo, não para ficar no chat do cliente.
 */
export function presignGet({ bucket, key, region, credentials, expires = 3600, now = new Date(), host = `${bucket}.s3.${region}.amazonaws.com`, cap = LIBRARY.maxExpires }) {
  if (!bucket || !key || !credentials?.accessKeyId || !credentials?.secretAccessKey) return '';
  const stamp = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const day = stamp.slice(0, 8);
  const scope = `${day}/${region}/s3/aws4_request`;
  const query = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${credentials.accessKeyId}/${scope}`,
    'X-Amz-Date': stamp,
    'X-Amz-Expires': String(Math.min(Math.max(Math.floor(expires), 1), cap)),
    'X-Amz-SignedHeaders': 'host',
    ...(credentials.sessionToken ? { 'X-Amz-Security-Token': credentials.sessionToken } : {}),
  };
  const canonicalQuery = Object.keys(query).sort().map(name => `${encode(name)}=${encode(query[name])}`).join('&');
  const path = `/${key.split('/').map(encode).join('/')}`;
  const request = ['GET', path, canonicalQuery, `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', stamp, scope, createHash('sha256').update(request).digest('hex')].join('\n');
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${credentials.secretAccessKey}`, day), region), 's3'), 'aws4_request');
  return `https://${host}${path}?${canonicalQuery}&X-Amz-Signature=${createHmac('sha256', signingKey).update(toSign).digest('hex')}`;
}
