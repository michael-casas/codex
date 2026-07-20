---
name: mark-cli
description: 'Use the `mark` CLI to find, track, and clear MARK: annotations across a codebase. Agents use MARK:REFACTOR, MARK:TODO, MARK:AUDIT, MARK:FLAG, MARK:HACK tags to self-document work items directly in code. The CLI indexes them with stable project-scoped IDs (e.g. AM-A01), supports scoped scans (--dir), and can clear annotations post-completion.'
---

# mark CLI — In-Code Annotation System

The `mark` CLI scans source files for `MARK:<TAG>` comment annotations, assigns stable IDs, and lets agents find, inspect, and clear them. Installed at `~/.local/bin/mark`.

## When to use

- You want to leave a note in code for yourself or another agent: `// MARK:REFACTOR — extract this helper`
- You need to find all pending refactors, TODOs, FLAGs, or audits across a workspace
- DSV4 recon swarm just finished — `mark find FLAG --json` surfaces all suspicious findings for the Wave Judge
- You want to track work items inline in source files rather than in an external issue tracker
- You need to clean up annotations after the work is done

## Commands

```
mark list                          # All MARK tag types with counts + IDs
mark find <TAG>                    # Find MARK:<TAG> with full context + ID
mark scan [--json] [--dir <path>]  # Full index (or scoped to a subdirectory)
mark clear <ID>                    # Remove a MARK: annotation by its stable ID
```

## Output format

```
  → // MARK:REFACTOR — extract this to packages/core  (ID: AM-A01 - apps/market/src/providers.tsx:3)
```

ID in red, file:line in parentheses at the end. JSON mode produces structured output for agent consumption.

## ID system

IDs are deterministic and stable: `<ProjectPrefix>-<DirLetter><NN>`

| Component | Rule | Example |
|-----------|------|---------|
| Project prefix | First 2 words of dirname, uppercase initials | `arcana-market` → `AM`, `lead-gen` → `LG` |
| Dir letter | Maps root directory to a letter code | `apps/` → `A`, `packages/` → `P`, `.agent/` → `AG` |
| Sequential # | Alphabetical by file path within dir group | `01`, `02`, etc |

IDs are persisted in `.mark/cache.json` at the project root so they survive rescanning.

## Comment syntax supported

| Syntax | Languages |
|--------|-----------|
| `// MARK:TAG` | JS, TS, Go, Rust, C, Swift, Java |
| `# MARK:TAG` | Python, Ruby, Shell, YAML, Make |
| `-- MARK:TAG` | SQL, Lua, Ada |
| `/* MARK:TAG */` | JS, TS, CSS, C, Java |
| `<!-- MARK:TAG -->` | HTML, XML, MDX |
| `% MARK:TAG` | TeX, MATLAB |
| `; MARK:TAG` | Lisp, Assembly |
| `' MARK:TAG` | Visual Basic, VBA |

Everything after `MARK:<TAG>` is captured as the description — dash or no dash.

## Usage patterns for agents

**Leaving a MARK:** Write `// MARK:REFACTOR — <description>` in the source file near the code that needs work. Use the comment syntax appropriate for the file's language.

**Finding work:** Agents should always run `mark find <TAG>` at the start of a task to check for pre-existing annotations in the relevant area:
```
mark find REFACTOR --dir packages/core/
mark find TODO
```

**DSV4 swarm FLAG workflow:** After a recon swarm, run `mark find FLAG --json` to collect all suspicious findings with their IDs, file paths, and descriptions. The Wave Judge reads the JSON, triages by severity, and dispatches AUDIT/REFACTOR charters to the appropriate lanes.

**Clearing after completion:** After completing a refactor/audit/todo, remove the annotation:
```
mark clear AM-A01
```
This rips the exact line from the source file and updates the cache.

**JSON for programmatic use:**
```
mark scan --json
```
Returns structured data: project prefix, count, per-annotation file/line/tag/description/raw/mark_id/context.

## Cache

The ID-to-annotation mapping lives in `.mark/cache.json` relative to the project root. This file is auto-managed by `mark scan` — do not edit manually. Deleting it forces a fresh scan with new IDs.

## Reference files

| File | Contents |
|------|----------|
| `references/json-output-schema.md` | Full JSON schema with example and agent usage sample |

## Non-goals

- Not a replacement for git issue trackers or TODO-as-code frameworks
- Not a build-time enforcement tool (no CI gates around MARK annotations)
- Not a TUI or IDE extension — CLI only, JSON-ready for agent consumption
