# Python App Server Monitor: Research Foundation

Date: 2026-08-09  
Scope: research only; no monitor source, configuration, hook, or runtime changes were made.  
Local CLI observed: `codex-cli 0.146.1` (`codex --version`).  
Requested future runtime: exact `gpt-5.6-luna`, medium reasoning. This report does not launch a future monitor or make a model call.

## Executive conclusion

A Python monitor backed by Codex App Server is technically plausible, but the evidence supports a narrow proof-of-visibility spike before any migration. The App Server protocol is the best candidate transport for a UI-friendly, streamed, persisted turn: OpenAI describes it as the first-class integration method for the full Codex harness, and the installed CLI exposes both a `proxy` path to a running local Unix-socket server and generated protocol schemas. The official protocol also exposes `thread/resume`, `turn/start`, `thread/read`, turn/item notifications, interruption, and a client identity field.

The central unresolved question is not whether Python can submit a turn. It is whether a turn submitted by a separately identified client to the Desktop-owned App Server is discovered, refreshed, and rendered by Codex Desktop as a visible continuation in the intended thread. Neither the official App Server README nor the installed schema promises that Desktop subscribes to or renders every externally-created turn. Therefore:

- `persisted` means the App Server accepted a request and a later `thread/read` or `thread/turns/list` can recover the turn.
- `delivered` means the client observed the corresponding accepted response and terminal notification.
- `desktop_visible` means direct UI evidence shows the turn in the intended Desktop conversation, with the expected text and attribution.
- `delivered` and `persisted` are not proof of `desktop_visible`.

Recommendation: build only a disposable Python proof client first. Connect to a separately started local App Server over the supported Unix-socket proxy, initialize with an explicit `clientInfo`, resume a known thread, submit one harmless marker turn with an explicit idempotency key, collect the full event stream, reconnect and read the persisted turn, then perform a manual Desktop visibility check. Do not replace the TypeScript/tmux monitor until that spike proves visibility and defines behavior for active-writer conflicts, duplicate delivery, restart, timeout, cancellation, and reconnect.

## Evidence categories and source policy

This report uses three labels.

| Label | Meaning |
|---|---|
| Documented guarantee | Stated in current official OpenAI Codex documentation or official OpenAI-owned Codex source documentation. It may still be experimental or version-sensitive. |
| Locally verified | Observed from `/Users/mcasa_atlantis/.codex`, the installed CLI, generated schemas, current source, or existing traces. It describes this machine/version only. |
| Hypothesis / open boundary | A reasoned design inference not established by the above evidence. It must be tested before adoption. |

Primary official sources:

