# Codex Workflows External Audit — <ATTEMPT_ID>

**Template version:** 1.0.0  
**Audit date (UTC):** <YYYY-MM-DDTHH:MM:SSZ>  
**Attempt ID:** `<ATTEMPT_ID>`  
**Auditor identity:** <fresh external auditor identity>  
**Auditor model:** `gpt-5.6-sol`  
**Reasoning:** `high`  
**Workspace:** `<absolute-workspace-root>`  
**Base:** `<BASE_REVISION>`  
**Candidate:** `<CANDIDATE_REVISION_OR_CURRENT_DISK_DIGEST>`  
**Assignment:** `<ASSIGNMENT_ID_AND_PATH>`  
**Green Contract:** `<CONTRACT_ID_HASH_AND_PATH>`  
**Audit output:** `.agent/audit/workflows/<ATTEMPT_ID>/AUDIT.md`

## Independence declaration

State whether the auditor implemented, repaired, coordinated, or previously
judged any part of this candidate. State the exact audit write surface and any
condition that limits independence. Do not claim reducer approval or Preflight
authority without registered evidence.

## <APPROVED | BLOCKED | ESCALATED>

Replace this heading with exactly one verdict. Give a concise justification
that distinguishes the numerical score from constitutional acceptance.

## Canonical score

**Canonical score: <0-5>/5**  
**Score eligibility threshold:** at least 4/5, zero unresolved blocking or
constitutional violations, complete independent evidence, required L3 GREEN,
and zero unexpected resource delta.

| # | Dimension | Point (0/1) | Decisive evidence |
|---:|---|---:|---|
| 1 | Standardized authoring and direct-runner contract correctness | <0-or-1> | <file:line, command, artifact> |
| 2 | Model policy, SDK lifecycle, failure ordering, safety, and cleanup | <0-or-1> | <file:line, command, artifact> |
| 3 | Typed composition, provenance, schema, journal, and artifact correctness | <0-or-1> | <file:line, command, artifact> |
| 4 | Compatibility, deterministic exits, evidence integrity, test quality, and false-green resistance | <0-or-1> | <file:line, command, artifact> |
| 5 | Founder self-L3 daily-facts execution through the real public surface | <0-or-1> | <journal, report, Cucumber artifact, resource proof> |

Show the arithmetic explicitly: `<D1> + <D2> + <D3> + <D4> + <D5> = <TOTAL>/5`.

## Authority and artifact intake

- Human/Founder ruling:
- Repository instructions and README files:
- BATDD profile and immutable assignment:
- Frozen Green Contract:
- Canonical Wiki standards consulted:
- Prior audits and locked greens:
- Expected artifacts:
- Missing or stale artifacts:

## Candidate and change-set identity

- Branch and HEAD:
- Base revision:
- Candidate revision or current-disk digest:
- Git status and untracked deliverables:
- Authorized write surfaces:
- Out-of-surface changes:
- Candidate drift observed during audit:

## Preflight proof validation

| Evidence class | Exact command/artifact | Exit and nonzero counts | Candidate binding | Result |
|---|---|---|---|---|
| L1 | <...> | <...> | <...> | GREEN / RED / INVALID |
| L2 | <...> | <...> | <...> | GREEN / RED / INVALID |
| L3 | <...> | <...> | <...> | GREEN / RED / INVALID |
| Standing gates | <...> | <...> | <...> | GREEN / RED / INVALID |
| Resource delta | <...> | <before/after> | <...> | ZERO / NONZERO / INVALID |

State whether Preflight is fresh, independent, uncached where required,
nonzero, machine-readable, immutable, and reducer-approved. Use
`PREFLIGHT-INVALID` when any required property is absent.

## Founder self-L3 daily-facts evidence

- Workflow source and exact shebang:
- Literal public execution command:
- UTC timestamp and expected report path:
- Completed run ID and journal digest:
- Exactly three research nodes:
- Exact `gpt-5.6-luna` and `medium` policy:
- Concurrency and terminal ordering:
- Three distinct industry/topic selections:
- Summary quality and length boundary:
- Article titles and links:
- `DAILY_FACTS.md` digest and content checks:
- Cucumber scenario/step counts:
- Process, tmux, temp-file, and workspace resource delta:

## Targeted adversarial and false-green probes

| Risk | Probe or source inspection | Result | Decisive evidence |
|---|---|---|---|
| Terminal event before active work drains | <...> | CLOSED / OPEN | <...> |
| False provenance for equal values | <...> | CLOSED / OPEN | <...> |
| Secret-bearing journal keys | <...> | CLOSED / OPEN | <...> |
| Duplicate artifact name or post-terminal write | <...> | CLOSED / OPEN | <...> |
| Runtime-invalid model/reasoning | <...> | CLOSED / OPEN | <...> |
| Host-invalid structured schema | <...> | CLOSED / OPEN | <...> |
| Timing-sensitive aggregate cleanup | <...> | CLOSED / OPEN | <...> |
| Daily-facts link/content false pass | <...> | CLOSED / OPEN | <...> |

## Violations report

Every discovered or inherited violation must appear here. If none exist, write
`No violations` and cite the complete inspected surfaces and probes.

| Violation ID | Severity | Dimension | Violated authority | Decisive evidence | Impact | Required correction | Authorized repair surface | Validator | Disposition |
|---|---|---:|---|---|---|---|---|---|---|
| `<AUDIT-ID>-001` | blocking / high / medium / low / advisory | <1-5> | <rule or contract> | <file:line, command, artifact> | <observable consequence> | <exact change> | <smallest surface> | <exact gate> | OPEN / CLOSED / REGRESSED / NOT-APPLICABLE / PREFLIGHT-INVALID |

## Security, scope, and invariant review

- Source admission and trusted-code boundary:
- Prompt/input/journal confidentiality:
- Model and reasoning enforcement:
- Write-surface compliance:
- Durable-control non-claims:
- Independent-verdict boundary:

## Resource hygiene

| Resource | Before | After | Delta | Interpretation |
|---|---:|---:|---:|---|
| Auditor tmux sessions | <...> | <...> | <...> | <...> |
| `codex exec` descendants | <...> | <...> | <...> | <...> |
| Workflow processes/groups | <...> | <...> | <...> | <...> |
| Loader/journal temporary files | <...> | <...> | <...> | <...> |
| Retained run/audit artifacts | <...> | <...> | <...> | authorized / unexpected |

## Discrepancies between claims and current disk

List every mismatch between implementation reports, machine evidence, prior
audits, current source, test output, and live behavior. If none exist, cite the
commands and artifacts used to establish that result.

## Exhaustive retry ledger and dependency DAG

Required for `BLOCKED`; otherwise write `Not applicable` with the verdict
reason. Preserve locked greens and include every open violation.

| Lane | Findings | Frozen greens | Exact repair | Write surface | Validator | Dependencies | Stop boundary |
|---|---|---|---|---|---|---|---|
| <lane-id> | <violation IDs> | <contract rows/hashes> | <bounded change> | <paths> | <exact Nx/live gate> | <lane IDs> | <boundary> |

## Escalation ask

Required for `ESCALATED`; otherwise write `Not applicable`. Name the exact
decision, authority owner, options, and paused surfaces.

## Next action

Name exactly one authorized next move implied by the verdict: approval
closeout, retry DAG, fresh Preflight, Attempt 2, Purity Recovery, successor
judgment, or Founder decision.

EXTERNAL_AUDIT_COMPLETE
