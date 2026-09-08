# 08 — Ownership, Task Routing, and Cross-Team Coordination

> Reference doc for the nx-monorepo skill. Who owns what, which work goes to humans vs agents,
> and how cross-cutting changes get coordinated. Absorbs the former `team-lead.md` reference
> and the CODEOWNERS/protection guidance from the retired monorepo-workflows skill.

## Code ownership

```
# .github/CODEOWNERS — ownership follows the project layout
/apps/arcana/            @frontend-owners
/apps/cli/ /apps/mcp/    @agent-runtime-owners
/packages/domains/       @backend-owners
/packages/db/            @backend-owners
/packages/ui/            @frontend-owners
/.github/ /nx.json       @platform-owners
*.lock pnpm-workspace.yaml @platform-owners
/.agents/ /.agent/       @platform-owners
```

Principles:

```
1. Every path has exactly ONE owning team (last matching rule wins — order matters)
2. Owners MUST approve PRs touching their areas
3. Cross-cutting changes require ALL touched owners
4. No orphan code — if no rule matches, add one
```

In an agent-operated repo, "owner" includes the **lane doctrine**: which model/agent class owns
which surface. This repo's binding lane table (Claude models → UI/frontend/workspace; Sol/Codex →
mechanical backend) lives in `docs/decisions/ARCHITECTURE-RATIFIED.md` §1.

## Human–agent task routing

```
HUMAN (Founder/lead) ONLY:
- Architecture decisions and conflict settlements
- Breaking-change and cross-domain approval
- Security-critical changes; production deploys

AGENT-ASSISTED (human/judge reviews):
- Feature implementation, tests, docs, refactors, dependency updates

AGENT AUTONOMOUS:
- Lint/format/type-error fixes, mechanical migrations, generated-code refresh
```

Routing tree:

```
Task arrives:
├── Strategic / settles a conflict?   → HUMAN
├── Requires judgment across domains? → HUMAN coordinates, agents execute lanes
├── Well-defined & repeatable?        → AGENT
└── Default: simple → agent + review · complex → human-led · production → human required
```

## Evaluating agent output (reviewer competency)

```
- Does it match the requirement, or a plausible neighbor of it?
- Is it subtly wrong? (right shape, wrong invariant)
- Are edge cases handled or hallucinated away?
- Is it over-engineered? (speculative flags, unused abstraction)
- Did it respect project boundaries and the write-surface it was assigned?
```

| Gate              | Agent        | Human       | Lead     |
| ----------------- | ------------ | ----------- | -------- |
| Tests pass        | must         | must        | reviews  |
| Breaking change   | flags        | reviews     | approves |
| Cross-domain      | flags        | coordinates | approves |
| Security-touching | passes gates | verifies    | approves |

## Cross-team / cross-lane coordination (RFC)

For changes spanning multiple owned areas:

```markdown
# RFC: <title>

## Summary — one paragraph

## Motivation — problem being solved

## Design — technical shape

## Affected projects — @arcana-market/<pkg>: <change> (one line each)

## Migration — how existing code moves

## Approvals — [ ] each affected owner
```

Protocol: write RFC → tag all owners → written approval → implement in phases
(add new → migrate consumers → remove old; see `07-collaboration.md` breaking-change protocol)
→ announce + update docs.

## Protected surfaces

- Branch protection on `main`: required reviews + required checks (`ci`, `contract` at minimum).
- Critical paths get double ownership in CODEOWNERS (e.g. lockfiles, CI workflows, money-path
  packages).
- Onboarding (human or agent seat): read the workspace docs top-down — root `CLAUDE.md`/README,
  the ratified architecture, then this skill — before the first PR.

## Review checklist

- [ ] CODEOWNERS covers every new path; order puts specific rules last
- [ ] Cross-cutting PR has approvals from all touched owners
- [ ] Work was routed at the right autonomy level for its risk
- [ ] RFC exists for multi-domain changes before implementation started