- [OpenAI: Unlocking the Codex harness / App Server](https://openai.com/index/unlocking-the-codex-harness/)
- [Official Codex App Server README and protocol](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md)
- [Official Codex Python SDK API reference](https://github.com/openai/codex/blob/main/sdk/python/docs/api-reference.md)
- [Official Codex TypeScript SDK README](https://github.com/openai/codex/blob/main/sdk/typescript/README.md)
- [Official Codex App Server daemon README](https://github.com/openai/codex/blob/main/codex-rs/app-server-daemon/README.md)
- [Official Nx workspace guidance](https://nx.dev/docs/getting-started/tutorials/crafting-your-workspace)
- [Official Nx plugin registry](https://nx.dev/docs/plugin-registry)

Local sources inspected:

- [`SKILL.md`](/Users/mcasa_atlantis/.codex/skills/monitor/SKILL.md) and [`protocol.md`](/Users/mcasa_atlantis/.codex/skills/monitor/references/protocol.md)
- [`monitor-worker.mjs`](/Users/mcasa_atlantis/.codex/skills/monitor/scripts/monitor-worker.mjs) and [`monitor-core.mjs`](/Users/mcasa_atlantis/.codex/skills/monitor/scripts/monitor-core.mjs)
- Installed `codex app-server --help`, `codex app-server daemon --help`, `codex app-server proxy --help`, and `codex app-server generate-json-schema --help`
- Generated experimental protocol schema bundle from the installed CLI (`codex app-server generate-json-schema --experimental`), inspected in a temporary directory and not added to the repository
- Existing monitor state and JSONL traces under [`~/.codex/monitors`](/Users/mcasa_atlantis/.codex/monitors)
- Workspace [`README.md`](/Users/mcasa_atlantis/.codex/orchestration/README.md), [`nx.json`](/Users/mcasa_atlantis/.codex/orchestration/nx.json), and resolved `bun nx show project codex --json` / `codex-workflows --json`

## What App Server establishes

The official README says that App Server uses bidirectional JSON-RPC-shaped messages, omitting the `jsonrpc` header on the wire. Current documented transports are newline-delimited JSON over stdio, WebSocket frames, and Unix-socket connections that perform a standard HTTP Upgrade handshake. The README explicitly says the WebSocket listener is experimental/unsupported; the Unix socket is intended for local control-plane clients; and `codex app-server proxy` proxies a single raw stream connection to the running Unix socket through stdin/stdout. The installed help matches these options and also exposes `--listen off`.

OpenAI’s App Server article describes a long-lived process that hosts Codex core threads, with one request producing many server notifications and with server-initiated requests for approvals. It calls App Server the first-class integration method for a full, UI-friendly event stream, while describing the TypeScript SDK as a smaller, local library that spawns the Codex CLI.

The official App Server README documents these relevant primitives:

- `initialize` requires `clientInfo`; applications should identify themselves explicitly. `clientInfo.name` is used for Compliance Logs identification.
- `thread/start` creates a thread, emits `thread/started`, and auto-subscribes that connection to turn/item events for the thread.
- `thread/resume` reopens a stored thread by ID so later `turn/start` calls append to it.
- `thread/read` can include reconstructed persisted turns; `thread/turns/list` provides paginated history in the current protocol.
- `turn/start` submits a user turn and streams normal turn/item notifications.
- `turn/steer` has an `expectedTurnId` precondition for an active turn; it is not a general duplicate-safe enqueue operation.
- `turn/interrupt` exists in the installed schema/API surface for cancellation.
- `thread/unsubscribe` stops that connection’s turn/item subscription; the server may keep a loaded thread and later unload it after inactivity.
- `thread/status/changed` and `thread/closed` are useful lifecycle notifications.
- Bounded ingress queues can reject requests with `-32001` / `Server overloaded; retry later`; the official guidance is exponential backoff with jitter.
- `LOG_FORMAT=json` and `RUST_LOG` provide server-side observability knobs.

These are protocol capabilities, not guarantees about Desktop rendering. The README establishes that App Server powers rich clients such as the VS Code extension, but it does not say that an arbitrary initialized client can attach to the Desktop UI’s internal connection, nor that an externally started turn is automatically surfaced in Desktop.

## Python client options

### Option A: official Python SDK

The official Codex repository now contains an `openai_codex` Python SDK API reference. It documents sync and async clients, `thread_start`, `thread_resume`, `thread_read`, `thread_list`, `turn`, `run`, streamed turn control, interruption, `read(include_turns=True)`, typed protocol models, login/account helpers, and retry classification. It requires Python 3.10 or newer. The async API is the natural fit for a monitor because it can keep a turn/event stream and supervision loop alive without tmux.

Important limitation: the SDK reference documents a Python wrapper surface, but the inspected reference does not establish that its default client attaches to the Desktop-owned App Server. It is therefore unsafe to infer that `AsyncCodex()` means “use the already-running Desktop server.” The proof must inspect the released package’s transport/configuration surface and record whether it spawns a child App Server, connects to a socket, or offers an explicit endpoint override.

### Option B: direct JSON-RPC/App Server client

A small Python client using `asyncio` plus stdio or Unix-domain WebSocket framing has the strongest evidence path for this research because the installed schema is the executable contract. It can preserve raw request IDs, notification order, terminal events, reconnect state, and response payloads. It also avoids relying on an SDK feature that may lag the installed CLI.

The narrow client should implement only:

1. transport connect and protocol framing;
2. `initialize` with `clientInfo: {name, title, version}`;
3. `thread/resume` by exact thread ID;
4. `turn/start` with a unique `clientUserMessageId` and explicit model/effort where supported;
5. notification capture through `turn/completed` or `turn/failed`;
6. `thread/read` / `thread/turns/list` after reconnect;
7. `turn/interrupt` on cancellation;
8. durable monitor state and an idempotent wake ledger outside the conversation protocol.

This is a client binding, not a new persistence authority. The monitor’s durable event truth should remain its own append-only state/trace or the existing process control plane; the App Server thread and turn records are conversation truth, not acceptance truth.

## Attach versus independent server

The installed CLI gives two distinct deployment shapes:

| Shape | Evidence | Assessment |
|---|---|---|
| Spawn an independent server over stdio | `codex app-server` defaults to `stdio://`; official docs describe clients launching an App Server child and speaking JSONL | Documented and the safest first test, but not Desktop-owned. Desktop will not be assumed to discover it. |
| Connect to a running local server through Unix socket | `codex app-server proxy --sock PATH`; official README says the default socket is under `CODEX_HOME/app-server-control/` and is intended for local control-plane clients | Documented transport capability. It proves connection to a running server, not permission to join Desktop’s private client session or Desktop rendering behavior. |
| Connect to Desktop’s App Server | No inspected official source describes a public Desktop attach API, Desktop socket discovery contract, or external-turn rendering guarantee | Unproven. Treat as the key spike question. Do not scrape private Desktop state or claim success from socket connectivity alone. |
| Start a managed daemon | Official daemon README documents `start`, `restart`, `stop`, `version`, and remote-control lifecycle; local help confirms these commands | Useful for independent supervision and restart reconciliation. It is not evidence that Desktop owns or renders that daemon’s turns. |

The likely safe design is an explicitly supervised independent App Server or a documented local daemon, with a separate proof of whether Desktop happens to observe that server. If Desktop-owned attachment is required, the user must accept that this may be unsupported/experimental until direct proof and a stable public contract exist.

## Thread, turn, stream, and acknowledgement semantics

`thread/resume` is the durable continuation primitive: official docs say it reopens a stored thread and subsequent `turn/start` appends to it. The installed schema’s description adds that a running thread can be rejoined and that `thread_id` should be preferred. The Python SDK reference presents the same operation as `thread_resume`.

The protocol is not a queue with an exactly-once enqueue acknowledgement. A successful JSON-RPC response acknowledges request acceptance at the server boundary. The subsequent `turn/started`, item notifications, and `turn/completed` / `turn/failed` establish execution outcome for that connection. Persisted recovery is established separately by `thread/read` or `thread/turns/list` after reconnect. A client must not call a response acknowledgement “visible.”

The installed schema provides a `clientUserMessageId` on `turn/start` and `turn/steer`. This is a useful correlation/idempotency candidate, but no inspected official document promises that retrying the same ID is exactly-once or that the server deduplicates it. The monitor must maintain its own wake ID, payload hash, attempted-turn ID, and observed persisted turn identity. On retry after an ambiguous disconnect, read the thread first and search for the exact marker/id before submitting again.

Concurrent writers are a real local concern. Existing traces show `thread/resume failed ... already has an active writer (code -32600)` for the TypeScript monitor. A Python design must serialize wake attempts per thread, check thread status, and classify active-writer rejection as retryable/awaiting-settlement—not as proof that the wake was lost.

## Persistence and restart

Documented evidence supports persisted thread history and recovery after a client reconnect: OpenAI’s App Server article explicitly motivates reconnect/catch-up for ephemeral clients, and the README documents `thread/resume` and persisted turns. The installed schema further exposes paginated turn history and `useStateDbOnly` for list behavior.

What is not guaranteed by these sources:

- that an in-flight turn survives an App Server process crash exactly as an uninterrupted turn;
- that a client can resume an active turn after arbitrary transport loss without duplicate submission;
- that Desktop refreshes or rehydrates externally-created notifications after reconnect;
- that the local session store and Desktop’s UI projection have identical commit timing.

The monitor therefore needs two ledgers: (1) monitor event truth, where terminal condition and wake attempt state are atomically recorded; and (2) conversation observation, where server request/response/notification evidence is recorded with IDs and timestamps. Recovery should always be read-before-retry.

## Authentication, config, origin, and identity

The TypeScript SDK locally wraps the Codex CLI and inherits or explicitly replaces its environment, while passing configuration overrides. The Python API reference documents ChatGPT login, API-key login, account inspection, and logout. The App Server protocol exposes auth/config methods and uses the server’s configuration context. For a first spike, inherit the same `CODEX_HOME` and signed-in account context as the local CLI only through the normal process environment; never copy credentials into monitor state or the report.

Configuration must be explicit for the requested future run: model `gpt-5.6-luna`, reasoning effort `medium`, working directory, permission/sandbox policy, and `clientInfo`. The current local `/Users/mcasa_atlantis/.codex/config.toml` instead contains `gpt-5.6-sol` and high reasoning, so the report does not treat inherited config as satisfying the user’s requested policy.

Origin is not the same as client identity. The current monitor deliberately deletes `CODEX_INTERNAL_ORIGINATOR_OVERRIDE` so its TypeScript SDK invocation is tagged `codex_sdk_ts` instead of impersonating the Desktop App Server client. App Server’s documented `clientInfo` is the supported identity mechanism for a new integration and is intended for compliance-log identification. A Python client should use a stable name such as `codex_monitor_python_spike`, never impersonate Desktop, and record the exact name/version in its own evidence.

## Transport choice

Use Unix socket via `codex app-server proxy` for the visibility spike if a running local server is available and its socket path can be obtained without private Desktop scraping. It is local, documented, and avoids network auth and WebSocket’s explicitly unsupported status. If no suitable running server exists, use an independently spawned stdio App Server and clearly label the result as “independent server.”

Do not make WebSocket the migration foundation: the official README calls the listener experimental/unsupported even though the installed help accepts `ws://`. Do not invent a daemon protocol over a raw Unix socket; use the documented proxy framing or a library that reproduces the WebSocket upgrade correctly. Stdio remains appropriate for a child-owned App Server but provides no Desktop attachment semantics by itself.

## Supervision without tmux

Python can replace tmux as the process-survival mechanism only if it gains an independent supervisor boundary. The minimum is a user-level service or launch-agent/daemon contract that starts the monitor, persists its state before scheduling, restarts it after process death, and performs reconciliation on startup. The official App Server daemon is a possible server supervisor, not automatically a monitor supervisor.

For the monitor itself, use a small async state machine:

`armed -> waiting -> condition_met -> wake_pending -> turn_started -> turn_completed`

with explicit `timed_out`, `cancelled`, `failed`, `ambiguous_disconnect`, and `needs_visibility_recheck` states. Persist before side effects. On restart, load the monitor row, reconnect, read the thread, and resolve whether the marker turn already exists before submitting another turn. Use bounded deadlines and `turn/interrupt` for cancellation; do not equate a local timeout with server cancellation success.

## Current TypeScript/tmux comparison

| Concern | Current TypeScript SDK + tmux | Python App Server candidate |
|---|---|---|
| Thread resume | `Codex().resumeThread(id).run(wakeText)` | `thread/resume` then `turn/start`, or official Python `thread_resume`/`run` if transport is verified |
| Survival | Detached tmux pane with worker as primary process | user service/daemon plus persisted async state; no tmux if supervision is real |
| Streaming | SDK `run` buffers; `runStreamed` is available but current monitor uses `run` | native notification stream with explicit request IDs and reconnect logic |
| Persistence | monitor JSON state + JSONL trace; Codex session files | same monitor ledger + App Server thread persistence/readback |
| Desktop visibility | Existing wake is a new SDK client and intentionally not Desktop-originated | Potentially better only if Desktop observes the same App Server projection; currently unproven |
| Duplicate control | one wake per arm in monitor state; no server exactly-once guarantee | same wake ledger plus read-before-retry and `clientUserMessageId` correlation |
| Failure observed locally | active-writer conflicts; content policy failure; SDK/CLI failures | same classes plus socket/proxy framing, server restart, subscription loss, and visibility divergence |
| Operational cost | mature local strategy and existing traces | more faithful event semantics, but requires a new client, supervisor, and visibility proof |

The App Server candidate improves observability and potentially alignment with UI clients. It does not automatically improve reliability: the current traces demonstrate that same-thread serialization and failure evidence remain necessary.

## Recommended proof-of-visibility spike

The spike must be disposable and must not modify monitor files, hooks, config, or Desktop state.

### Preconditions

1. Record `codex --version`, the exact `CODEX_HOME`, Python version, and the installed App Server/Python package versions.
2. Use a dedicated disposable test thread or an explicitly approved existing test thread; do not write to the user’s active production conversation.
3. Use exact model `gpt-5.6-luna` and medium reasoning in the request, with provider fallback disabled if the protocol supports that field. If the installed model catalog rejects it, stop and record the failure.
4. Identify a supported independent server or a documented local Unix socket. Do not claim Desktop ownership from a process name or socket path.

### Concrete command shape

These commands are a research runbook, not executed by this report:

```bash
cd /Users/mcasa_atlantis/.codex/orchestration
codex --version
codex app-server --help
codex app-server proxy --help
codex app-server generate-json-schema --experimental --out /tmp/codex-app-server-schema

# Independent-server fallback, with raw JSONL over stdio:
codex app-server --listen stdio:// \
  -c 'model="gpt-5.6-luna"' \
  -c 'model_reasoning_effort="medium"'

# Running local server path, with a Python client on stdin/stdout:
codex app-server proxy --sock "$CODEX_HOME/app-server-control/app-server-control.sock" \
  < spike-requests.jsonl > spike-responses.jsonl
```

The Python client should send these protocol calls in order (IDs are examples):

```json
{"id":1,"method":"initialize","params":{"clientInfo":{"name":"codex_monitor_python_spike","title":"Codex monitor Python visibility spike","version":"0.1.0"}}}
{"id":2,"method":"thread/resume","params":{"threadId":"<KNOWN_TEST_THREAD_ID>","excludeTurns":true}}
{"id":3,"method":"turn/start","params":{"threadId":"<KNOWN_TEST_THREAD_ID>","clientUserMessageId":"monitor-spike-<UUID>","model":"gpt-5.6-luna","effort":"medium","input":[{"type":"text","text":"MONITOR_VISIBILITY_SPIKE <UUID>. Reply exactly: MONITOR_VISIBILITY_SPIKE_ACK <UUID>. Make no file changes."}]}}
```

The client must capture the accepted response, `thread/started`/`turn/started` if emitted, all item deltas/completions, `turn/completed` or `turn/failed`, timestamps, connection incarnation, and raw-safe error codes. After deliberately closing and reopening the transport, send:

```json
{"id":4,"method":"thread/read","params":{"threadId":"<KNOWN_TEST_THREAD_ID>","includeTurns":true}}
```

If history is paginated in the installed protocol, also test `thread/turns/list` using the generated schema. Do not reuse `clientUserMessageId` for a blind retry. Read the thread and only retry if the exact marker is absent and the monitor ledger has no accepted turn.

### Acceptance criteria

The spike passes only when all of the following are independently recorded:

- protocol initialize succeeds with the declared Python client identity;
- `thread/resume` succeeds against the intended test thread;
- the marker request is accepted and exactly one matching marker turn is found after completion and after reconnect;
- the persisted read contains the marker and expected response, with stable thread/turn IDs;
- a forced client disconnect and process restart recover the same turn without duplicate submission;
- a bounded cancellation test yields a terminal server outcome or a clearly classified ambiguous state;
- a second concurrent wake attempt is serialized or rejected with a classified active-writer result;
- a human directly observes the marker turn in Codex Desktop in the intended conversation, including the expected ordering, text, and client/thread attribution if Desktop exposes it;
- a Desktop refresh/reopen test still shows the turn;
- the monitor ledger distinguishes `persisted`, `delivered`, and `desktop_visible` with evidence references.

Failure of the last three criteria means “App Server turn works; Desktop visibility not proven,” not success.

## Failure taxonomy and observability

Every wake attempt should emit structured, redacted records with `monitor_id`, `thread_id`, `wake_id`, `client_user_message_id`, `transport`, `server_incarnation`, `request_id`, `turn_id` when known, event sequence, timestamps, and evidence paths.

| Class | Example | Required state/action |
|---|---|---|
| Condition | predicate timeout or invalid command | terminal monitor state; no turn unless policy says timeout wake |
| Transport | socket missing, upgrade failure, EOF, malformed frame | `ambiguous_disconnect` if request may have been accepted; reconnect/read before retry |
| Protocol | invalid params, method not found, active writer `-32600` | classify by code; active writer waits and rechecks; invalid request fails closed |
| Server | overloaded `-32001`, auth `401`, process restart | bounded retry for overload; operator/auth failure otherwise; record server incarnation |
| Turn | `turn/failed`, approval request unanswered, interrupted | terminal turn state distinct from monitor condition state |
| Persistence | `thread/read` cannot find marker after accepted/completed event | `persisted_unknown` and escalate; never claim exactly-once |
| Delivery | client got terminal event but process died before ledger flush | replay/reconcile from thread history |
| Visibility | persisted turn exists but Desktop does not show it | `delivered_not_visible`; do not migrate |
| Duplicate | two marker turns or same wake dispatched twice | invariant violation; stop and inspect before retrying |
| Policy | model unavailable or provider fallback changed model | fail closed; record catalog/request mismatch |

The key observability invariant is: `wake_completed` is never set solely from a successful local `turn/start` response. Use separate milestones: `request_accepted`, `turn_terminal_observed`, `persisted_reconciled`, `desktop_visibility_observed`.

## Nx and Python topology recommendation

Evidence supports Nx orchestrating Python projects and uv managing Python environments: current Nx documentation says Nx is language/framework agnostic, works with uv, and can discover non-JavaScript projects through `project.json`. The Nx plugin registry lists community `@nxlv/python`, but the installed workspace has no such plugin, no Python project, and no uv topology. The registry entry describes it as Poetry-oriented, so it is not evidence for a uv-native configuration.

Conditional topology after the spike only:

```text
apps/
  codex-monitor/
    project.json          # Nx targets wrapping uv run / pytest / ruff
    pyproject.toml        # uv-managed application dependencies
    src/codex_monitor/
packages/
  app-server/
    project.json          # protocol/client library targets
    pyproject.toml
    src/codex_app_server/
```

Do not add `@nxlv/python` merely because it is named in the proposal. First verify its current compatibility with Nx 23 and uv, then decide whether its generators/executors add value over explicit `project.json` plus `nx:run-commands`. The narrowest evidence-backed first implementation would likely use explicit Nx targets and uv, with `packages/app-server` only if the protocol client is reusable outside the monitor. A single `apps/codex-monitor` project is preferable until a second consumer exists.

## Decision

Proceed to the proof-of-visibility spike only. Do not migrate the monitor yet. The App Server protocol and Python surface are promising and better aligned with rich event rendering than the current SDK/tmux boomerang, but Desktop-owned attachment and external-turn visibility remain hypotheses. Keep the existing TypeScript/tmux monitor as the operational baseline, including its durable state and trace conventions, until the spike passes the exact visibility, restart, idempotency, and failure criteria above.

MONITOR_PYTHON_APP_SERVER_RESEARCH_COMPLETE
