# Device interaction

Use the unified Argent interaction surface for iOS, Android, and supported Chromium/CDP targets.

## Core loop

1. Resolve the target identifier and runtime kind.
2. Discover the current UI with `describe`; for React Native source/component detail, use the Metro component tree when available.
3. Select a stable semantic target: identifier/testID first, then label/text/role.
4. Interact once, then inspect or await the resulting state.
5. Use screenshots only for visual evidence or when structured discovery cannot expose the control.

Before every tap, perform discovery for the current step and take coordinates from that result. A screenshot alone is never sufficient. Rediscover whenever the screen changes. If a tap fails twice at the same coordinates, stop retrying and rediscover. Read and follow the exact `describe` error before choosing a fallback.

Coordinates are normalized when the operation specifies normalized input. Never infer targets from pixels. Launch apps by bundle/package identifier or open URL rather than tapping home-screen icons.

Before the first use of a deferred gesture operation, load/discover its current schema so numeric parameters are not guessed or coerced. Interaction operations may return an automatic screenshot; request a separate screenshot only for an initial baseline, delayed state, stable visual evidence, or a structured-discovery failure.

Batch known independent actions with the sequence operation. Do not batch across a state transition unless a trustworthy UI wait gates the next action. Use element waits for semantic state and screen-idle waits only as supplemental readiness evidence; stillness does not identify a destination.

For Chromium/CDP targets, use wheel-style scrolling and Chromium drag operations rather than touch-only swipe gestures. Resolve the active tab/window before acting when multiple targets exist.

Never place secrets in prompts or ordinary keyboard text. Use Argent secret placeholders and avoid screenshots/descriptions that could expose a non-secure field before submission.

Route TV targets to `interaction-tv.md` and permission-store manipulation to `interaction-permissions.md`.

Provenance: curated from Casona `argent-device-interact`, its gesture examples, and the quarantined developer instruction's tapping and sequencing rules.
