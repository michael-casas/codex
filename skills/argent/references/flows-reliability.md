# Flow reliability and recovery

Use when recording produces warnings or replay diverges.

Inspect the first divergence rather than downstream failures. Determine whether the cause is target selection, timing/readiness, overlay/obscuration, raw coordinates, unavailable UI trees, platform capability, or changed product behavior.

Repair the smallest justified unit. Restore the intended state, record missing behavior live when required, audit the whole flow, and replay from the declared start. A recovery interaction that changes scenario state invalidates the current proof run.

Stop after two unsuccessful correction cycles and report the blocker. Never weaken a requested check, replace semantic evidence with screenshots, or normalize a genuine product regression as flaky automation.

Provenance: curated from Casona `argent-create-flow/references/reliability-and-recovery.md`.
