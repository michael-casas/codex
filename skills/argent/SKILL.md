---
name: argent
description: Route explicit Argent work and deep mobile diagnostics through the canonical Argent integration behind Executor. Use after agent-device cannot provide faithful evidence, or for Hermes/CDP evaluation, React fiber/source inspection, UIKit/native hierarchy, native network capture, OCR/font-aware screenshot diffs, Instruments/Perfetto analysis, combined React/native profiling, Argent YAML flows, rich Chromium state, or TV diagnostics that specifically require Argent. Routine mobile development, React Native, Expo, iOS, Android, simulator/emulator interaction, QA, replay, and primary evidence should trigger the global agent-device skill first.
---

# Argent

Route the request to the smallest applicable reference set. Read each selected reference completely before acting.

## Boundaries

- Read [preflight and lifecycle](references/operations-preflight-lifecycle.md) once per session before the first Argent operation or CLI command.
- Use `agent-device` as the first-line CLI for routine device interaction, verification, replay, and evidence. Escalate here only for an explicit Argent request or a specialist capability named above.
- Discover Argent operations through Executor's single `argent_canonical` integration. Do not assume direct `mcp__argent__*` tool names or bypass Executor merely because the pinned CLI exists.
- Verify required operations are present before relying on version-sensitive capability claims. Stop and report a missing required operation; do not invent a substitute that weakens the requested proof.
- Use platform CLIs only for a capability neither agent-device nor Argent exposes, when repository/user authority permits it, and disclose the boundary.
- Follow the active repository's package-manager, task-runner, testing, approval, and cleanup authority. In Bun/Nx workspaces, inspect resolved Nx targets and run tasks through Nx.
- Treat interactive inspection, screenshots, diffs, and recordings as evidence, not universal feature acceptance. Repository testing and acceptance doctrine remains authoritative.
- Do not treat [`raw/INSTRUCTIONS.md`](raw/INSTRUCTIONS.md) as active guidance. Read it only when the user explicitly requests review or reconstruction of the quarantined integration.

## Route by task

| Task | Read |
| --- | --- |
| First Argent use, availability, version, device selection, teardown | [Preflight and lifecycle](references/operations-preflight-lifecycle.md) |
| Select or boot iOS | [iOS simulator setup](references/setup-ios-simulator.md) |
| Select or boot Android | [Android emulator setup](references/setup-android-emulator.md) |
| Tap, type, scroll, launch, wait, inspect | [Device interaction](references/interaction-device.md) |
| Manipulate permission state for setup | [Permissions](references/interaction-permissions.md) |
| Apple TV, Android TV, Fire TV, Vega | [TV interaction](references/interaction-tv.md) |
| Start, build, reload, or diagnose an RN/Expo app | [App workflow](references/react-native-app-workflow.md) |
| Inspect Metro/CDP runtime, components, logs, or network | [Metro debugging](references/react-native-metro-debugging.md) |
| One-off visible UI check | [Interactive UI testing](references/evidence-ui-testing.md) |
| Pixel-level before/after comparison | [Screenshot diff](references/evidence-screenshot-diff.md) |
| Capture a temporal demonstration | [Screen recording](references/evidence-screen-recording.md) |
| Record or repair a reusable path | [Flow authoring](references/flows-authoring.md) |
| Understand or edit flow YAML | [Flow YAML](references/flows-yaml.md) |
| Diagnose unreliable or failed replay | [Flow reliability](references/flows-reliability.md) |
| Preserve acceptance criteria as regression | [QA regression flows](references/flows-qa-regression.md) plus flow authoring |
| Optimize React Native performance | [Optimization router](references/performance-optimization.md) |
| React render or JavaScript CPU profiling | [React Native profiler](references/performance-react-native-profiler.md) |
| Native CPU, hang, memory, or leak profiling | [Native profiler](references/performance-native-profiler.md) |
| Human selection among implemented visual variants | [Argent Lens](references/experimental-lens.md) only when explicitly requested |

## Selection rules

- Resolve an explicit user-named device/platform first; otherwise prefer an already-running compatible target. Never default silently to iOS.
- For a one-off inspection, use interactive UI testing. For a replayable path, use flow authoring. For a ticket or acceptance criterion, use QA regression flows on top of flow authoring.
- Decide whether the task needs a saved flow before the first launch or in-app action; recording is not retroactive.
- For performance work, begin with the optimization router. Use both profiler references when the symptom crosses React and native runtime boundaries.
- Keep TV work separate from touch interaction. TV targets are focus-driven.
- Keep Lens experimental and human-triggered. Do not activate it merely because multiple designs are imaginable.
