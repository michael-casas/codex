---
name: mercury
description: Use the Mercury CLI (v0.1) to dispatch agent jobs onto cmux surfaces with strict MODEL | runtime naming, witness lifecycle via agent.hook.Stop, and query/cancel/report jobs. Use when a task needs programmatic multi-agent dispatch through cmux, job lifecycle tracking, dry-run wave planning, or boomerang --track attachment — instead of hand-rolling cmux send loops.
version: 0.1.0
---

# Mercury — cmux Runner + Lifecycle Witness (v0.1)

Mercury dispatches agent prompts onto cmux surfaces and WITNESSES their lifecycle. It never reasons: no retries, no verdicts, no callback-content validation (RLR). Orchestration intelligence stays with YOU — Mercury is the substrate.

**Home:** `packages/mercury/` in the `michael-casas` workspace (bun + Nx).
**Invoke:** `bun <repo>/packages/mercury/src/main.ts <command>` (bun-native; no build step).
**Pinned:** v0.1 (acceptance signed 2026-07-08, all 15 gates — `.agent/reports/mercury/MERCURY-v0.1-ACCEPTANCE.md`).

## Quick start

```bash
cd <project>
bun <repo>/packages/mercury/src/main.ts init          # scaffold .mercury/
# author .mercury/<job>-processes.json (see references/processes-schema.md)
bun .../main.ts dispatch --dry-run --file <file>.json # wave plan + validation, zero side effects
bun .../main.ts dispatch --file <file>.json           # → mj_<8-hex> job id
bun .../main.ts check mj_xxxxxxxx                     # status table (--json for envelope)
bun .../main.ts cancel mj_xxxxxxxx                    # SIGTERM + CANCELLED marks
```

ALWAYS dry-run before live dispatch. Dry-run prints the per-agent runtime resolution + strict `MODEL | runtime` surface labels + a validation verdict.

## Command map

| Command | What | Exits |
|---|---|---|
| `init` | `.mercury/{processes.json,runtimes.toml(8 entries),listeners/,jobs/,charters/,.gitignore}` | 0 |
| `agents` | 8 runtime identifiers + `Deferred: opencode` notice | 0 |
| `dispatch [--dry-run] [--track] --file <json>` | validate → workspaces+surfaces (strict labels) → prompts → ONE listener (POP) → `mj_` id | 0 / 1 partial / 5 config / 9 dependency |
| `check <job>` | job + per-agent table | 0 / 4 |
| `cancel [--force] <job>` | SIGTERM (KILL with --force) pgid, close surfaces, mark CANCELLED — degraded path still marks, exit 3 | 0 / 3 / 4 |
| `report <job> [--artifacts] [--dir <d>]` | artifacts from agent callbacks | 0 |
| `status` / `log <job>` | workspace table / timeline (renders `⚠ DISCREPANCY`) | 0 |
| `help` / `version` | usage / mercury + cmux versions | 0 |

All commands accept `--json` → envelope `{ok, error, command, timestamp, version, data}`; exit-code map 0–10 in `references/exit-codes.md`.

## Runtime identifiers (registry side: `.mercury/runtimes.toml`)

- `codex/<model>` → `codex --yolo --model <model>` (bare model name)
- `claude-code/<alias>` → `claude --dangerously-skip-permissions --model <alias>` (alias only, no version)
- `pi/<provider>/<model>` → `pi --model <provider>/<model>` (three-segment, strict slash form)
- `opencode/*` → ALWAYS rejected with pointer `pi --model opencode-go/<model>` (DRO — fires before identifier lookup, even for unknown models)

## Hard limits & rules

- 64-agent cap per processes.json (exit 5 beyond).
- Terminal detection: `agent.hook.Stop` with `payload.tool_name` null/empty = agent complete; non-empty = intermediate (ignored).
- `--track` = Hermes boomerang: stdout is the wake payload — plain text, no ANSI, ≤2000 chars; allowed outside Hermes with a warning.
- Hook pre-install check at dispatch: REFUSES if the pi opencode-go hooks extension is missing; WARNS for codex/claude-code (their lifecycle falls back to flagged pipe-pane).
- One listener per job (POP). Listener death → job LOST via dead-pid check.

## Cautions (battle-learned, v0.1)

1. cmux exits 0 with help text on unknown commands. Never infer success from exit 0 alone when shelling cmux yourself; Mercury's own `verbs.test.ts` greps live `cmux help` line-anchored for this reason.
2. Tests/scripts that live-dispatch MUST guarantee cleanup (cancel job + close `mj_<job>-*` workspaces in finally/afterEach). An unguarded spec loop once leaked 730 workspaces.
3. `cancel` cannot auto-close surfaces yet (`surface_number` persisted null — v0.2). After cancel, sweep `cmux workspace list` for `mj_<job>-*` and `cmux close-workspace` any survivors.
4. Run L2-style checks in a temp dir — never against a repo's live `.mercury/`.

## References

- `references/processes-schema.md` — processes.json fields, depends_on, fixtures
- `references/exit-codes.md` — full 0–10 map + envelope shape
- `references/lifecycle.md` — listener/daemon/fallback semantics, callback event kinds, DISCREPANCY rule
- Agent Wiki: `tools/MERCURY.md` (usage doc) · `standards/ORCHESTRATION.md` (the campaign standard Mercury serves)
