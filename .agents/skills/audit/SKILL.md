---
name: audit
description: Run or coordinate a fresh independent external audit of Codex Workflows candidates, especially when launching a dedicated `codex exec` auditor in tmux, scoring a workflow on the canonical five-point rubric, recording violations, publishing the attempt-specific `.agent/audit/workflows/.../AUDIT.md`, or awaiting that report without reprompting an active `/goal` turn.
---

# External Audit

Use a fresh auditor identity to inspect the exact candidate. Keep deterministic
Preflight, semantic judgment, and implementation authority separate. An audit
report is evidence and a verdict; it is never permission for the auditor to
repair product code.

## Load the contract

1. Read the nearest `README.md` and `AGENTS.md`, the repository BATDD profile,
   immutable assignment, frozen Green Contract, candidate identity, prior audit
   history, and applicable Nx targets.
2. Read `/Users/mcasa_atlantis/Documents/vaults/Agent Wiki/standards/AUDIT.md`
   with the global `agent-wiki` skill when authoring or issuing a verdict.
3. Read [references/process.md](references/process.md) completely.
4. Use the canonical template at
   `/Users/mcasa_atlantis/.codex/orchestration/.agent/audit/AUDIT_TEMPLATE.md`.

Stop if the attempt ID, candidate, write surface, scoring boundary, or auditor
independence is ambiguous.

## Launch boundary

Launch one dedicated auditor in an isolated tmux session from the workspace
root with exact:

```text
codex exec --model gpt-5.6-sol -c model_reasoning_effort="high"
```

Pass an immutable audit prompt that names the exact attempt ID, candidate,
template, required output, accepted read/write surface, prior findings, and
gates. Explicitly set the remaining launch permissions and working directory;
do not inherit undeclared defaults. The auditor may write only its attempt
directory and machine evidence explicitly authorized by the assignment. It
must not implement repairs, amend acceptance, overwrite earlier attempts, or
claim reducer approval it did not receive.

## Output contract

Every external auditor must publish exactly one canonical report at:

```text
.agent/audit/workflows/<ATTEMPT_ID>/AUDIT.md
```

Stage the report under a sibling temporary name and atomically rename it to
`AUDIT.md` only after every required section, score, violation disposition,
verdict, next action, and `EXTERNAL_AUDIT_COMPLETE` marker is complete. File
existence is therefore a terminal publication signal. Never mutate an earlier
attempt report.

## Wait in the current turn

When an active `/goal` turn launches the auditor, use the global monitor
skill's synchronous stall rather than a durable heartbeat:

```bash
"${CODEX_HOME:-$HOME/.codex}/skills/monitor/scripts/sync-monitor.mjs" \
  ".agent/audit/workflows/<ATTEMPT_ID>/AUDIT.md" \
  --timeout 3600 \
  --interval 500
```

This is bounded `test -f` polling in the same turn. Do not create a second
prompt, scheduled heartbeat, or duplicate monitor for the audit file. **Never
launch the synchronous shim in tmux or any background terminal; it is the
foreground process that intentionally stalls this coordinating turn.** Only
the external auditor belongs in the dedicated tmux session.

## Closeout

After the stall exits successfully, verify the report is a regular file,
contains one verdict, contains `Canonical score: <N>/5`, dispositions every
violation, names the exact candidate, and ends with
`EXTERNAL_AUDIT_COMPLETE`. Inspect the auditor's tmux/process exit and resource
delta separately; file appearance alone does not certify the verdict.

Require at least 4/5 plus zero unresolved blocking or constitutional
violations for score eligibility. A numerical threshold never overrides
independence, missing Preflight, failed L3, scope drift, or cleanup failure.
