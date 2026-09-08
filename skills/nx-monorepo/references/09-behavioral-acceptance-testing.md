# 09 — Behavioral Acceptance Testing (BATDD)

> Reference doc for the nx-monorepo skill. How behavior becomes an executable acceptance
> contract in an Nx workspace: the BATDD layer stack, file placement, binding law, RED/GREEN
> integrity, and the false-pass classes that only discipline prevents.
>
> **Canonical doctrine lives in the Agent Wiki** — `standards/BATDD.md` and
> `standards/GHERKIN.md` (ratified from the Mercury v0.1 goal run,
> `lessons/MERCURY-v0.1.goal.md`). This reference is the workspace execution profile: paths,
> runners, and Nx targets. It may not weaken a MUST from those standards.

## TL;DR

- **`FEATURE.md` is the authored source of truth.** Inline fenced ` ```gherkin ` blocks
  define the scenarios; generated `.feature` files are mirrors for the runner, never edited.
- Three deterministic layers: **L1** unit (`*.test.ts(x)`, colocated, pure), **L2** contract
  (`*.spec.ts` package contracts + Playwright journeys), **L3** acceptance (Cucumber scenarios
  bound by `index.steps.ts`).
- A scenario derives from ratified authority (architecture ADRs, feature charter) — it never
  invents behavior. No source anchor → stop and escalate.
- **A green suite can be a convincing simulation of the wrong system.** The mock-fidelity,
  dogfood, and cleanup laws below exist because that happened (79/79 scenarios green against a
  CLI dialect that didn't exist).

## Layer stack → Nx targets

| Layer      | Files (Founder S8 chain)                 | Owns                                                                                                     | Nx target          | Rules                                              |
| ---------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------ | -------------------------------------------------- |
| L1         | `<context>/test.spec.ts` colocated       | THOROUGH deterministic unit verification                                                                 | `test`             | pure — no DB, no network, no fs outside temp       |
| L2         | `<context>/test.e2e.ts`                  | e2e + integration verification (real local infra allowed: ephemeral DB, real binary, rendered component) | `contract` / `e2e` | never against live/shared state                    |
| L2-journey | Playwright in the e2e app                | human-surface journeys                                                                                   | `e2e`              | browser tests never simulate agents                |
| L3         | `FEATURE.md` + `<context>/test.steps.ts` | self-verifying BATDD acceptance scenarios                                                                | `acceptance`       | every invariant gets a negative rejection scenario |

**The S8 chain is repo-wide law:** every surface (domain slice, feature, ui component, …)
carries `<context>/test.[spec|e2e|steps].ts`. Scaffold the chain with
`nx g @arcana-market/gen:test` (or a full ui component with `@arcana-market/gen:component` —
atomic anatomy: `index.tsx` barrel, `ui.tsx` composition, `ui.stories.tsx`, plus the chain).
Unit targets must exclude `test.e2e.ts`/`test.steps.ts` from their glob — layer bleed is a
false-pass vector. Legacy `*.test.ts` / `index.steps.ts` files migrate as waves touch them.

Runner names are profile data, not doctrine (this repo: vitest for L1/L2, Playwright for
journeys, Cucumber for L3). Subjective human/model judgment sits **outside** the deterministic
target vocabulary — review lanes are not `nx test`.

## File placement

```text
packages/<pkg>/src/<domain>/<slice>/
  FEATURE.md          # authored scenarios (gherkin fences) — lowered from the feature charter
  index.steps.ts      # canonical acceptance orchestration layer
  *.test.ts(x)        # L1
  *.spec.ts           # L2
  support/            # fixtures, fakes, helpers
