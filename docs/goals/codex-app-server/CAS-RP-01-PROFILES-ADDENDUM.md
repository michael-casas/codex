# CAS-RP-01 addendum 02 — existing Codex profiles

Founder addition: recognize and select existing named Codex configuration
profiles alongside explicit per-agent model and reasoning. This adds required
behavior; it does not authorize unrelated config changes or wider permissions.

## Official authority

Fetched [OpenAI Advanced Configuration — Profiles](https://learn.chatgpt.com/docs/config-file/config-advanced#profiles).
Current documentation defines CODEX_HOME/NAME.config.toml as a named layer
above base user config and below project and CLI configuration. Names use
letters, numbers, hyphens and underscores. Since Codex 0.134.0, --profile no
longer reads [profiles.NAME] tables or the top-level profile selector.

Verify native support against the pinned 0.151.0 App Server protocol. Documentation
of a CLI flag alone is not proof of a per-thread App Server field. Prefer native
configuration/profile resolution; do not invent an unsupported request field or
build a competing general-purpose configuration loader.

## Added required behavior and proof

- Discover safe profile names and select one by name in task-level delegation
  and workflows. Do not require callers to copy profile values manually.
- Resolve the profile in the selected host/config context. A local profile is
  not automatically a remote profile; missing remote support fails explicitly.
- Explicit per-agent overrides take precedence over corresponding profile
  defaults; omitted values retain native effective configuration semantics.
  Preserve trusted project and managed-policy precedence.
- Record profile identity and resolved effective model/effort at admission;
  reuse the frozen selection on replay, rather than silently re-resolving a
  changed file. Keep secrets and unrelated profile content out of results.
- Reject missing/invalid names, path traversal, malformed config and unsupported
  combinations before launching. Explain legacy formats without silently migrating
  or rewriting the user's configuration.
- Configuration profiles and permission profiles are distinct concepts. Selecting
  a config profile must not widen the assignment's sandbox, network, approval,
  credential or remote authority. Do not claim full-profile application if only
  model/effort extraction is implemented.
- Add L1 precedence/rejection/replay checks and faithful L2 native-resolution and
  wire evidence. Preserve prior contract rows; add a versioned contract amendment
  and meaningful RED for new behavior before its GREEN implementation.

Existing file lease remains unchanged. Request exact additional surfaces when
needed. No home/config/remote writes, new dependencies, demo launch, installed
plugin mutation, audits, commits or deployment. Terminal now includes this
profile requirement; a missing native capability produces an exact halt rather
than a partial AGENT_RUNTIME_PROFILE_READY claim.
