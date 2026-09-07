# CAS-HOST-R1 — bounded host transport and cessation repair

Role: implementer, not independent verifier. Model: gpt-5.6-sol medium.
Founder authorizes HD01–03 from the immutable CAS-HOST-DIAG-01 report.
Work only in shared a4a6 and preserve all unrelated edits.

## Objective

Support legitimate media-sized events using aligned finite transport budgets,
preserve sanitized typed failure provenance, bound recovery, and retain explicit
stop obligations when observation fails. No paid inference or live runtime tests.

## Ownership and dependencies

Parent owns packages/transport/src/app-server-host/** and explicit named constant
re-exports in packages/codex/src/index.ts (coordinator approved). One child at a
time owns packages/codex/src/app-server-client/** and its focused tests. Up to two
bounded children total are authorized; actual capacity is parent plus one child.
Children do not spawn descendants and are not auditors.

UI owner 01a06c99-5e9d-7561-bd38-1b68609f310f retains app-server-workflow/\*\*.
Do not write that subtree until explicit handoff and an assignment amendment.
Overall READY requires bounded recovery/cessation evidence from that owner or
subsequent authorized integration, not merely bridge/client greens.

## Frozen contract design

- Shared default message limit: 16 MiB; configurable finite positive integer up
  to 64 MiB. Bridge and client receive the same configured value. Outgoing JSON,
  incoming frames and accumulated fragments remain bounded; no raw truncation.
- Existing 1 MiB diagnostic reproduction uses synthetic ~2.25 MiB media output;
  a within-budget event and subsequent response succeed without reconnect.
- Bridge emits one prefixed sanitized JSON diagnostic on budget rejection:
  CODEX_BRIDGE_DIAGNOSTIC: followed by code MESSAGE_TOO_LARGE, observedBytes,
  limitBytes and retryable:false. No payload, arbitrary stderr, auth or path.
- Client accepts only the exact bounded diagnostic shape and maps it to
  MESSAGE_TOO_LARGE with safe numeric metadata; malformed/unknown/oversized stderr
  is discarded. EOF/exit ordering must not erase a valid terminal diagnostic.
- Host wrapper preserves deterministic MESSAGE_TOO_LARGE and safe cause metadata;
  no ambiguous-disconnect label or automatic repeated recovery for a size limit.
- Recovery preserves the original typed cause; read metadata before full history
  where supported. Four active turns retain bounded interruption/cessation
  obligations after observer failure. Unconfirmed stop is explicit.

## BATDD and delivery

Read repository instructions/profile/worker contract and canonical File System,
Clean Code, TESTING, BATDD and orchestration SPEC. Use seam and BATDD RED/freeze/
GREEN with native Nx targets. Only synthetic stdio/Unix/TLS fixtures, no real
Codex binaries, credentials, provider turns or live runtime connections.
L1 owns validation/mapping/bounded recovery; real synthetic-process L2 owns wire
size, safe diagnostics, connection survival and cleanup. Live UI L3 belongs to
CAS-UI-R1; no BASE_READY here.

Stop after exact report/command/source hashes, affected checks and zero owned
resource delta at READY-FOR-VERIFICATION (schema stop READY-FOR-AUDIT), or report
an exact dependency halt after exhausting independent in-scope work.
No commits, generated protocol edits, home/config/installed-plugin changes,
daemon restarts/kills, remote operations, demo retries or acceptance claims.
