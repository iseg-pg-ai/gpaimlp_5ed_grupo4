import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { AgentAuditStore } from "../src/lib/agent-audit-store.ts";
import {
  AgentBudgetExceeded,
  AgentRuntimeConfigurationError,
  enforceAgentRuntimePolicy,
} from "../src/lib/agent-runtime-policy.ts";
import { VersionStore } from "../src/lib/version-store.ts";

const withEnvironment = (values, run) => {
  const before = { ...process.env };
  Object.assign(process.env, values);
  return Promise.resolve(run()).finally(() => {
    process.env = before;
  });
};

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), "blu-agent-budget-"));
  const store = new VersionStore(root);
  t.after(() => {
    store.close();
    rmSync(root, { recursive: true, force: true });
  });
  return new AgentAuditStore(store);
}

test("SageMaker não inventa um orçamento de produção", (t) => {
  const audit = fixture(t);
  return withEnvironment({ BLU_IDENTITY_MODE: "disabled" }, () => {
    assert.equal(enforceAgentRuntimePolicy(audit, 1000), null);
  });
});

test("produção exige orçamento, modelo aprovado e respetivo preço", (t) => {
  const audit = fixture(t);
  return withEnvironment(
    {
      BLU_IDENTITY_MODE: "alb-cognito",
      BLU_AGENT_PROVIDER: "bedrock",
      BEDROCK_MODEL_ID: "model-a",
      BLU_AGENT_MONTHLY_BUDGET_USD: "",
      BLU_AGENT_RATES_JSON: "{}",
    },
    () => {
      assert.throws(() => enforceAgentRuntimePolicy(audit, 1000), AgentRuntimeConfigurationError);
      process.env.BLU_AGENT_MONTHLY_BUDGET_USD = "25";
      assert.throws(() => enforceAgentRuntimePolicy(audit, 1000), /Preço do modelo/);
      process.env.BLU_AGENT_PROVIDER = "openai";
      process.env.OPENAI_MODEL = "model-openai";
      process.env.BLU_AGENT_RATES_JSON = JSON.stringify({
        "model-openai": { input: 1, output: 2 },
      });
      assert.throws(() => enforceAgentRuntimePolicy(audit, 1000), /não está aprovado/);
    },
  );
});

test("reserva conservadora impede ultrapassar o orçamento mensal", (t) => {
  const audit = fixture(t);
  return withEnvironment(
    {
      BLU_IDENTITY_MODE: "alb-cognito",
      BLU_AGENT_PROVIDER: "bedrock",
      BEDROCK_MODEL_ID: "model-a",
      BLU_AGENT_MONTHLY_BUDGET_USD: "0.001",
      BLU_AGENT_RATES_JSON: JSON.stringify({ "model-a": { input: 10, output: 20 } }),
      BLU_AGENT_MAX_OUTPUT_TOKENS: "1800",
    },
    () => {
      assert.throws(() => enforceAgentRuntimePolicy(audit, 2000), AgentBudgetExceeded);
      process.env.BLU_AGENT_MONTHLY_BUDGET_USD = "25";
      const result = enforceAgentRuntimePolicy(audit, 2000);
      assert.equal(result.model, "model-a");
      assert.ok(result.reservedUsd > 0);
      assert.equal(result.spentUsd, 0);
    },
  );
});
