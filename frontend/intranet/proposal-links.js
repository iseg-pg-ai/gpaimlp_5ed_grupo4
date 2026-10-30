// WhatsApp text must contain the real URL; Markdown labels are not hyperlinks there.
export function proposalShareUrl(value, portal) {
  try {
    const url = new URL(value);
    const base = new URL(portal);
    return url.protocol === 'https:' && url.origin === base.origin && !url.username && !url.password
      && !url.search && !url.hash && /^\/(share\/[\w-]+|api\/shares\/[\w-]+\/document)$/.test(url.pathname)
      ? url.href : '';
  } catch { return ''; }
}

export function embedProposalLink(text, url, previous = '') {
  let result = String(text ?? '').replaceAll('[link da proposta]', url);
  if (previous && previous !== url) result = result.split(previous).join(url);
  if (!result.includes(url)) result = `${result.trimEnd()}\n\nYour proposal: ${url}`.trim();
  return result;
}

export function proposalPayload(text, url, extra = '', limit = 1000) {
  const result = embedProposalLink(text, url) + extra;
  if (result.length > limit) throw new Error(`A mensagem tem ${result.length} caracteres (máximo ${limit}). Encurte o texto; o link não será cortado.`);
  return result;
}
