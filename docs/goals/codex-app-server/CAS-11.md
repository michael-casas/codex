# CAS-11 Goal Charter — ChatGPT Plugin and MCP Apps Packaging

> **Superseded as a Base gate on 2026-09-03.** Preserve this packet as optional MCP Apps compatibility evidence. Canonical Codex plugin completion is owned by `CAS-11-R2-NX-CODEX-PLUGIN.md`.

**Model:** `gpt-5.6-sol`, medium reasoning  
**Role:** Base owner for installable ChatGPT plugin packaging  
**State:** allocated; non-dispatchable until CAS-09 `MCP_READY` and CAS-10 `UI_READY`  
**Lease:** `CAS-11-PLUGIN-PACKAGING`  
**Terminal:** `PLUGIN_READY`, `READY-FOR-AUDIT`, or an exact dependency halt

## Objective

Package the accepted CAS-09 MCP tools and CAS-10 Svelte bundle as an installable `codex-control` ChatGPT plugin using a versioned MCP Apps UI resource, strict CSP, standards-first bridge, and useful model-readable fallbacks.

Package the exact accepted CAS-10 bundle rather than a fork. The plugin's presentation descriptor must preserve the local route and expose one truthful model-readable authenticated read-only mobile HTTPS link when configured. Tailscale Serve is the canonical private mobile ingress. Cloudflare Tunnel is valid only with Cloudflare Access. CAS-11 packages and reports this contract but does not deploy a tunnel, publish publicly, or mint infrastructure credentials.

## Required context

Read repository authority, BATDD profile/contract, CAS-11 assignment, accepted CAS-09/CAS-10 packets, and current official plugin architecture, MCP Apps UI, UI guidelines, connection/testing, and Secure MCP Tunnel documentation. Invoke `seam`, `batdd`, `nx-monorepo`, `openai-docs`, `plugin-creator`, and full `ponytail:ponytail` before writes.

## Dependency gate

Remain non-dispatchable until both CAS-09 `MCP_READY` and CAS-10 `UI_READY` are verified in shared `a4a6`. Do not package placeholder handlers, a fake widget, or an unaccepted UI bundle.

The worker must run as one same-directory task whose `pwd` is exactly `/Users/mcasa_atlantis/.codex/worktrees/a4a6/.codex`. It owns the sole `CAS-11-PLUGIN-PACKAGING` lease, must not launch descendants or replacement tasks, and must route any root marketplace/lock/composition requirement to coordinator `01a05dd0-05d5-7a33-b3fa-66adf9e41d8c` rather than requesting interactive approval or widening its surface.

## Authorized write surface

- `plugins/codex-control/**`
- `apps/codex-control-e2e/features/cas-11/**`
- `apps/codex-control-e2e/src/cas-11/**`
- `packages/testing/evidence/cas-11-*.json`
- `.agent/testing/cas-11/**`

CAS-09 MCP application and CAS-10 UI are read-only inputs. Root marketplace/plugin registration, lockfile, or app composition requires a coordinator amendment. External tunnel/account state is verification infrastructure, never repository truth.

## Green Contract floor

- Publish a versioned `ui://codex-control/<version>.html` resource with the required MCP Apps MIME/profile, `_meta.ui.resourceUri`, and narrow CSP.
- Use the open `ui/*` JSON-RPC bridge over `postMessage` for initialization, notifications, tool calls, model-visible context, and messages. Do not invent a WebSocket from the iframe to App Server.
- `window.openai` is optional compatibility for an explicitly required ChatGPT-only feature, not the primary bridge.
- URI/version changes when the component contract breaks; cached old resources must not impersonate the new UI.
- Tools remain useful without UI and return bounded structured/text fallbacks. Hidden metadata is never authorization.
- Package only accepted artifacts and connection metadata; no raw credential, host path, tunnel token, environment, prompt, or reasoning enters the plugin.
- Follow official Apps SDK/UI design and accessibility compatibility without forcing a React runtime into the packaged Svelte component.
- Prove that local and MCP Apps presentations consume the same accepted Svelte bundle/component contract and resolve the same handle identity.
- A mobile link fallback is emitted only when authenticated ingress is configured and authorized; otherwise return a truthful unavailable/disabled state rather than a guessed URL.
- URLs contain no App Server, bearer, database, host, tunnel, prompt, environment, or reasoning credential/data. The iframe and browser remain local-gateway clients and never connect to remote App Server WSS.
- Tailscale Serve is the canonical private ingress. Cloudflare Tunnel configuration without Cloudflare Access fails closed. No public publishing or tunnel deployment is owned by CAS-11.
- L2 proves manifest/resource schema, MIME/CSP, one render, tool calls, fallback, cancellation, and reconnect through the official testing surface.
- Representative CAS-11 L3 runs through a real isolated Codex plugin marketplace/install, the packaged stdio MCP server, and a native Playwright MCP Apps host interaction. It must exercise the packaged resource, bridge, fallback, cancellation/reconnect, and selected-feed behavior without substituting an in-process component or simulated iframe for the plugin boundary.
- A real ChatGPT developer-mode registration/connection is an explicit external CAS-12 dogfood obligation. CAS-11 must preserve the exact installable artifact and connection facts needed for that later boundary, but must not claim that isolated Codex/Playwright evidence is ChatGPT.
- Live Synology remains read-only; plugin tools cannot broaden its permissions.

## Task budget

One `render_control_plane` call returns the versioned UI resource plus compact model-readable fallback. Rendering must not require list/get/create/start choreography.

## Stop and handoff

Stop at `PLUGIN_READY` / `READY-FOR-AUDIT`, or `HALT` with the missing local packaging/isolated-host fact and exact resume condition. Real ChatGPT developer-mode connection remains CAS-12 external dogfood and does not block CAS-11 when the installable artifact and local plugin boundary are proven faithfully. Do not begin CAS-12+, audit, QA, Final Polish, publication, commit, push, or remote mutation.
