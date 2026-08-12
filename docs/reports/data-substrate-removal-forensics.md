# Data-substrate removal forensics

Investigation date: 2026-08-08. Current clock at investigation start: 2026-08-08 09:05 EDT / 13:05Z. The requested interval was 2026-08-07 23:05 EDT / 03:05Z through the end of the investigation. The target is currently absent.

## Conclusion

Confirmed offender: not proven.

No Codex session, thread, monitor, rollout, SQLite event record, Git checkpoint, or other inspected artifact in the requested last-10-hour interval contains direct evidence that an agent executed a destructive operation affecting `/Users/mcasa_atlantis/.codex/skills/.system/data-substrate/`, its parent, or either named script.

The evidence establishes that the tracked data-substrate skill files were present in the repository's 2026-07-19 initial commit and are now worktree deletions. It does not establish when the files were removed, which process removed them, or whether the untracked script files were ever committed. Temporal proximity and later “file missing” observations are not sufficient to accuse a session.

Confidence in “no offender proven within the requested evidence window”: high, subject to the limitations below. Confidence in the actual removal time or actor: none.

## Search scope and method

The audit was read-only. It inspected, newest-to-oldest:

- Rollout JSONL under `sessions/2026/08/07/`, `sessions/2026/08/08/`, and the available archived rollout under `archived_sessions/`.
- `history.jsonl`, session indexes/transcription history where present, `.agent` artifacts, orchestration journals/reports, monitor handles, monitor JSONL traces, and monitor worker logs.
- SQLite stores using read-only SQLite access: `sqlite/logs_2.sqlite`, `sqlite/state_5.sqlite`, `sqlite/codex-dev.db`, `sqlite/codex-history-snapshots-dev.db`, `goals_1.sqlite`, and the other available Codex SQLite files. Schemas, recent bounds, thread metadata, timeline payloads, snapshots, and log bodies were inspected without writes.
- Filesystem metadata for the target and parents, Git status/history/reflog, the tracked tree, unreachable Git objects, and the available turn-diff checkpoint reference.

Search terms covered the target names and paths plus `rm`, `rm -r`, `rm -rf`, `unlink`, recursive deletion, `find -delete`, `git clean`, `mv`, `rsync`, install/sync/cleanup operations, and `apply_patch` delete operations. Searches were performed chronologically from the newest eligible artifacts to the oldest. Credentials, tokens, and unrelated prompt bodies were not reproduced here.

The primary 10-hour boundary was based on embedded timestamps where available and filesystem mtime otherwise. The recent filesystem inventory was led by `history.jsonl`, monitor traces, and the 2026-08-08 rollout files. The SQLite application log store itself only contained records through 2026-06-18 and therefore had no eligible recent rows.

## Chronology, newest to oldest

### 2026-08-08 13:05Z onward — current forensic session, session `019fe17a-29c3-7ac1-a206-e93dd22fa4a5`

Metadata: cwd `/Users/mcasa_atlantis/.codex`, source `exec`, CLI `0.146.1`; model field was not populated in the session metadata.

Direct evidence: this session performed read-only inventory, Git, SQLite, rollout, monitor, and checkpoint searches. It contains no successful destructive call. Its destructive-keyword searches mostly matched historical prompt text and ordinary `apply_patch` additions in unrelated orchestration work; no target deletion was found.

### 2026-08-08 13:05:13Z onward — monitor `e15727e9-bb0e-4462-8a70-4ad282248677`

The monitor is tied to thread/session identifier `019f5c8d-41f7-7660-9118-de51a6ed019e` and watches for the report marker. Its trace records `monitor.armed`, `monitor.active`, and repeated `monitor.condition.observed` with `met:false`. It contains no target mutation or destructive command. The monitor is an observer of this investigation, not evidence of the removal.

### 2026-08-08 12:56Z–13:07Z — rollout `019fe13d-52c3-7851-a3a3-51eea4d1fe83`

Metadata: cwd `/Users/mcasa_atlantis/.codex/orchestration`, source `cli`, CLI `0.146.1`; model was not populated in session metadata.

The session repeatedly checked whether the global skill existed. At 13:07:22Z it issued a command containing `rm -f` and `rmdir`, but every path was under `/Users/mcasa_atlantis/.codex/orchestration/tmp/...`, not under `.codex/skills`. The command result was `Script failed`; the execution wrapper rejected `rm -f` as not permitted before the shell ran. This is direct evidence of a rejected, unrelated cleanup attempt, not evidence against the data-substrate assets.

### 2026-08-08 11:58Z–12:56Z — rollout `019fe13d-52c3-7851-a3a3-51eea4d1fe83`

The session read `/Users/mcasa_atlantis/.codex/skills/.system/data-substrate/SKILL.md`, searched for the skill and initializer, and listed the global skill roots. The results reported the target as unavailable/missing. No `rm`, `unlink`, move, sync, cleanup, or target-directed patch was recorded. The session's `apply_patch` operations were additions/updates in `/Users/mcasa_atlantis/.codex/orchestration` and did not touch the target.

### 2026-08-08 04:02Z–05:55Z — rollout `019fdf89-42b6-7530-a0ae-903330718065`

Metadata: cwd `/Users/mcasa_atlantis/.codex/orchestration`, source `cli`, CLI `0.146.1`; model was not populated in session metadata.

The session searched for the global data-substrate skill and recorded that it was not available in the configured roots. Its patches modified orchestration product files and reports. No target-directed destructive operation was found. The session's cleanup language referred to unrelated test/worktree resources; no `.codex/skills` path appeared in a destructive command or delete patch.

