// Executa a retenção sobre os elementos elegíveis, preservando as condições de restauro e
// integridade.
import { AgentAuditStore } from "./agent-audit-store.ts";
import { AgentConversationStore } from "./agent-conversation-store.ts";
import { DraftStore } from "./draft-store.ts";
import { loadRetentionPolicy } from "./retention-policy.ts";
import { VersionStore } from "./version-store.ts";

const DAY = 86_400_000;

export type RetentionCleanupResult = {
  drafts: number;
  shares: number;
  agentAudit: number;
  agentConversations: number;
  authoritativeVersions: 0;
  exports: 0;
};

/** Executa apenas eliminações autorizadas pela política; versões e exports ficam intactos. */
export function runRetentionCleanup(
  now = new Date(),
  operationalRoot?: string,
  exportRoot?: string,
): RetentionCleanupResult {
  if (Number.isNaN(now.getTime())) throw new Error("Data de retenção inválida.");
  const policy = loadRetentionPolicy();
  const drafts = new DraftStore(operationalRoot, policy.draft_inactivity_days, () => now);
  const versions = new VersionStore(exportRoot);
  try {
    const audit = new AgentAuditStore(versions);
    const conversations = new AgentConversationStore(versions);
    return {
      drafts: drafts.cleanupExpired(now),
      shares: versions.cleanupExpiredShares(
        new Date(now.getTime() - policy.expired_share_grace_days * DAY),
      ),
      agentAudit: audit.cleanupExpired(new Date(now.getTime() - policy.agent_audit_days * DAY)),
      agentConversations: conversations.cleanupExpired(now),
      authoritativeVersions: 0,
      exports: 0,
    };
  } finally {
    drafts.close();
    versions.close();
  }
}
