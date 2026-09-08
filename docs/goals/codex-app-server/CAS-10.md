# CAS-10 Goal Charter — Svelte Visibility Plane and Web Acceptance

**Model:** `gpt-5.6-sol`, medium reasoning  
**Role:** Base owner for the rendered control visibility plane  
**State:** allocated; non-dispatchable until CAS-09 `MCP_READY`  
**Lease:** `CAS-10-SVELTE-VISIBILITY`  
**Terminal:** `UI_READY`, `READY-FOR-AUDIT`, or an exact dependency halt

## Objective

Complete the Svelte visibility plane inside `apps/codex-control-ui`: workflow/phase progress, agent disclosures, one selected-agent feed, decisions, and artifacts driven only by accepted CAS-09 MCP snapshot/wait tools. Prove rendered behavior through the Web BATDD lane without giving the iframe App Server, credential, or durable-state authority.

The accepted bundle also owns responsive direct `/workflows/:id` and `/agents/:id` routes plus one presentation descriptor. One accepted `AgentHandle` or `RunHandle` must resolve to a local Codex in-app Browser route, the same bundle's later MCP Apps UI resource identity, and one model-readable authenticated read-only mobile HTTPS link when configured. CAS-10 defines and renders this contract but does not deploy or configure a tunnel.

## Required context

Read repository authority, BATDD profile/contract, the CAS-10 assignment, accepted CAS-09 packet, current official MCP Apps UI guidance, and the existing Svelte scaffold. Invoke `seam`, `batdd`, `nx-monorepo`, `openai-docs`, `impeccable`, and full `ponytail:ponytail` before product writes. Use official OpenAI UI guidelines/design-system compatibility while retaining Svelte; do not add React merely to consume a design library.

## Dependency gate

No product write or worker launch until CAS-09 `MCP_READY` is verified in shared `a4a6` and a schema-valid dispatchable CAS-10 assignment is published. CAS-00 `AUTHORITY_READY` and the Web-required profile remain immutable authority.

## Authorized write surface

- `apps/codex-control-ui/**`
- `apps/codex-control-e2e/features/cas-10/**`
- `apps/codex-control-e2e/src/cas-10/**`
- `packages/testing/evidence/cas-10-*.json`
- `.agent/testing/cas-10/**`

Root package/lock/Nx/TypeScript composition and shared E2E configuration require a coordinator amendment. MCP handlers, daemon/process state, plugin packaging, credentials, and CAS-12 scenarios are read-only.

## Green Contract floor

- Typed snapshot/events enter; selection, disclosure, refresh, and bounded waits leave. Provider JSON-RPC types and credentials never enter components.
- One mounted summary wait; at most one selected-agent detail wait. Switch/collapse cancels renewal and rejects late results from the prior generation.
- Render all-agent compact summaries but transfer details only for the selected agent. Final items are authoritative; deltas remain coalesced advisory UI state.
- Use native disclosure, keyboard/focus semantics, bounded `aria-live`, reduced motion, responsive layout, contrast, and loading/error/empty/reconnect states.
- Preserve the Apps SDK/MCP Apps open `ui/*` bridge contract. `window.openai` is permitted only for an explicitly required ChatGPT-only extension.
- The local Browser and MCP Apps iframe connect only to the local control/visibility gateway; neither may connect directly to a remote App Server WSS endpoint.
- The presentation descriptor and every route/link omit App Server URLs, bearer tokens, database credentials, host credentials, tunnel credentials, raw paths, and other secret-bearing query or fragment data.
- Mobile presentation is read-only in Base. Its canonical private ingress is Tailscale Serve; Cloudflare Tunnel is invalid unless paired with Cloudflare Access. CAS-10 records capability/absence truthfully and never deploys either ingress.
- Local, MCP Apps, and mobile presentations reuse one Svelte component/bundle contract rather than divergent UI implementations.
- Follow official UI/design-system conventions for typography, spacing, color, focus, and tokens without importing framework overhead the Svelte app does not need.
- Measure the existing performance budget; retain windowing/virtualization as a measured upgrade only beyond the frozen row/latency threshold.
- Physical Gherkin is the canonical scenario source and lowers to native Playwright. API/database assertions cannot certify rendering or interaction.
- L1 covers pure state/filter/generation logic where earned. Web L2/L3 covers count updates, select/switch/collapse, no non-selected transfer, reconnect, accessibility, empty/error, desktop/mobile viewport, and performance.
- Live Synology remains read-only; UI actions may not expand remote mutation authority.

## Task budget

One summary-wait operation and at most one selected-agent-wait operation are active at a time. The UI must not list-then-get-then-subscribe or connect every agent feed.

## Stop and handoff

Stop at `UI_READY` / `READY-FOR-AUDIT`, or `HALT` with exact missing MCP/Web capability and resume condition. Do not begin CAS-11+, audit, QA, Final Polish, commit, push, or live remote mutation.
