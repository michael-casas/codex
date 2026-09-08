# CAS-01 Independent QA Audit Charter

**Model:** `gpt-5.6-sol`, medium reasoning  
**Role:** independent read-only QA/false-green auditor  
**Candidate worktree:** `/Users/mcasa_atlantis/.codex/worktrees/7467/.codex`  
**Candidate surface:** `sha256:d08c32b57e9fa54da76e3b3b567b6842dc63f17537713d4c6dfd57b2ed88f8ac`

## Objective

Independently attack CAS-01’s claimed L1/L2 evidence and real stdio App Server behavior. Verify that the public seam—not a test-only proxy—faithfully handles the representative success, rejection, interruption, ambiguity, bounds, and cleanup contracts. Do not implement or mutate acceptance.

## Required reading

Read candidate `AGENTS.md`, `GUIDELINES.md`, `README.md`, `TESTING.md`, the CAS-01 charter, immutable assignment, Green Contract, protocol-ready evidence, global `batdd`, and global `seam` audit instructions. Bind the exact base, candidate, generated-tree, evidence, and Green Contract identities before testing.

## Audit rules

- No product, test, acceptance, evidence, configuration, Git, or Wiki writes. Test-runner cache/output side effects are allowed only when unavoidable and must be inventoried; do not overwrite the immutable CAS-01 evidence files.
- Recompute decisive hashes and inspect source/selection/execution counts before trusting authored evidence.
- Run the smallest uncached Nx checks needed to attack false greens. Verify real `codex app-server --listen stdio://` stream and interrupt behavior, malformed input/version mismatch, duplicate/unmatched IDs, abort/timeout/ambiguous EOF, slow-consumer bounds, secret redaction, and process/feed cleanup.
- Check wrong-target, zero-selection, mocked-provider, stale-generated-source, test-only-seam, unawaited/no-op assertion, and ambient-resource masking attacks.
- Continue after findings where safe and return stable `CAS01-QA-*` findings with severity, command/runtime/file evidence, impact, root cause, smallest repair, and exact verifier.
- Do not repair. A failed or unavailable real boundary is a finding or explicit halt, never an invented pass.

## Deliverable and stop

Return candidate identity, independence declaration, exact commands and nonzero counts, real-boundary/resource evidence, findings ledger, blocking/advisory totals, residual risk, and `CAS01_QA_AUDIT_COMPLETE`. Do not write a report file or issue final acceptance.
