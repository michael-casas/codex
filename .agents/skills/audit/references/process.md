# Standardized workflow audit process

## 1. Freeze intake

- Validate a filesystem-safe attempt ID: letters, digits, dots, underscores,
  and hyphens only.
- Resolve the exact base, candidate revision or current-disk digest, assignment,
  Green Contract hash, and audit output directory.
- Fail closed if `.agent/audit/workflows/<ATTEMPT_ID>/AUDIT.md` already exists.
- Capture branch, Git status, tracked diff, untracked deliverables, prior audit
  reports, expected gates, and before-resource inventory.

## 2. Establish independence

- Launch a fresh `gpt-5.6-sol` auditor at `high` reasoning in a dedicated tmux
  session.
- Give it read access to the full candidate and write access only to the
  authorized audit attempt directory and declared machine-evidence paths.
- Do not pass implementation persuasion, private chain-of-thought, or a desired
  verdict. Pass authority, artifacts, prior findings, and the scoring contract.
- An auditor that repairs any finding loses gavel authority for that repair.

## 3. Validate proof before semantic judgment

- Check that fresh Preflight binds the exact candidate, affected selection,
  uncached L1/L2/L3 results, nonzero counts, artifact hashes, and resource delta.
- Mark missing, stale, cached, zero-selection, or revision-mismatched proof as
  `PREFLIGHT-INVALID`; do not convert it into a product retry.
- Run targeted probes that attack semantics or false greens. Do not waste the
  independent pass merely reenacting valid standing proof.

## 4. Score five dimensions

Award each dimension exactly `0` or `1` and cite decisive evidence:

1. Standardized authoring and direct-runner contract correctness.
2. Model policy, SDK lifecycle, failure ordering, safety, and cleanup.
3. Typed composition, dataflow/provenance, schema, journal, and artifact correctness.
4. Compatibility, deterministic exits, evidence integrity, test quality, and false-green resistance.
5. Founder self-L3 daily-facts execution through the real public surface.

For dimension 5, require exactly three `gpt-5.6-luna`/`medium` research nodes,
three distinct daily industry/topic results, short substantive summaries,
article links, the exact UTC attempt path, and zero unexpected resource delta.

`4/5` is only score-eligible when no unresolved blocking or constitutional
violation remains. Report the score and verdict separately.

## 5. Compile the violations report

Continue after findings when safe. Give every violation a stable ID, severity,
score dimension, violated authority, decisive evidence, impact, required
correction, smallest authorized repair surface, validator, and disposition.
Include prior open findings and explicitly mark each `CLOSED`, `OPEN`,
`REGRESSED`, `NOT-APPLICABLE`, or `PREFLIGHT-INVALID`.

## 6. Issue one verdict

Use exactly one heading: `APPROVED`, `BLOCKED`, or `ESCALATED`.

- `APPROVED`: all required gates pass, score is eligible, evidence is complete,
  resource delta is zero, and blocking violations are zero.
- `BLOCKED`: correctable failures remain within existing authority; compile one
  exhaustive retry ledger and dependency DAG.
- `ESCALATED`: progress requires new Founder authority or a scope decision.

Name one next authorized action. Never combine or conditionally hedge verdicts.

## 7. Publish atomically

Fill `.agent/audit/AUDIT_TEMPLATE.md` completely under a sibling temporary
filename. Verify the candidate identity, arithmetic, violation dispositions,
single verdict, next action, and completion marker. Atomically rename the
completed file to `.agent/audit/workflows/<ATTEMPT_ID>/AUDIT.md`.

The coordinator waits with `scripts/sync-monitor.mjs` in the current turn,
then verifies the report and auditor process independently. Never place the
synchronous shim in tmux or another background terminal: the auditor is
backgrounded, while the shim must remain the foreground turn stall.
