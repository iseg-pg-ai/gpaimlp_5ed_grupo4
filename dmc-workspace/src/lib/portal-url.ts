/** Prefix app URLs once; external URLs retain their original destination. */
export function portalUrl(path: string): string {
  const prefix = process.env.NEXT_PUBLIC_PORTAL_BASE_PATH ?? "";
  if (!prefix || !path.startsWith("/") || path.startsWith("//")) return path;
  if (path === prefix || path.startsWith(`${prefix}/`)) return path;
  return `${prefix}${path}`;
}

export function portalFetch(input: string, init?: RequestInit): Promise<Response> {
  return fetch(portalUrl(input), init);
}
