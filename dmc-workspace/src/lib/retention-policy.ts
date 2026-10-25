import { readFileSync } from "node:fs";
import path from "node:path";

export type RetentionPolicy = {
  schema_version: 1;
  draft_inactivity_days: number;
  agent_conversation_days: number;
  agent_audit_days: number;
  expired_share_grace_days: number;
  legal_hold_overrides_deletion: true;
  authoritative_versions_auto_delete: false;
  exports_follow_version_lifecycle: true;
};

const boundedDays = (value: unknown, name: string, maximum: number) => {
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > maximum)
    throw new Error(`Retenção inválida: ${name}.`);
};

export function validateRetentionPolicy(value: unknown): RetentionPolicy {
  if (!value || typeof value !== "object") throw new Error("Política de retenção inválida.");
  const policy = value as Record<string, unknown>;
  const expected = new Set([
    "schema_version",
    "draft_inactivity_days",
    "agent_conversation_days",
    "agent_audit_days",
    "expired_share_grace_days",
    "legal_hold_overrides_deletion",
    "authoritative_versions_auto_delete",
    "exports_follow_version_lifecycle",
  ]);
  if (Object.keys(policy).some((key) => !expected.has(key)) || policy.schema_version !== 1)
    throw new Error("Versão ou campos da política de retenção inválidos.");
  boundedDays(policy.draft_inactivity_days, "draft_inactivity_days", 365);
  boundedDays(policy.agent_conversation_days, "agent_conversation_days", 365);
  boundedDays(policy.agent_audit_days, "agent_audit_days", 3650);
  boundedDays(policy.expired_share_grace_days, "expired_share_grace_days", 365);
  if (
    policy.legal_hold_overrides_deletion !== true ||
    policy.authoritative_versions_auto_delete !== false ||
    policy.exports_follow_version_lifecycle !== true
  )
    throw new Error("As salvaguardas obrigatórias de retenção foram alteradas.");
  return policy as RetentionPolicy;
}

export function loadRetentionPolicy(
  filename = process.env.BLU_RETENTION_POLICY ??
    path.resolve(process.cwd(), "../config/retention_policy.json"),
): RetentionPolicy {
  return validateRetentionPolicy(JSON.parse(readFileSync(filename, "utf8")));
}
