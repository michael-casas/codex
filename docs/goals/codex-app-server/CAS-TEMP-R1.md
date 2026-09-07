# CAS-TEMP-R1 — workspace-owned agent temp

Role: implementation owner. Coordinator authorizes a failed-only dogfood repair; stop READY-FOR-VERIFICATION, never self-accept.

Create one private reserved temp directory inside every canonical workspace lease, return it from `resolve`, and bind workflow App Server thread/turn execution to it. `thread/start.config.shell_environment_policy.set` supplies TMPDIR/TMP/TEMP only for the child thread. `turn/start.sandboxPolicy` is exact pinned0.151 `workspaceWrite` with writable roots limited to cwd+temp, network disabled, inherited/system temp excluded. Preserve model/effort/approval/output schema and all prior restart/visibility behavior.

Reject preexisting/symlinked temp paths and cleanup partial acquisition. Mode is0700. Concurrent assignments get distinct directories. Release owns/removes temp with the workspace on success/failure. No `/tmp` grant, network widening, sandbox downgrade, credential inheritance/dump, dependency, schema or service mutation.

BATDD: meaningful L1 RED for lease creation/resolution/isolation/failure and exact App Server request shape; isolated L2 real App Server command executes a no-network Bun temp write through the resolved directory, proves containment/mode/nonsymlink and release cleanup. Run affected standing targets and resource checks. Coordinator alone restarts live service and authorizes later paid dogfood.
