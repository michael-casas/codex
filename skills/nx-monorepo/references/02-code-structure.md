# 02 — Code Structure: Orchestration vs Reusable Mechanics

> Reference doc for the nx-monorepo skill. When code belongs in an app, when it belongs in a
> package, and how to split packages so they are actually reusable. Absorbed from the
> `code-structure` skill and re-aimed at Nx `packages/` splitting.

## TL;DR

**Two-layer separation, mapped to the workspace:**

- `apps/*` **orchestrate** — they own the "why/when": business flow entry points, auth wiring,
  state transitions, failure classification, user-facing errors.
- `packages/*` **own reusable mechanics** — the "how": operations that are reliable, composable,
  explicitly parameterized, and consumed by 2+ callers (or 2+ apps).

This prevents the classic monorepo rot: the same operational logic copy-pasted into three route
handlers, a bug fixed in one path but not the others, and "shared" packages that secretly reach
back into app state.

## The core pattern

```
apps/* (orchestration)                 packages/* (reusable mechanics)
├── owns business rules                ├── owns reusable operations
├── owns state transitions             ├── owns provider/SDK interactions
├── owns auth/ownership checks         ├── owns execution details, retries-at-the-edge
├── owns failure classification        ├── owns health checks / readiness
├── owns user-facing errors            └── returns structured results
└── composes package functions
```

**Rule of thumb:**

- "What this product flow _means_" → app (or the domain package that owns the flow)
- "How to do this operation _reliably_" → a package with an explicit API

## When to extract to a package

Extract when:

- 2+ projects need the same operation (upload verification, client dance, email send)
- You are copy-pasting operational logic between apps or between route handlers
- A bug fix in one flow didn't propagate to another doing the same thing
- A new feature shares mechanics with an existing one

Do **not** extract when the logic has exactly one caller and no second consumer on the roadmap.
A single-consumer package is over-abstraction: it adds a project boundary, a version, a
changeset, and a graph node for nothing. Keep it app-local (e.g. `apps/<app>/src/features/…`)
until reuse is proven.

## Package granularity — split like you mean it

A package earns its existence by passing the **deletion test**: if you deleted it, would 2+
consumers each have to reimplement it? If only one consumer would notice, fold it back.

- Prefer **fewer, deeper packages** with clear internal structure over many shallow ones.
  Internal slices live inside the package (`src/<domain>/<slice>/`), not as separate projects.
- One project per domain-slice is an anti-pattern: it invites barrel bypass, explodes the graph,
  and turns every refactor into a project rename.
- Split a package only along a real fault line: different consumers, different runtime
  constraints (client-safe vs server-only), or different release cadence.

## Designing package APIs — capability blocks

Design exports as **composable capability blocks**, not monoliths:

```ts
// Good: each caller composes what it needs
createStagedUpload(...)
verifyChecksum(...)
promoteImmutable(...)
issueDownloadUrl(...)

// Bad: one god function hides all control flow
handleContentLifecycle(everything)
```

Each exported function must:

- Accept all required data as **explicit parameters** — no hidden globals, no reading env
  deep inside (env is read at the composition root in the app and passed down)
- Return **structured results** (`{ ok, artifact, reason }`) — failures explicit, not swallowed
- Never reach into an app's database/state on its own initiative — persistence goes through
  the package that owns it
- Be exported through the **barrel** (`index.ts`) or a declared subpath — deep imports are
  a boundary violation (see `01-workspace-structure.md`)

This lets each app choose strict vs relaxed behavior per flow without forking the mechanic.

## Client-safe splitting

When a package is consumed by code that ships to user/operator machines, split the surface, not
the package: a `./contracts`-style subpath export containing only types + validators, with a
boundary test proving no transitive server imports. See `01-workspace-structure.md` → Subpath
exports.

## Migration checklist (extracting shared logic)

1. Write the flow in the app first — get the behavior clear and shipped.
2. Mark the repeated operational chunks across callers.
3. Extract **only** repeated, non-domain chunks into the package.
4. Replace one caller → `pnpm nx affected -t typecheck lint test` → then migrate the rest.
5. Keep domain policy (auth, status transitions, error classification) in the orchestrating layer.
6. Wire the dependency properly (link-workspace-packages skill) — never patch with tsconfig paths.

## Anti-patterns

| Anti-pattern                                 | Problem                                                                                              |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **God package** (`packages/utils` catch-all) | Everything depends on it; every change affects the world; `nx affected` degenerates to "all"         |
| **Leaky package**                            | Package mutates app-owned state or reads app config directly; can't be reused or tested in isolation |
| **Upward import**                            | Package imports from `apps/*` — inverts the graph, usually a composition-root smell                  |
| **Single-consumer package**                  | Project overhead with no reuse payoff — keep it app-local                                            |
| **Inconsistent API**                         | Each function different arg style and error semantics; callers can't compose                         |
| **Barrel bypass**                            | Consumers deep-import internals; the package can never refactor safely                               |

## Mental model

```
New feature? → Write it in the app first
            → Repeated mechanics across 2+ callers? → Extract to a package (capability blocks)
            → No repetition?                        → Keep it app-local, note it, move on
```

One sentence: **apps orchestrate the domain flow; packages centralize reusable mechanics behind
composable, explicit-input, structured-output APIs.**

## Review checklist

- [ ] No business/flow logic living in a package that only one app's flow uses
- [ ] No operational logic duplicated across 2+ callers (extraction trigger hit?)
- [ ] Package functions take explicit params and return structured results
- [ ] No package reads env/db/app-state it doesn't own
- [ ] New package passes the deletion test
- [ ] Consumers import via barrel/subpath only
