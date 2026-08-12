# Codex Workflows direct TypeScript runner external-audit handoff

**Handoff state:** implementer-ready candidate; independent audit not yet run  
**Base revision:** `28c4650c676644bdfac11aa25c46d5be9b15f833`  
**Current-disk candidate:** 92 included paths,
`sha256:1d4c09fd9657bb4aa9c020b785deb6a9bfb4c097bcdffea4559000daa1c436ef`  
**Machine evidence:**
`packages/testing/evidence/codex-workflows-ts-runner-reproof.json`, SHA-256
`40398729a62e3c4ce195d935e1b3e55a5a2819087804c425b123d90a885dfd20`

## Requested external-audit boundary

Audit the exact current-disk candidate and machine evidence independently.
This implementation identity does not claim Preflight registration, reducer
approval, verification, judgment, acceptance, or a score. Prior audit scores
are preserved history rather than authority over the amended candidate.

The controlling Founder amendment makes trusted executable TypeScript the
primary workflow source and later restricts every real dogfood and
backend-facing `codex-workflows` agent request to exact `gpt-5.6-luna` with
`medium` reasoning. No fallback model is permitted.

## Exact product and contract paths

Primary public dogfood source:

`/Users/mcasa_atlantis/.codex/orchestration/apps/codex-workflows/examples/nestjs-resolver-factory-research.workflow.ts`

Dogfood input:

`/Users/mcasa_atlantis/.codex/orchestration/apps/codex-workflows/examples/nestjs-resolver-factory-research.input.json`

Additive contract and post-freeze ledger:

`/Users/mcasa_atlantis/.codex/orchestration/packages/testing/evidence/codex-workflows-ts-runner-green-contract.json`

Machine evidence:

`/Users/mcasa_atlantis/.codex/orchestration/packages/testing/evidence/codex-workflows-ts-runner-reproof.json`

Principal implementation:

- `/Users/mcasa_atlantis/.codex/orchestration/packages/workflows/src/authoring/api.ts`
- `/Users/mcasa_atlantis/.codex/orchestration/packages/workflows/src/authoring/types.ts`
- `/Users/mcasa_atlantis/.codex/orchestration/packages/workflows/src/authoring/execution.ts`
- `/Users/mcasa_atlantis/.codex/orchestration/apps/codex-workflows/src/source/typescript.ts`
- `/Users/mcasa_atlantis/.codex/orchestration/apps/codex-workflows/src/runtime/local-runner.ts`
- `/Users/mcasa_atlantis/.codex/orchestration/apps/codex-workflows/src/runtime/journal.ts`
- `/Users/mcasa_atlantis/.codex/orchestration/apps/codex-workflows/src/cli/cli.ts`
- `/Users/mcasa_atlantis/.codex/orchestration/apps/codex-workflows/src/main.ts`
- `/Users/mcasa_atlantis/.codex/orchestration/packages/codex/src/runtime/adapter.ts`

## Exact dogfood evidence

Literal command executed:

```sh
./apps/codex-workflows/examples/nestjs-resolver-factory-research.workflow.ts \
  --input apps/codex-workflows/examples/nestjs-resolver-factory-research.input.json \
  --json
```

Completed run ID:

`local-20260808t125616824z-ddeb26e89a89`

Completed local operational journal:

`/Users/mcasa_atlantis/.codex/workflows/runs/local-20260808t125616824z-ddeb26e89a89/journal.json`

Journal SHA-256:

`fd7cf74ef63ccd2cbab5f161938f6aabde621e103bc03be248ef299dacb4cd90`

Decision-ready proposal artifact:

`/Users/mcasa_atlantis/.codex/workflows/runs/local-20260808t125616824z-ddeb26e89a89/artifacts/resolver-factory-proposal.md`

Artifact SHA-256:

`4ad3fb16096eaef505de1806987864d027d598a1b09df2fa53128249dede055f`

The journal is `completed`, contains 16 events, three completed nodes, and one
artifact. Both researchers started concurrently. The consolidator froze only
after both researchers completed, records both node IDs as dependencies, and
has a distinct combined actual-value input digest. All three nodes and observed
SDK argv request exact `gpt-5.6-luna` and `medium`; the journal contains no raw
prompt, input constraint, environment, secret, stack, or raw error probe.

## Preserved historical live attempts

Do not rewrite these as present-day Luna-only proof:

1. `/Users/mcasa_atlantis/.codex/workflows/runs/local-20260808t123921188z-4ef1f17c7cb2/journal.json`
   is a failed zero-node pre-fix SDK packaging attempt; SHA-256
   `aad0ff3bf6bff33cb971b8a43e951dbb09daf9bf3709e5e9877ccf8ad8cf5a60`.
