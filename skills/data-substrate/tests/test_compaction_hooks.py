#!/usr/bin/env python3
"""Regression tests for the canonical compaction scratchpad lifecycle."""

from __future__ import annotations

import json
import sqlite3
import subprocess
import tempfile
import unittest
from pathlib import Path


SKILL_ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = SKILL_ROOT / "scripts"
PRE = SCRIPTS / "pre-compact-checkpoint.py"
POST = SCRIPTS / "post-compact-checkpoint.py"
RESTORE = SCRIPTS / "restore-session-context.py"


def run_hook(script: Path, event: dict[str, object]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["python3", str(script)],
        input=json.dumps(event),
        text=True,
        capture_output=True,
        check=False,
    )


class CompactionHookTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.cwd = Path(self.tempdir.name)
        self.session_id = "019f5c8d-41f7-7660-9118-de51a6ed019e"
        self.turn_id = "019fec9f-75b8-79b3-9b54-82f8affe536a"
        self.db_path = self.cwd / ".agent" / "sqlite" / f"session-{self.session_id}.db"

    def tearDown(self) -> None:
        self.tempdir.cleanup()

    def event(self, name: str, **extra: object) -> dict[str, object]:
        return {
            "hook_event_name": name,
            "session_id": self.session_id,
            "cwd": str(self.cwd),
            **extra,
        }

    def test_session_start_initializes_canonical_wal_database(self) -> None:
        result = run_hook(RESTORE, self.event("SessionStart", source="startup"))
        self.assertEqual(result.returncode, 0)
        self.assertEqual(result.stdout, "")
        with sqlite3.connect(self.db_path) as conn:
            self.assertEqual(conn.execute("PRAGMA journal_mode").fetchone()[0], "wal")
            self.assertEqual(conn.execute("PRAGMA quick_check").fetchone()[0], "ok")
            self.assertEqual(conn.execute("SELECT schema_version FROM session_meta").fetchone()[0], 2)

    def test_manual_and_auto_precompact_are_checkpointed(self) -> None:
        for index, trigger in enumerate(("manual", "auto"), start=1):
            turn_id = f"019fec9f-75b8-79b3-9b54-82f8affe536{index}"
            result = run_hook(
                PRE,
                self.event("PreCompact", trigger=trigger, turn_id=turn_id),
            )
            self.assertEqual(result.stdout, "")
            with sqlite3.connect(self.db_path) as conn:
                self.assertEqual(
                    conn.execute(
                        "SELECT status FROM compaction_event WHERE session_id = ? AND turn_id = ?",
                        (self.session_id, turn_id),
                    ).fetchone()[0],
                    "precompact_checkpointed",
                )

    def test_postcompact_closes_matching_checkpoint(self) -> None:
        run_hook(PRE, self.event("PreCompact", trigger="manual", turn_id=self.turn_id))
        result = run_hook(POST, self.event("PostCompact", trigger="manual", turn_id=self.turn_id))
        self.assertEqual(result.stdout, "")
        with sqlite3.connect(self.db_path) as conn:
            status, post_at = conn.execute(
                "SELECT status, post_at FROM compaction_event WHERE session_id = ? AND turn_id = ?",
                (self.session_id, self.turn_id),
            ).fetchone()
            self.assertEqual(status, "postcompact_observed")
            self.assertTrue(post_at)

    def test_precompact_fails_closed_without_turn_id(self) -> None:
        result = run_hook(PRE, self.event("PreCompact", trigger="manual"))
        payload = json.loads(result.stdout)
        self.assertFalse(payload["continue"])
        self.assertIn("turn_id", payload["stopReason"])

    def test_postcompact_fails_closed_without_precompact(self) -> None:
        run_hook(RESTORE, self.event("SessionStart", source="startup"))
        result = run_hook(POST, self.event("PostCompact", trigger="auto", turn_id=self.turn_id))
        payload = json.loads(result.stdout)
        self.assertFalse(payload["continue"])
        self.assertIn("matching PreCompact", payload["stopReason"])

    def test_compact_session_start_restores_bounded_context(self) -> None:
        run_hook(PRE, self.event("PreCompact", trigger="auto", turn_id=self.turn_id))
        run_hook(POST, self.event("PostCompact", trigger="auto", turn_id=self.turn_id))
        result = run_hook(RESTORE, self.event("SessionStart", source="compact"))
        payload = json.loads(result.stdout)
        self.assertTrue(payload["continue"])
        context = payload["hookSpecificOutput"]["additionalContext"]
        self.assertIn("compaction-lifecycle", context)
        self.assertIn("phase=postcompact_observed", context)
        with sqlite3.connect(self.db_path) as conn:
            self.assertTrue(
                conn.execute(
                    "SELECT restored_at FROM compaction_event WHERE session_id = ? AND turn_id = ?",
                    (self.session_id, self.turn_id),
                ).fetchone()[0]
            )

    def test_compact_session_start_fails_closed_without_database(self) -> None:
        result = run_hook(RESTORE, self.event("SessionStart", source="compact"))
        payload = json.loads(result.stdout)
        self.assertFalse(payload["continue"])
        self.assertIn("does not exist", payload["stopReason"])


if __name__ == "__main__":
    unittest.main()