```

`apps/*` stay thin shims — feature logic and reusable verification live in `packages/*`
(ref 02). `index.steps.ts` may call shared support code and invoke Nx targets for layer gates;
it MUST NOT import raw test-runner entrypoint files.

## Execution loop

1. Write `FEATURE.md` (scenarios from the ratified authority, stable feature IDs in titles)
2. Write `index.steps.ts` bindings
3. Write L1 substrate → 4. Write L2 substrate → 5. Make L1+L2 green
4. Run the scenario layer → 7. Iterate until acceptance passes

RED comes first and leaves provenance: paste the failing gate output into the lane/PR report
**before** any GREEN file exists.

## Step-binding law (learned at 15-undefined + 1-ambiguous)

- Task/feature IDs live in **scenario titles only** — step text binds character-for-character,
  never paraphrased, never ID-prefixed. Select per-task with `--name`.
- Canonical definition form: regex via a literal-escaping helper
  (`Given(regexOf('<exact step text>'), …)`) — Cucumber Expressions choke on `(...)`/`{}`/`/`
  in real step text. Pending stubs are forbidden; every step body carries a real assertion.
- Generic layer-gate steps (`L1 verification passes`) are defined **once** in the root steps
  barrel; domain files never redefine them (ambiguous = hard fail).
- **Import smoke in every lane gate:** any file only exercised at integration time needs a
  lane-local load gate — e.g. `node -e "import('./<slice>/index.steps.ts')"`. A wrong relative
  path otherwise ships invisibly until integration.
- One scenario = one executable test case; renames after GREEN are contract changes.

## Contract vs plumbing (RED/GREEN integrity)

Frozen at first GREEN: **it-titles, assertion lines, scenario semantics.**
Standing repair authorization during GREEN: **plumbing** — mocks, fixtures, imports, temp-dir
setup — under an evidence triple:

1. before/after diff of the plumbing change
2. byte-diff proof the frozen assertions are unchanged
3. validator green after

Protect the contract, free the plumbing. Plumbing repairs don't consume retry budget; contract
edits without the amending authority's sign-off are tampering.

## Mock fidelity, dogfood, and cleanup (the false-pass classes)

- **Mocks encode fiction as happily as fact.** Every external contract a seam mock encodes
  (CLI verbs, API shapes, wire envelopes) MUST be verified against the live tool/contract:
  an L1 grep/shape test against real output plus an L2 contract spec. Write the contract spec
  adversarially — assert the _wrong_ verb is **absent**, not just the right one present.
- **Never trust exit codes alone.** Tools that exit 0 and print help on unknown input defeat
  naive error detection — assert on output shape.
- **Leak gate:** tests that create external primitives (containers, workspaces, buckets, rows
  in shared infra) MUST guarantee cleanup on failure paths (helper-owned create→yield→close),
  and every sweep involving external primitives asserts resource-count-before == after. One
  unguarded spec once leaked 730 workspaces.
- **Dogfood as a gate:** run the product's real vertical slice live as soon as it exists — both
  Mercury live-dispatch runs caught defect classes the entire green pyramid could not.
- **Full gate sweep, every time:** the standing sweep is lint + typecheck + build + test +
  contract + acceptance (+ leak gate where applicable). Any gate not in the sweep silently
  accumulates debt — W5 discovered W4's 19 type errors because nobody ran typecheck.
- After fixing a lower layer (substrate, driver, seam), **re-audit every consumer above it**
  for newly-real side effects — a fix below can arm dormant behavior upstream.

## This repo

L1/L2/L3 placement, target names (`test` / `contract` / `e2e-ci` / `acceptance`), the
testkit-only DB path, and the invariant-rejection-scenario requirement are ratified in
ADR-W0-14 (`docs/decisions/ARCHITECTURE-RATIFIED.md`); CI wiring in ADR-W0-13 + ref 05.
`FEATURE.md` is a lowered artifact of the PRD-lowering chain (Agent Wiki `standards/PRD
Lowering.md`).

## Review checklist

- [ ] Scenario traces to a ratified authority (ADR/charter/invariant) — nothing invented
- [ ] `FEATURE.md` fence is the only authored copy; mirrors are generated/synced, never edited
- [ ] Step text binds verbatim; IDs in titles only; no redefined generic gates; import smoke passes
- [ ] RED evidence recorded before GREEN; contract frozen, plumbing repairs carry the evidence triple
- [ ] Every seam mock has a live-contract verification (L1 shape test + adversarial L2 spec)
- [ ] External primitives cleaned up on failure paths; leak gate in the sweep
- [ ] Full gate sweep run — not just the test target
- [ ] Every invariant has a negative (rejection) scenario
