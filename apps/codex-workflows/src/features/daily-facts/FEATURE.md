# Founder daily-facts workflow

The standardized public workflow researches three independently selected industry/topic briefs through exactly three concurrent Codex research agents and publishes one auditable Markdown report.

## Rules

- Execution uses the literal public `#!/usr/bin/env -S codex-workflows` entrypoint.
- Exactly three dependency-free research nodes run with `gpt-5.6-luna` and `medium` reasoning; there is no consolidator node.
- The three normalized industry/topic pairs are distinct and selected from seed-randomized, disjoint industry groups.
- Each brief answers “what's going on with `<INDUSTRY>` in `<TOPIC>`” with a substantive summary and at least two titled direct HTTPS article links.
- Under the Founder ruling `FOUNDER-20260810-SEVEN-DAY-NEWS-WINDOW`, article publication age is 0 through 7 UTC days inclusive relative to the workflow timestamp. Future articles and articles older than seven days fail closed.
- Every claimed publication date and headline must be visible on the live publisher page, and every headline must be visibly relevant to its brief.
- The report is atomically published at `.agent/testing/workflows/<UTC_TIMESTAMP>/DAILY_FACTS.md`, with byte and digest continuity to the private run artifact and journal.
- Completion requires settled report bytes, a terminal journal event last, and zero unexpected process, tmux, temporary-file, or workspace-diff delta.

## Canonical behavior

- [Physical Gherkin](./daily-facts.feature) — `DAILY-FACTS-L3-001`

## Native coverage

- [L1 content contract](./daily-facts.test.ts) — shape, date window, date evidence, relevance, rendering, and rejection matrix.
- [L2 public-runner contract](./daily-facts.spec.ts) — literal executable workflow, exact topology, artifact publication, failure isolation, and cleanup.
- [L3 real-surface driver](./support/driver.ts) — live publisher verification, journal/report identity, concurrency, and resource delta.

## Acceptance and evidence

- Green Contract: `CDX-WF-DF-GC-1` in `packages/testing/evidence/codex-workflows-daily-facts-green-contract.json`.
- Meaningful RED record: `packages/testing/evidence/codex-workflows-daily-facts-red.json`.
- Worker completion stops at `READY-FOR-AUDIT`; exact-candidate Preflight and a fresh independent external audit retain acceptance authority.
