# CAS-11.R2 Goal Charter — Nx and Canonical Codex Plugin

**Model:** `gpt-5.6-sol`, medium reasoning  
**Role:** Base repair owner for `plugins/codex-control/`  
**Terminal:** `CODEX_PLUGIN_READY`, `READY-FOR-AUDIT`, or exact dependency halt

## Objective

Ship `.codex/plugins/codex-control/` as both a proper Nx plugin project and the canonical installable Codex plugin. Preserve the accepted control/UI behavior, consume CAS-09.R2 production runtime, and package the Codex workflow that performs one control-tool call followed by one in-app Browser call.

## Nx contract

- Add the workspace-aligned `@nx/plugin` dependency through the coordinator-owned root.
- Reconcile the existing project against real `@nx/plugin:plugin` output rather than copying a throwaway tree wholesale.
- Expose exactly one earned idempotent `init` generator through `generators.json`; it adds or updates the repo-scoped `.agents/plugins/marketplace.json` entry and required project-local wiring only.
- The generator never modifies a home marketplace, credentials, running services, external accounts, or Git state.
- Build, lint, typecheck, generator unit tests, plugin JSON lint, and a temporary-workspace generator E2E run through Nx. A second generator run produces zero delta.

## Codex plugin contract

- `.codex-plugin/plugin.json` is valid, stable, and declares `skills` plus `mcpServers` with plugin-root-relative paths.
- `.mcp.json` reaches the accepted production Codex Control runtime without ChatGPT registration or Secure MCP Tunnel.
- `skills/codex-control/SKILL.md` translates delegation/workflow intent into the appropriate Codex Control tool, validates the stable handle/presentation, then invokes `browser:control-in-app-browser` with the returned loopback URL and preserves the user-facing tab.
- Missing Browser returns the truthful URL and status without claiming a tab opened. Retries with the same handle do not open duplicates.
- MCP Apps/ChatGPT files may remain optional compatibility assets but are not required for install, discovery, or `CODEX_PLUGIN_READY`.

## Acceptance and stop

Meaningful RED must cover missing Nx generator/package shape, marketplace, skill, and Codex discovery. Freeze before GREEN. Validate with the official plugin validator, Nx gates, generator E2E/idempotency, repo marketplace install, and a fresh Codex task that discovers the skill and MCP tools. Stop at `CODEX_PLUGIN_READY` / `READY-FOR-AUDIT`; do not begin CAS-12.R1, audits, commits, publishing, or ChatGPT connection work.
