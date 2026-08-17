---
name: agent-device
description: Use agent-device as the primary CLI for mobile development and app verification across React Native, Expo, iOS, Android, simulators, emulators, physical devices, TV, macOS, Linux, HarmonyOS, and bounded web sessions. Trigger for mobile QA, app interaction, accessibility snapshots, screenshots, recordings, logs, network evidence, performance checks, replay, Maestro compatibility, or real-device validation. Escalate deep native, Hermes, fiber, or cross-layer diagnostics to the global Argent skill.
---

# agent-device

Use the installed `agent-device` CLI as the first-line device feedback loop. Keep the skill as a router into version-matched CLI help.

## Preflight

1. Resolve `agent-device` from the user's normal shell; do not silently substitute `npx`.
2. Run `agent-device --version`. Require `>= 0.20.0`; report an older install and stop version-sensitive work.
3. Read the smallest matching guide before planning commands:
   - routine scripted QA: `agent-device help manual-qa`
   - validation after a code/config change: `agent-device help validate`
   - exploratory dogfood: `agent-device help dogfood`
   - React Native or Expo: `agent-device help react-native`
   - general or mixed interaction: `agent-device help workflow`
4. Read `help debugging`, `help react-devtools`, `help cdp`, `help remote`, `help web`, `help macos`, or `help tv` only when the task needs that surface.
5. Treat the per-user daemon as shared machine state. Serialize the first command after an install/version change; if a read-only inventory reports that stale daemon metadata was safely healed but startup lost a concurrent race, wait for the competing command to exit and retry that read once. Do not delete daemon files manually.

Do not install, update, connect a cloud target, or change configuration without user authority.

## Default loop

1. Select an explicit platform/device or an already-running compatible target.
2. Open or relaunch the app with an explicit session when the flow is multi-step.
3. Capture `snapshot -i` and prefer semantic refs/selectors over coordinates.
4. Use `--settle` on supported mutations and treat the settled diff as the next state.
5. Verify with `wait`, `get`, `is`, `find`, screenshot, logs, network, perf, trace, or recording according to the claim.
6. Preserve stable flows as `.ad` replay/tests or compatible Maestro artifacts when acceptance requires repeatability.
7. Close only sessions and leases owned by the workflow.

Run mutating commands serially within one session. Parallelize only read-only work or separate sessions/devices.

## Escalation

Read [escalation-to-argent.md](references/escalation-to-argent.md) when `agent-device` cannot obtain faithful evidence or the request explicitly needs Argent's deeper diagnostics. Do not escalate merely because both tools can perform an interaction.

## Evidence boundary

Read [evidence-boundary.md](references/evidence-boundary.md) before claiming broad feature acceptance. Device interaction is evidence; repository tests, Nx targets, BATDD contracts, and independent verification remain authoritative.
