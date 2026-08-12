# Founder proof recovery and scoped process control

**Green Contract:** `CDX-WF-PROOF-RECOVERY-GC-1`  
**Authority:** Founder ruling of 2026-08-12 and immutable assignment `CDX.PROOF-RECOVERY.F1`  
**Scope:** failed-only recovery of Attempt 11 evidence/control-plane findings; prior attempts and proof bytes remain immutable.

## Rules

- PostgreSQL `process` state is authoritative over files, terminal text, journals, and authored reports.
- Only scoped clients may register candidate facts, immutable artifact bytes, Preflight submissions, or Judge verdicts.
- The deterministic reducer alone derives judgment readiness and terminal audit projections.
- Exact duplicate idempotency keys are harmless; conflicting duplicates block without mutating accepted state.
- `PREFLIGHT-VALID` requires an exact registered candidate, a complete registered evidence bundle, passing nonzero machine gates, zero unexpected resource delta, and immutable proof bytes whose SHA-256 digests match.
- Workers, coordinators, and local workflow runtimes cannot self-approve Preflight or submit a Judge verdict.
- Historical proof is append-only. Corrected counts and references use successor artifacts and never rewrite the old bytes.

## Green Contract rows

| Row | Form | Layer | Meaningful RED | Observable GREEN | Isolation and evidence |
|---|---|---|---|---|---|
| `PR1-L1-001` | basic | L1 unit | No reducer exists, so a registered exact candidate cannot reach a deterministic `registered` projection. | Reducing the same ordered valid events always yields the same projection and replay digest. | In-process Vitest; nonzero selected count and machine report. |
| `PR1-L1-002` | adversarial | L1 unit | Duplicate and conflicting idempotency keys have no executable admission boundary. | Exact duplicates are idempotent; conflicting payloads fail closed with no state change. | In-process Vitest with before/after projection assertion. |
| `PR1-L1-003` | adversarial | L1 unit | Empty, fabricated, or host-projected command evidence is accepted. | Positive command expectations require runtime-attested, nonempty terminal-command evidence; empty, zero, fabricated, mismatched, and public-host forged evidence reject. | Workflows L1 matrix with zero adapter/evidence admission on rejection. |
| `PR1-L1-004` | adversarial | L1 integration | No role policy exists for candidate, artifact, Preflight, and verdict operations. | The policy permits only the exact role/operation pairs and rejects worker self-certification. | In-process policy/reducer tests; every denial asserts no transition. |
| `PR1-L2-001` | basic | L2 integration | Live PostgreSQL has no `process` schema, migration, or immutable registration tables. | The non-destructive migration applies twice; registered artifact bytes are digest-checked and cannot be updated or deleted by scoped roles. | Isolated real PostgreSQL schema/database fixture, before/after inventory, uncached Nx target. |
| `PR1-L2-002` | adversarial | L2 integration | No callable scoped CLI exists and all durable operations are unavailable. | Distinct coordinator, Preflight, Judge, and reader credentials can invoke only their public commands; cross-role and arbitrary SQL attempts fail. | Spawn the real Bun CLI against real PostgreSQL; redact credentials; zero residue. |
| `PR1-L2-003` | adversarial | L2 integration | A prose/file-only Preflight can claim validity without complete immutable evidence. | The SQL reducer rejects missing, zero-test, failed-gate, digest-mismatched, stale-candidate, or nonzero-resource bundles; one exact complete bundle derives `judgment_ready`. | Real transaction and replay from registered artifacts with stable projection digest. |
| `PR1-L2-004` | adversarial | L2 integration | Public CRA Markdown exposes executable, argv, private match text, and cache/config paths. | Fresh public CRA evidence contains only digests, counts, statuses, and stable IDs; forbidden raw metadata is absent from report and journal. | Fresh public process run plus file/journal scan and cleanup inventory. |
| `PR1-L3-001` | basic | L3 behavior | The canonical registration scenario is undefined and no public process surface can reach judgment readiness. | Through the real public CLI, a coordinator registers Attempt 1, Preflight registers immutable proof and submits valid evidence, the reducer derives `judgment_ready`, and a reader observes it. | Physical Cucumber scenario, real PostgreSQL, distinct scoped clients, nonzero assertions, exact cleanup. |
| `PR1-L3-002` | adversarial | L3 behavior | A worker can substitute authored Markdown or an unregistered path for immutable proof. | The public scenario rejects unregistered proof and worker self-approval; projection remains non-ready. | Separate scenario state; no L1/L2 runner invocation from steps. |
| `PR1-CLOSE-001` | basic | closure | Candidate-visible proof count and frozen CRA references are stale. | Append-only successor artifacts record 57 native passes and historical/current hashes; old files remain byte-identical and registered. | SHA-256 cross-reference validator plus exact candidate manifest. |

## Canonical behavior

The physical behavior source is [proof-recovery.feature](proof-recovery.feature). It does not duplicate native edge matrices.

## Stop boundary

The implementing identity stops at `READY-FOR-AUDIT` after affected GREEN, live proof, immutable registration, deterministic reducer projection, and zero unexpected resource delta. Fresh Preflight and Judge identities remain independent.