### 2026-08-08 02:40Z–03:31Z — rollout `019fdf3d-eb26-7d11-90fd-5a5436e5d12f`

Metadata: cwd `/Users/mcasa_atlantis/.codex/orchestration`, source `cli`, CLI `0.146.1`; model was not populated in session metadata.

This is the oldest rollout with activity near the requested window. It read the data-substrate path, searched the global roots, and noted that the skill/initializer was unavailable. No target deletion command, target move, recursive cleanup, sync/install operation, or `apply_patch` delete was found. Its recorded edits were orchestration files.

The last eligible period begins at approximately 03:05Z. No matching target-directed destructive record was found between that boundary and the later observations above.

## Pre-window evidence and backup/presence checks

The nearest earlier rollout with explicit target inspection is session `019fdd3e-54c2-7c43-81ed-44624e88a71a`, at 2026-08-07 17:21Z, outside the requested ten-hour window. Its metadata identifies cwd `/Users/mcasa_atlantis/Documents/repos/github.com/atlantis-electrical/atlantis-electrical/.treehouse/atlantis-electrical-a35118/1/atlantis-electrical` and model `gpt-5.6-sol` in its thread settings. It attempted to read the global data-substrate instructions and run the session scratchpad initializer, but the later evidence in the same workstream reports the skill/initializer as missing. This shows the asset was already missing before the requested window; it does not show who removed it.

Additional older rollout prompts contain the data-substrate path as injected instruction text, which is not filesystem-presence evidence. No eligible session output recovered the contents of the two named scripts immediately before removal.

Git evidence is stronger for the tracked skill files:

- `git status --short -- skills/.system/data-substrate` reports deletions for `SKILL.md`, `agents/openai.yaml`, and the three tracked reference files.
- `git log --all --full-history -- skills/.system/data-substrate` shows those five files added by commit `987f19594e643ea3e806c5b70e37be3a204b451c` (`refactor: init`) at 2026-07-19 22:26:38 EDT. No later commit or reflog entry records their deletion.
- The two named scripts were not present in that commit's tracked tree, so Git cannot establish their earlier contents or removal event. They may have been untracked/generated assets, supplied by another installation step, or existed in a prior unretained state.
- The repository has unreachable Git objects, but read-only inspection found no object/path record that identifies a deletion actor or supplies a timestamped removal operation. The single available turn-diff checkpoint reference did not contain a target-directed deletion record.

Current filesystem metadata: `skills/.system/data-substrate/` and both scripts are absent. The parent `skills/.system` has mtime/birth metadata at 2026-08-08 09:05:07 EDT, coincident with a current rollout start, but directory metadata is not an operation log and cannot prove deletion by that session. It is compatible with parent-directory recreation or runtime state maintenance.

## Exact evidence and affected paths

Confirmed affected paths:

- `/Users/mcasa_atlantis/.codex/skills/.system/data-substrate/`
- `/Users/mcasa_atlantis/.codex/skills/.system/data-substrate/scripts/create-session-scratchpad.sh`
- `/Users/mcasa_atlantis/.codex/skills/.system/data-substrate/scripts/pre-compact-checkpoint.py`
- Tracked sibling assets currently shown deleted by Git: `SKILL.md`, `agents/openai.yaml`, `references/neo4j.md`, `references/postgresql.md`, and `references/redis.md`.

Direct positive evidence is limited to: Git’s tracked-file deletion state; the 2026-07-19 commit that added the tracked files; later session commands that attempted read-only access and received missing/unavailable results; and the rejected unrelated orchestration-temp cleanup command. There is no direct command, patch, tool-call output, or event that names the target in a successful destructive operation.

## Alternative hypotheses

The evidence remains consistent with several possibilities:

1. A deletion occurred before the 10-hour window, possibly during an installation/refactor process not retained in the inspected artifacts.
2. A process outside Codex session tooling removed or replaced the directory; the requested Codex logs would not necessarily capture it.
3. An install/sync/rebuild step recreated `skills/.system` while omitting the untracked/generated data-substrate assets. The parent-directory metadata is compatible with this but does not prove it.
4. The tracked files were removed by a worktree or repository operation whose command/event record is absent from the retained logs. Git status proves the resulting state, not the actor.
5. The two scripts may never have belonged to this Git worktree and may have been supplied by an external bootstrap or prior local installation.

No hypothesis should be promoted to an accusation without an OS audit trail, shell history with command result, or a retained Codex tool-call showing the exact target path.

## Safe restoration recommendations

Do not restore during forensic work. Preserve the current worktree and report, and first capture a read-only hash/listing of the current state if an incident owner needs chain-of-custody.

For recovery, prefer a known-good, versioned source or backup whose provenance and hashes can be recorded. Restore into a separately verified staging path first; compare the expected `SKILL.md`, `agents/openai.yaml`, references, and both scripts; then obtain explicit approval before replacing the global skill directory. After restoration, verify the hook references in `hooks.json`, file modes, script syntax, and a fresh session scratchpad/checkpoint run in an isolated test location. Do not restore from the unreachable Git objects without first identifying the object-to-path mapping and validating content.

To improve future attribution, enable or retain a file-integrity/audit trail for `/Users/mcasa_atlantis/.codex/skills`, retain successful and failed tool-call results, record session/thread IDs with OS process IDs for file mutations, and protect the global skill tree from broad cleanup/install operations. Keep the audit trail read-only to investigators and exclude credentials from reports.

FORENSICS_COMPLETE
