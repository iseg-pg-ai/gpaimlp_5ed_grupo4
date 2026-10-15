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

/** Read API errors consistently, including responses that are not JSON. */
export async function responseJson<T>(response: Response): Promise<T> {
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("O servidor devolveu uma resposta inválida. Tente novamente.");
  }
  if (!response.ok)
    throw new Error(typeof data?.error === "string" ? data.error : "Pedido falhou.");
  return data as T;
}