2. `/Users/mcasa_atlantis/.codex/workflows/runs/local-20260808t124143824z-cc74a742bd23/journal.json`
   is an interrupted pre-override attempt that remains honestly `running`; it
   contains two started Luna researchers and no consolidator/non-Luna node;
   SHA-256
   `95454bee06084ef43051ac9f6f5a741b6c7c8b4abb79a57f6f527a4ab27ec662`.

## Exact validation and machine artifacts

Final uncached validation passed:

- all workflows/codex/app lint, typecheck, and build targets;
- workflows aggregate: 15 L1 unit + 11 L1 integration;
- Codex aggregate: 16 L1 unit + 7 L1 integration + 6 real SDK L2;
- app aggregate: 8 L1 unit + 1 journal + 7 L2 integration + 3 L2 E2E +
  5 scenarios/28 steps;
- Ground-0 aggregate: 21 L1 unit + 3 L1 integration + 24 L2 integration +
  2 L2 E2E + 1 scenario/6 steps;
- testing policy: 21 files and 7 standing targets;
- SDK import exclusivity: one allowed import, zero offenders;
- affected closure: workflows, codex, app, and testing all
  lint/typecheck/build/test GREEN;
- Nx graph, sync, exact formatting, skill validation, PATH/bin, journal
  integrity, resource cleanup, `.pi`, and external-audit immutability checks.

Machine-readable outputs:

- `/Users/mcasa_atlantis/.codex/orchestration/test-output/codex-workflows/workflows.json`
- `/Users/mcasa_atlantis/.codex/orchestration/test-output/codex-workflows/codex.json`
- `/Users/mcasa_atlantis/.codex/orchestration/test-output/codex-workflows/codex-workflows.json`
- `/Users/mcasa_atlantis/.codex/orchestration/test-output/ground-zero/testing.json`
- `/Users/mcasa_atlantis/.codex/orchestration/test-output/cucumber/codex-workflows.json`
- `/Users/mcasa_atlantis/.codex/orchestration/test-output/cucumber/ground-zero.json`

## Exact reports and reconciled documentation

Implementation report:

`/Users/mcasa_atlantis/.codex/orchestration/docs/reports/codex-workflows-ts-runner-implementation-report.md`

Self-audit report:

`/Users/mcasa_atlantis/.codex/orchestration/docs/reports/codex-workflows-ts-runner-self-audit-report.md`

This handoff:

`/Users/mcasa_atlantis/.codex/orchestration/docs/reports/codex-workflows-ts-runner-external-audit-handoff.md`

Reconciled product docs:

- `/Users/mcasa_atlantis/.codex/orchestration/README.md`
- `/Users/mcasa_atlantis/.codex/orchestration/SPEC.md`
- `/Users/mcasa_atlantis/.codex/orchestration/ARCHITECTURE.md`
- `/Users/mcasa_atlantis/.codex/orchestration/PLAN.md`
- `/Users/mcasa_atlantis/.codex/orchestration/apps/codex-workflows/CLI.md`
- `/Users/mcasa_atlantis/.codex/orchestration/packages/workflows/SCHEMA.md`
- `/Users/mcasa_atlantis/.codex/skills/workflows/`

## Limitations an external auditor should attack

1. TypeScript source import is trusted local code execution even during
   plan/dry-run; source admission is not a sandbox.
2. The local SDK host currently fixes approval to `never`, sandbox to
   `workspace-write`, and network/web search to live.
3. Journals are bounded per run but total retention is not pruned. Abrupt
   process death can leave `running`, as historical attempt 2 demonstrates.
4. Local run IDs have no cross-process status/events/logs/resume/cancel or
   recovery authority. Those verbs fail closed with exit 69.
5. Dynamic callback graphs cannot be fully enumerated by inspection without
   execution.
6. Final workflow output and artifact content are intentionally exposed to the
   invoking user/run path; redaction applies to public events/journals, not
   declared output content.
7. Backend model availability can change. The final run proves Luna/medium was
   accepted for this execution only, and no fallback is permitted.
8. Machine evidence and both new reports are implementer-authored. A fresh
   identity must verify semantics and false-green resistance independently.

## Immutable prior auditor reports

- External Audit Attempt 1:
  `/Users/mcasa_atlantis/.codex/orchestration/docs/reports/codex-workflows-external-audit-attempt-1.md`,
  SHA-256
  `7e3f5753651b7887476dc562c453fb96ded8e9a7993f827a2f46e30828a4ed46`.
- External Audit Attempt 2:
  `/Users/mcasa_atlantis/.codex/orchestration/docs/reports/codex-workflows-external-audit-attempt-2.md`,
  SHA-256
  `06f41544f043f323163f086aa92ee315114df7a3613cc4e11178fed2d89aaf7e`.

The next valid action is a fresh external audit over the exact candidate and
evidence. No implementation identity can accept its own work.

READY_FOR_EXTERNAL_AUDIT
