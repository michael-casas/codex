# Codex Workflows CLI — Feature Contract

The canonical behavior is `codex-workflows.feature`. Green Contract
`CDX-WF-GC-1` preserves deterministic JSON preparation, fail-closed durable
commands, and read-only `.pi` compatibility. Additive Founder Green Contract
`CDX-WF-GC-2` owns trusted direct TypeScript execution, bounded local operational
journals, real Codex SDK turns, progress, artifacts, cancellation, and guaranteed
local host cleanup.

The direct runner executes trusted local code and does not own or claim durable
cross-process state, reducer acceptance, pg-boss delivery, a daemon, a monitor,
or tmux authority.

## Founder amendment `CDX-WF-GPT-GC-1`

Any bounded, non-whitespace model token beginning with `gpt-` is admitted and
forwarded byte-for-byte to the Codex SDK. Workflows do not maintain a model
name allowlist, infer provider availability, or substitute another model. The
SDK remains authoritative for whether an admitted model exists. This amendment
does not change the current `medium` reasoning boundary.

| Row           | Form           | Layer             | Observable GREEN                                                                                                                                    | Isolation and evidence                                                                |
| ------------- | -------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `GPT-GC1-001` | basic          | L1 integration    | Luna, Terra, Sol, and a future-shaped `gpt-*` token each reach the adapter exactly once and unchanged                                               | Injected adapter; nonzero Vitest rows                                                 |
| `GPT-GC1-002` | adversarial    | L1 integration    | Empty, non-`gpt-*`, whitespace-bearing, control-bearing, and overlong model tokens fail before node freeze or adapter launch                        | Zero adapter calls and zero frozen nodes                                              |
| `GPT-GC1-003` | basic          | L2 integration    | A trusted TypeScript workflow sends distinct valid `gpt-*` model tokens through the public CLI and real controlled Codex process boundary unchanged | Isolated temp root, trace, journal, and child cleanup                                 |
| `GPT-GC1-004` | representative | L3 behavior       | The exact-shebang workflow completes with mixed valid `gpt-*` requests visible at the SDK boundary                                                  | Physical Cucumber scenario, nonzero steps, zero temp/process delta                    |
| `GPT-GC1-005` | live dogfood   | L3 direct dogfood | The Founder experiment launches two parallel `gpt-5.6-terra` Medium turns rather than failing admission                                             | Exact public command, two frozen/started/completed nodes, and two independent outputs |
