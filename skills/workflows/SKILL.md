---
name: workflows
description: Route Codex Workflows tasks in the orchestration workspace, including authoring and directly running trusted executable TypeScript workflows, using defineWorkflow/phase/parallel/agent/artifact, inspecting without agent launch, interpreting local journals and exits, retaining JSON validate/inspect/plan/dry-run/import compatibility, and preserving the separate unavailable durable-control boundary. Use whenever a user mentions codex-workflows, workflow.ts, workflow schemas or plans, the Codex SDK singleton boundary, workflow journals/artifacts, or .pi workflow compatibility.
---

# Workflows

Use the shipped direct TypeScript interpreter/runner and retained JSON compiler
surfaces. Never invent a daemon, database, reducer, queue, retry engine,
monitor, or tmux path to make cross-process durable commands appear available.

## Route the request

1. Read [CLI and exits](references/cli.md) for invocation, source admission,
   trusted-code boundaries, journals, output, and deterministic exits.
2. Read [Authoring, schema, and APIs](references/schema.md) before writing or
   reviewing TypeScript/JSON workflows or package integrations.
3. Read [Tested examples](references/examples.md) before executing or
   presenting a command example.

Work from `${CODEX_HOME:-$HOME/.codex}`. Use `bun nx` for build,
test, lint, typecheck, and CLI targets. Preserve `.pi` as read-only. Running or
inspecting a TypeScript workflow imports trusted local code; only use sources
the user trusts.

For trusted `.ts`, bare execution and `run` execute locally. For JSON `run` and
run-ID `resume`, `status`, `events`, `logs`, or `cancel`, retain the shipped
exit-69 `CONTROL_PLANE_UNAVAILABLE` boundary. A local journal is operational
state, not cross-process durability or acceptance.

For real dogfood and backend-facing `codex-workflows` tests, use a bounded,
non-whitespace `gpt-*` model token with `medium` reasoning. The runtime forwards
the exact tag to the Codex SDK; never substitute a different model silently.
