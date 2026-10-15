import { portalUrl } from "./http-client.ts";

/** BLU_PUBLIC_URL may include a base path; Studio's origin does not. */
export function publicUrl(path: string, requestUrl: string): string {
  const configuredBase = process.env.BLU_PUBLIC_URL?.replace(/\/$/, "");
  if (configuredBase) return `${configuredBase}${path}`;
  const origin = new URL(process.env.PORTAL_PUBLIC_ORIGIN ?? requestUrl).origin;
  return `${origin}${portalUrl(path)}`;
}

export function publicOrigin(requestUrl: string): string {
  return new URL(process.env.PORTAL_PUBLIC_ORIGIN ?? process.env.BLU_PUBLIC_URL ?? requestUrl)
    .origin;
}

export const noStoreHeaders = { "Cache-Control": "no-store" } as const;

export function jsonError(message: string, status: number, headers?: HeadersInit) {
  return Response.json({ error: message }, { status, headers });
}
