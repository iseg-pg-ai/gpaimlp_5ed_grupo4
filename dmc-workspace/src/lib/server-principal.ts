// Resolve a identidade e as permissões no backend; esconder controlos na interface não
// constitui autorização.
import { readFileSync } from "node:fs";
import path from "node:path";
import { AlbJwtVerifier, CognitoJwtVerifier } from "aws-jwt-verify";

export type InternalRole = "viewer" | "curator" | "admin" | "owner";
export type AuthenticatedPrincipal = {
  id: string;
  role: InternalRole;
  permissions: string[];
};

type Claims = Record<string, unknown>;
type Verifiers = {
  verifyAlb(token: string): Promise<Claims>;
  verifyAccess(token: string): Promise<Claims>;
};
type IdentityPolicy = {
  internal_roles: InternalRole[];
  permissions: string[];
  roles: Record<InternalRole, string[]>;
};

export class IdentityRequired extends Error {}
export class IdentityDenied extends Error {}
export class IdentityConfigurationError extends Error {}

let cached: { key: string; verifiers: Verifiers } | undefined;

function policy(): IdentityPolicy {
  const filename =
    process.env.BLU_IDENTITY_POLICY ??
    path.resolve(process.cwd(), "../config/identity_policy.json");
  const value = JSON.parse(
    readFileSync(/* turbopackIgnore: true */ filename, "utf8"),
  ) as IdentityPolicy;
  if (
    !Array.isArray(value.internal_roles) ||
    !Array.isArray(value.permissions) ||
    !value.roles ||
    value.internal_roles.join(",") !== "viewer,curator,admin,owner"
  )
    throw new IdentityConfigurationError("Política de identidade inválida.");
  return value;
}

function configuredVerifiers(): Verifiers {
  const albArn = process.env.BLU_ALB_ARN?.trim();
  const userPoolId = process.env.BLU_COGNITO_USER_POOL_ID?.trim();
  const clientId = process.env.BLU_COGNITO_CLIENT_ID?.trim();
  const issuer = process.env.BLU_COGNITO_ISSUER?.trim();
  if (!albArn || !userPoolId || !clientId || !issuer)
    throw new IdentityConfigurationError("Identidade ALB/Cognito incompleta.");
  const key = [albArn, userPoolId, clientId, issuer].join("|");
  if (cached?.key === key) return cached.verifiers;
  const alb = AlbJwtVerifier.create({ albArn, issuer, clientId });
  const access = CognitoJwtVerifier.create({ userPoolId, tokenUse: "access", clientId });
  const verifiers = {
    verifyAlb: (token: string) => alb.verify(token),
    verifyAccess: (token: string) => access.verify(token),
  };
  cached = { key, verifiers };
  return verifiers;
}

function roleFromGroups(groups: unknown, identityPolicy: IdentityPolicy): InternalRole {
  if (!Array.isArray(groups) || groups.some((group) => typeof group !== "string")) return "viewer";
  const allowed = new Set(groups.filter((group) => identityPolicy.internal_roles.includes(group)));
  for (const role of [...identityPolicy.internal_roles].reverse())
    if (allowed.has(role)) return role;
  return "viewer";
}

/** Verifica sempre os dois JWT; headers de identidade sem assinatura nunca são autoridade. */
export async function requestPrincipal(
  request: Request,
  override?: Verifiers,
): Promise<AuthenticatedPrincipal | null> {
  const mode = process.env.BLU_IDENTITY_MODE?.trim() || "disabled";
  if (mode === "disabled") return null;
  if (mode !== "alb-cognito") throw new IdentityConfigurationError("Modo de identidade inválido.");
  const claimsToken = request.headers.get("x-amzn-oidc-data");
  const accessToken = request.headers.get("x-amzn-oidc-accesstoken");
  if (!claimsToken || !accessToken) throw new IdentityRequired("Autenticação necessária.");
  try {
    const verifier = override ?? configuredVerifiers();
    const [claims, access] = await Promise.all([
      verifier.verifyAlb(claimsToken),
      verifier.verifyAccess(accessToken),
    ]);
    if (
      typeof claims.sub !== "string" ||
      !/^[A-Za-z0-9_-]{1,120}$/.test(claims.sub) ||
      access.sub !== claims.sub
    )
      throw new IdentityDenied("Identidade inconsistente.");
    const identityPolicy = policy();
    const role = roleFromGroups(access["cognito:groups"], identityPolicy);
    return {
      id: `cognito:${claims.sub}`,
      role,
      permissions: [...identityPolicy.roles[role]],
    };
  } catch (error) {
    if (error instanceof IdentityConfigurationError || error instanceof IdentityDenied) throw error;
    throw new IdentityDenied("Token de identidade inválido.");
  }
}

// Validar a ação autorizada antes de aceder ao recurso protegido.
export function requirePermission(principal: AuthenticatedPrincipal, permission: string) {
  if (!principal.permissions.includes(permission))
    throw new IdentityDenied("Permissão insuficiente.");
}
