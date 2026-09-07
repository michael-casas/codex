# CAS-12.R1 Goal Charter — Codex Desktop Integrated Dogfood

**Model:** `gpt-5.6-sol`, medium reasoning  
**Role:** Base integration owner for the canonical Codex experience  
**Terminal:** `BASE_READY`, `READY-FOR-AUDIT`, or exact dependency halt

## Objective

Prove from a fresh Codex desktop task that Codex Control launches local or remote Codex agents and workflows through the accepted App Server backend, then performs the next `browser:control-in-app-browser` call to open the live Svelte control view beside the orchestrator. The user can expand workflow steps, select one agent, and inspect only that agent's detailed feed while every agent remains visible in summary.

## Entry gate

Founder addition: dogfood stays on HOLD until CAS-RP-01 reaches
AGENT_RUNTIME_PROFILE_READY and CAS-WA-01 reaches WORKFLOW_AUTHORING_READY,
with exact evidence verified and installed desktop capabilities refreshed.
Test the one-file/one-submit authoring path and explicit model/effort propagation,
not manual workflow registration or an alternative SDK runner. Local daemon and
authenticated Tailscale presentation must be admitted before the user demo.

Require exact accepted CAS-02/CAS-04/CAS-05/CAS-06/CAS-07/CAS-08/CAS-09.R2/CAS-10/CAS-11.R2 packets. The Codex plugin must be installed from the repo marketplace in a fresh task. ChatGPT website, Work, Developer Mode, registered apps, and Secure MCP Tunnel are excluded and cannot satisfy this charter.

## Canonical scenarios

- One local read-only delegation returns one `AgentHandle` and opens one Browser view.
- One authorized read-only remote delegation uses App Server transport and appears in the same UI without exposing remote WSS or credentials.
- One two-phase workflow renders N/X agent progress; the dependent phase remains not started until its predecessor completes.
- Expanding/selecting an agent transfers only its detail; switching/collapsing aborts the prior wait and rejects late results.
- Retry/reconnect/restart returns the same handle/view identity without duplicate agent, workflow, message, completion, or Browser tab.
- Missing Browser, daemon, plugin, authorization, or remote host fails truthfully with cleanup and no false `BASE_READY`.

## Evidence and stop

Capture exact revision, plugin/package/generator/marketplace identities, fresh Codex task and MCP tool traces, Browser URL/tab interaction evidence, App Server host/version identities, PostgreSQL/pg-boss inventory, selected/executed L1/L2/L3 counts, and before/after resource delta. `BASE_READY` is implementation completion, not audit acceptance. Stop without CAS-13, audit, commit, merge, push, publication, or deployment.
