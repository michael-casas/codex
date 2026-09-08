# Transport — Features

**Status:** Implemented candidate; not independent acceptance
**Domain authority:** [DOMAINS.md — Transport](../../../DOMAINS.md#9-transport)
**Package:** `packages/transport`
**Boundary:** Admitted App Server host and repository configuration → bounded
local or remote App Server connections and workspace leases.

## Current contract

| Surface | Behavior |
| --- | --- |
| Host registry | Registers, reads, disables, health-checks, restarts, and connects version/capability-checked hosts. |
| Local transport | Manages a local App Server daemon and bridges its Unix WebSocket endpoint to the client's stdio JSON-RPC stream. |
| Remote transport | Connects only to authenticated `wss:` endpoints, with bearer credentials resolved by reference and optional pinned CA material. |
| Connection safety | Bounds messages and reconnect attempts, restores idempotent subscriptions, and classifies ambiguous connection loss without inventing retry authority. |
| Workspace lease | Resolves admitted repositories and owns bounded workspace/worktree acquisition and release. |

Desktop SSH connectivity is outside this contract. It is not a fallback for
remote App Server transport, and the package contains no tmux transport path.
The package also does not own orchestration state, delivery timing, retries,
model policy, or acceptance.
