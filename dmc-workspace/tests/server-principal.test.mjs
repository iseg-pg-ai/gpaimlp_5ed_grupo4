import assert from "node:assert/strict";
import test from "node:test";

import {
  IdentityConfigurationError,
  IdentityDenied,
  IdentityRequired,
  requestPrincipal,
  requirePermission,
} from "../src/lib/server-principal.ts";

const request = (headers = {}) => new Request("https://portal.example/api/test", { headers });
const environment = (values, run) => {
  const before = { ...process.env };
  Object.assign(process.env, values);
  return Promise.resolve(run()).finally(() => {
    process.env = before;
  });
};
const tokens = { "x-amzn-oidc-data": "signed-claims", "x-amzn-oidc-accesstoken": "access" };

test("modo desativado não aceita headers como identidade implícita", async () => {
  await environment({ BLU_IDENTITY_MODE: "disabled" }, async () => {
    assert.equal(await requestPrincipal(request(tokens)), null);
  });
});

test("modo ALB exige ambos os tokens verificados e o mesmo subject", async () => {
  await environment({ BLU_IDENTITY_MODE: "alb-cognito" }, async () => {
    await assert.rejects(() => requestPrincipal(request()), IdentityRequired);
    await assert.rejects(
      () =>
        requestPrincipal(request(tokens), {
          verifyAlb: async () => ({ sub: "user-a" }),
          verifyAccess: async () => ({ sub: "user-b", "cognito:groups": ["owner"] }),
        }),
      IdentityDenied,
    );
  });
});

test("papel mais privilegiado válido determina apenas permissões declaradas", async () => {
  await environment({ BLU_IDENTITY_MODE: "alb-cognito" }, async () => {
    const principal = await requestPrincipal(request(tokens), {
      verifyAlb: async () => ({ sub: "user-a", email: "private@example.test" }),
      verifyAccess: async () => ({
        sub: "user-a",
        "cognito:groups": ["curator", "admin", "grupo-inventado"],
      }),
    });
    assert.equal(principal.id, "cognito:user-a");
    assert.equal(principal.role, "admin");
    assert.ok(principal.permissions.includes("agent.propose"));
    assert.ok(!principal.permissions.includes("workspace.configure"));
    assert.ok(!("email" in principal));
    assert.doesNotThrow(() => requirePermission(principal, "agent.propose"));
    assert.throws(() => requirePermission(principal, "workspace.configure"), IdentityDenied);
  });
});

test("grupo ausente aplica viewer e configuração desconhecida falha fechada", async () => {
  await environment({ BLU_IDENTITY_MODE: "alb-cognito" }, async () => {
    const principal = await requestPrincipal(request(tokens), {
      verifyAlb: async () => ({ sub: "user-a" }),
      verifyAccess: async () => ({ sub: "user-a" }),
    });
    assert.equal(principal.role, "viewer");
    assert.throws(() => requirePermission(principal, "agent.propose"), IdentityDenied);
  });
  await environment({ BLU_IDENTITY_MODE: "inventado" }, async () => {
    await assert.rejects(() => requestPrincipal(request(tokens)), IdentityConfigurationError);
  });
});
