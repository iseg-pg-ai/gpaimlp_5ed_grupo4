export const noStoreHeaders = { "Cache-Control": "no-store" } as const;

export function jsonError(message: string, status: number, headers?: HeadersInit) {
  return Response.json({ error: message }, { status, headers });
}
