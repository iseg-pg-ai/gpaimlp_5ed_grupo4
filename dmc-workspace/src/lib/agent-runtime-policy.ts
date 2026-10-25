import type { AgentAuditStore } from "./agent-audit-store.ts";

type Rate = { input: number; output: number };

export class AgentRuntimeConfigurationError extends Error {}
export class AgentBudgetExceeded extends Error {}

const positive = (value: string | undefined, name: string) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0)
    throw new AgentRuntimeConfigurationError(`${name} não configurado.`);
  return parsed;
};

function runtimeModel() {
  const provider = (process.env.BLU_AGENT_PROVIDER ?? "bedrock").trim().toLowerCase();
  if (!(["bedrock", "openai"] as string[]).includes(provider))
    throw new AgentRuntimeConfigurationError("Fornecedor do agente inválido.");
  if (provider === "openai" && process.env.BLU_OPENAI_ENABLED !== "true")
    throw new AgentRuntimeConfigurationError("OpenAI não está aprovado para utilização real.");
  const model = (
    provider === "openai"
      ? process.env.OPENAI_MODEL
      : (process.env.BEDROCK_MODEL_ID ?? "eu.amazon.nova-pro-v1:0")
  )?.trim();
  if (!model) throw new AgentRuntimeConfigurationError("Modelo do agente não configurado.");
  return { provider, model };
}

function rates(): Record<string, Rate> {
  try {
    const value = JSON.parse(process.env.BLU_AGENT_RATES_JSON ?? "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    for (const rate of Object.values(value) as Rate[])
      if (
        !rate ||
        typeof rate !== "object" ||
        !Number.isFinite(rate.input) ||
        rate.input < 0 ||
        !Number.isFinite(rate.output) ||
        rate.output < 0
      )
        throw new Error();
    return value;
  } catch {
    throw new AgentRuntimeConfigurationError("Tabela de preços do agente inválida.");
  }
}

/** Produção reserva o custo máximo do pedido antes de consultar o fornecedor. */
export function enforceAgentRuntimePolicy(
  audit: AgentAuditStore,
  serializedRequestBytes: number,
  now = new Date(),
) {
  if (process.env.BLU_IDENTITY_MODE !== "alb-cognito") return null;
  if (!Number.isSafeInteger(serializedRequestBytes) || serializedRequestBytes < 1)
    throw new AgentRuntimeConfigurationError("Dimensão do pedido inválida.");
  const { provider, model } = runtimeModel();
  const monthlyBudgetUsd = positive(
    process.env.BLU_AGENT_MONTHLY_BUDGET_USD,
    "Orçamento mensal do agente",
  );
  const modelRate = rates()[model];
  if (!modelRate) throw new AgentRuntimeConfigurationError("Preço do modelo não configurado.");
  const maxOutputTokens = positive(
    process.env.BLU_AGENT_MAX_OUTPUT_TOKENS ?? "1800",
    "Limite de saída",
  );
  if (maxOutputTokens > 4096) throw new AgentRuntimeConfigurationError("Limite de saída inválido.");
  // Dois bytes/token é deliberadamente conservador para idiomas e JSON diversos.
  const estimatedInputTokens = Math.ceil(serializedRequestBytes / 2);
  const reservedUsd =
    (estimatedInputTokens * modelRate.input + maxOutputTokens * modelRate.output) / 1_000_000;
  const spentUsd = audit.monthlySpendUsd(rates(), now);
  if (spentUsd + reservedUsd > monthlyBudgetUsd)
    throw new AgentBudgetExceeded("Orçamento mensal do agente esgotado.");
  return { provider, model, monthlyBudgetUsd, spentUsd, reservedUsd };
}
