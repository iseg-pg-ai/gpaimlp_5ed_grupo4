# Project memory

This directory stores durable, inspectable project knowledge for humans and
code agents. It complements source code and tests; it does not replace them.

## Files

- `repo-layout.md`: verified entry points, ownership boundaries, and data flow.
- `product-scope.md`: implemented capabilities, target architecture, and MVP
  boundary.
- `decisions.md`: dated decisions and unresolved choices that affect future
  work.

## Read policy

Load only the files relevant to the active task. Verify a memory claim against
the current repository before relying on it for a consequential change. When
memory and code disagree, code, tests, lockfiles, and generated manifests take
precedence; update the stale memory in the same focused change.

## Write protocol

Before writing:

1. Read the current file and the relevant evidence.
2. Confirm the active `PLAN.md` task permits the update.
3. Record facts only when they are durable and useful across sessions.
4. Label an inference or proposal instead of presenting it as fact.

Each decision entry should include a date, status, reason, evidence, and scope.
Keep changes small and reviewable through Git.

Never store secrets, credentials, raw customer content, full transcripts,
temporary command output, or unverified assumptions here.
