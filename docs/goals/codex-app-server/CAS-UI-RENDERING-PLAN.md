# Codex Control: readable activity and current-work view

Status: **planning_complete — Founder decision required before implementation.**

## Recommendation

Keep Svelte, the existing OpenAI-aligned styling, HTTP snapshot/wait delivery and App Server backend. Replace the event-row presentation with a **bounded, stable message/item view**. First preserve the information that view needs upstream; a frontend-only grouping patch cannot reconstruct lost turn identity, clipped final content or validated-result provenance.

This is one coherent UI remediation plan, not authorization for new agents, auditors, services, a framework, or a workflow relaunch. The coordinator owns the halted dogfood and runtime. The application is open beside this task in the in-app Browser for feedback.

## Evidence and the three different meanings of JSON

The [machine-readable shape catalog](../../../.agent/testing/cas-ui-r1/discovery/shape-catalog.json) and [provider catalog](../../../.agent/testing/cas-ui-r1/discovery/provider-catalog.md) bind this recommendation to current repository sources and pinned App Server0.151.0. Current [official event documentation](https://learn.chatgpt.com/docs/app-server#events) distinguishes item completion from turn completion; generated types govern exact admitted fields.

1. **Protocol JSON:** a notification or RPC response containing method/params or result/error. It is transport data, not an agent message.
2. **Visibility JSON:** our safe summary/detail response containing cursor, workflows and selected-agent events. The browser receives this directly over HTTP. The separate MCP text-summary cap is not the cause of this browser's chopped feed.
3. **JSON inside message text:** the demo explicitly requests `outputSchema`. Its builder result has `siteId`, `directory`, `title`, `theme`, `port`, `status: ready|blocked`, and `notes`. A delta can contain only part of that JSON. The workflow parses and validates the full final response later. The generated site's `status` is not agent/workflow status, and its `title` is not the workflow title.

Actual in-app inspection of run03/Builder4 found100 rows and100 timestamps, one empty body, a feed8619px tall, and horizontal overflow429px versus414px client width. The cancelled workflow and four cancelled cards remained visible. The heading signature overflow is visible in the viewport screenshot. Two complete builder-shaped objects were present, but their bodies differed: do **not** deduplicate messages by text equality. See [sanitized browser observations](../../../.agent/testing/cas-ui-r1/discovery/browser-observations.json). No message values, raw rollouts, credentials or private reasoning were exported.

## Catalog → presentation

| Observed shape | Recommended presentation | Reconciliation rule |
| --- | --- | --- |
| Agent text delta | Incrementally updated text/Markdown message | Append once to the existing owner/turn/item; never create a token row |
| Completed agent message | Same message, finalized | Replace its accumulated content with authoritative final content; no second assembled-message row |
| Schema-bound final result | Compact labeled fields after successful validation and safe projection | Upgrade the same bound final item; never parse arbitrary partial JSON or promote result fields into execution status |
| Tool start/completion | One compact tool lifecycle row | Update typed tool state; optional bounded detail disclosure |
| Agent-owned command output | Bounded monospace output inside that tool's disclosure | Append to the command item, not the top-level timeline |
| Typed runtime/tool error | Readable error notice or item error state | Preserve safe code/context; keep execution, connection and cessation meanings separate |
| Unsupported public kind | Restrained generic notice only when useful | Do not dump an unknown envelope; no invented ownership |
| Private reasoning/prompts/raw tool arguments/media | No renderer | Remain excluded, including from unsupported fallback |

Standalone `command/exec/outputDelta` is process-scoped/base64 output, not `item/commandExecution/outputDelta`. It must not be assigned to an agent by guesswork. Plans and other unsupported public kinds remain outside the initial positive allowlist unless Founder requests them.

For schema-bound final text, prefer a small **Preparing result…** state while classified final output is incomplete, then the validated field view. Ordinary commentary remains readable text. If message phase is unknown, keep that uncertainty; do not infer finality from a leading brace. A bounded escaped preview can be a secondary disclosure, not the default presentation. Unknown/unvalidated complete text remains escaped text rather than an invented typed result.

## Why the data path must change first

The current mapper takes a4093-byte prefix without recording that it clipped the content. Normalization measures the already-clipped text, so `truncated:false` cannot prove completeness. Workflow source replay additionally drops original-length/truncation fields. The store retains100 **detail events**, so those100 rows may be only a suffix of one message. Rendering cannot recover missing bytes.

The workflow callback supplies thread/turn, but normalization removes them. The mapper drops message phase and other item metadata; the direct-handoff adapter also drops item type. The frontend type omits `kind`/`itemId`, although those fields still survive in the actual HTTP JSON. This latter omission is locally repairable; the upstream losses are not.

The full schema-validated node output is not a typed visible result today: `node.completed` carries a digest, and the visibility reader omits schema/result provenance. A final response may also be recovered by the executor without emitting a corresponding visible final item. The new contract must carry the **bound final item identity**, not attach a result to whichever row happens to be last.

### Minimal contract direction

- Preserve event identity for idempotency **separately** from stable `(run/delegation, agent, host/thread/turn/item)` ownership. Keep existing run-scoped agent IDs. Reject mismatched-turn events before attribution.
- Preserve existing event `kind` as append/start/final-replacement semantics, plus item type, nullable **messagePhase** (distinct from workflow phase), monotonic durable sequence/revision and truthful completeness metadata.
- Preserve a safe validated-result descriptor tied to the final item and requested schema identity. Reuse existing `outputSchema` validation; do not add a second validator or a renderer registry driven by arbitrary payload text. Positive field projection and privacy rules still apply after schema validation.
- Reuse the existing visibility persistence owner to expose bounded logical-item snapshots and updates. If a durable latest-item projection is needed to survive100-chunk pruning, add it as a derived read model in the same module/transaction—not a new event authority, broker, queue or service.
- Keep current finite transport and chunk limits distinct from logical-message retention. Proposed decision defaults:64KiB per displayed item,100 retained logical items and2MiB aggregate selected-feed text, with explicit omission indicators. These are proposed caps, not measured guarantees; freeze them only after Founder approval and native validation. Preserve existing4096-byte chunk contracts rather than silently enlarging old test expectations.
- New clients consume typed items/revisions, not truncated MCP summary text. Legacy records with missing identity or bytes must be labeled incomplete; no automatic provider-history scraping or guessed reconstruction.

Redaction precedes persistence and display, with explicit checks for chunk-boundary splits and reassembled content. Do not claim generic regex redaction is complete secret detection. Raw tool output, command paths, citations and media are not restored merely because richer provider fields exist.

## Item reconciliation and component boundaries

Normalize/fold before presentation. Exact event/revision replay is a no-op; append applies once in durable order; a completed item replaces its partial body; old deltas cannot append after a newer finalized item. Different turns/runs never merge even when item strings or text match. Reconnect starts from bounded logical-item snapshots and a cursor; gaps and retention omissions remain explicit.

Use app-local Svelte components for the actual distinct shapes: feed panel/scroll ownership, text message, structured result, tool activity, and reusable notice. Keep presentational components prop-driven; keep subscription, item merging and active-view policy in explicit typed modules. Reuse native lists, definition lists, buttons and details elements. No new packages/ui scaffold is needed for one current consumer; future shared use can justify extraction. New modules follow File System/Clean Code locality and explicit facades, not inherited structural debt.

No Markdown renderer is declared in the current UI package. If none is already available through a supported dependency, admit one small maintained parser with raw HTML disabled and a safe URL policy. Do not write a custom Markdown parser, execute embedded HTML, auto-load arbitrary remote images, or add an animation framework. Structured-result links require authorized resource references; a port or filesystem path is not automatically a clickable URL.

## Bounded scrolling and motion

The panel header and close control stay outside an internally scrolling message region. Desktop height is constrained by available viewport height; mobile uses an appropriate bounded panel rather than an indefinitely growing document. Grid/flex children need shrinkable dimensions; ordinary text wraps, while code can scroll internally without widening the panel. Preserve current tokens, typography, borders and dark/light behavior.

Follow the bottom only when the reader is already near it. Otherwise preserve the visible item/offset anchor and show a new-content/jump-to-latest affordance. Reconnect, wrapping, final replacement and retention pruning must not unexpectedly pull the reader to the end. If an anchored item is evicted, show the omission and retain the nearest surviving anchor. Keyboard scrolling, focus-visible controls and sensible screen-reader announcements are required; do not announce every token.

Apply the preferred left-to-right opacity reveal **only to newly appended text runs**, with wrapping and `prefers-reduced-motion`. Batch updates; no per-character reactive state or DOM nodes, no reanimation of prior text on final reconciliation. Prefer CSS/native animation over a framework. Exact wrapped-line reveal is a native-browser proof obligation, not a claim that a single mask automatically handles every line. If precise per-line treatment needs measurement, batch only visible-line geometry on layout changes; agree a simpler fade fallback if that cost is not justified. Data correctness and scrolling come before motion polish.

## Authoritative cancellation and active view

On trusted terminal workflow cancellation, hide that run from the current-work view, abort/reset its selected-detail wait and scroll/message state, and reconcile its direct route to the active view. Keep other active runs intact. Preserve durable history and artifacts; do not create an evidence-deletion path or a new history application as part of this fix.

Cancel-request ACK, disconnect, timeout, generated-result `status`, and unknown cessation are **not** triggers. Use durable revision/terminal knowledge plus request-generation rejection so late or replayed older running events cannot resurrect a cancelled card/feed. Already-confirmed cancellation remains hidden if the connection drops afterward.

Show the exact empty heading **No Workflows Running** only when the active-view scope is known complete and empty. On unknown initial/offline or truncated data, show connection/completeness uncertainty instead. An empty filtered subset of the current500-summary page is not proof that no other work exists: active-scope querying/pagination and completeness must be explicit. Existing completed/failed history policy needs one Founder confirmation; recommendation is to keep it out of the default current-work list without implying confirmed process cessation.

## Human workflow title

There is no workflow `title` field today. The existing definition already owns `id`, version and description; node label/phase are separate. The source compiler currently validates the loaded definition but returns only `source.<hash>` plus digest, and the visibility projector uses that reference as its title.

Recommended: add optional `title` to the **existing definition metadata**, propagate validated display metadata through the existing internal admission/durable-summary path, and use it for heading and browser-tab title. Do not add agent-facing tool-call steps or a parallel metadata registry. Fallback: readable definition id, then generic Workflow—not a signature or provider prompt preview. Description is supporting copy, not an overloaded heading.

Constrain and wrap long titles on desktop/mobile. Do not repurpose runId/sourceRef or rewrite historic digests. A genuine source edit, including a new title, legitimately changes its content digest; the integrity algorithm and existing identities remain unchanged.

## Proposed implementation sequence — not launched

1. **Typed visible-item contract:** agree fields, final-result binding, retention/completeness and active-scope query semantics; repair provider/daemon/normalizer/replay/gateway loss under one serialized shared-contract owner. Add a new additive migration if required; never rewrite live-applied006.
2. **Readable current-work UI:** consume that contract through Svelte message components, stable revision merging, cancellation/route/empty-state policy and bounded scrolling. Fold all earlier readable-feed annotations into this one follow-up.
3. **Human title propagation:** small end-to-end metadata change; can be designed independently, but shared projector/admission/schema writes must be serialized with step1. No workspace-wide structural refactor.
4. **Native feedback and final motion:** after implementation authority, use isolated synthetic fixtures and the visible in-app Browser to check actual changes/build/render behavior on desktop/mobile. Keep the shared viewer running; fixture cleanup must never shut it down. Add no paid model turns without explicit authority.

Future acceptance must cover repeated/split/empty deltas, final replacement, two identical texts with different IDs, two runs/turns with the same local item ID, late/replayed events, reconnect gaps, clipping/retention, invalid or incomplete schema output, hostile Markdown/URLs, selected-feed switch/collapse, cancellation ACK versus terminal cancellation, cancelled direct links, offline after cancellation, other active runs and incomplete summary pages, long titles/text/code, viewport resizing, bottom-follow versus reading history, keyboard/reduced-motion behavior and zero fixture resource delta.

## Founder decisions

- Approve the upstream typed-item/read-model repair together with the frontend, rather than a knowingly incomplete frontend-only grouping patch.
- Confirm validated result fields as the default final presentation, with neutral assembling state and optional safe preview rather than streaming raw JSON.
- Confirm proposed bounded-retention caps and whether exact per-line reveal merits visible-line measurement if CSS-only treatment fails native proof; otherwise accept simple low-cost reveal.
- Confirm default current-work handling of completed/failed runs; cancelled-run removal is already explicit and not an open question.

No product files, frozen old contracts, tests, services or databases were changed in this discovery. Source/DOM inspection is evidence for this plan, not an implementation acceptance claim. **Stop: planning_complete.**
