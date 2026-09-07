# CAS-01 Independent Code Quality Audit Charter

**Model:** `gpt-5.6-sol`, medium reasoning  
**Role:** independent read-only Code Quality auditor  
**Candidate worktree:** `/Users/mcasa_atlantis/.codex/worktrees/7467/.codex`  
**Candidate surface:** `sha256:d08c32b57e9fa54da76e3b3b567b6842dc63f17537713d4c6dfd57b2ed88f8ac`

## Objective

Audit the complete CAS-01 typed App Server client seam for interface depth, correctness risks visible from structure, provider leakage, cleanup ownership, caller compatibility, and unnecessary complexity. Do not implement or mutate the candidate.

## Required reading

Read candidate `AGENTS.md`, `GUIDELINES.md`, `README.md`, `TESTING.md`, the CAS-01 charter and immutable assignment, the global `seam` audit instructions, `ponytail:ponytail-review`, and the Agent Wiki `Clean Code` and `File System` notes through the read-only Wiki workflow. Bind the CAS-01 evidence and Green Contract hashes before inspecting the full candidate diff, callers, generated boundary, exports, tests, and composition points.

## Audit rules

- Read-only: no source, test, acceptance, evidence, configuration, Git, or Wiki writes; do not run formatters or commands that rewrite outputs.
- Inspect the full public seam, not only the diff: request correlation, initialization, bounded feeds, server requests, provider-error mapping, abort/timeout/EOF, close/child cleanup, generated-type ownership, and every affected caller/export.
- Run Ponytail review as the complexity-only subpass, but report correctness/ownership findings separately.
- Attack hidden bypasses, duplicate protocol logic, one-implementation abstractions, speculative flexibility, raw provider leakage, unbounded state, and cleanup split across callers.
- Continue after findings and return one exhaustive ledger with stable `CAS01-CQ-*` IDs, blocking/advisory severity, file/line evidence, impact, root cause, smallest repair, and exact verifier.
- If no findings exist, say so explicitly. Never approve beyond the audit role.

## Deliverable and stop

Return the candidate identity, independence declaration, inspected surface, findings ledger, blocking/advisory totals, Ponytail net-line result, residual risks, and `CAS01_CODE_QUALITY_AUDIT_COMPLETE`. Do not write a report file or repair anything.
