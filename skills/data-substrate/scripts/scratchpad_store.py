#!/usr/bin/env python3
"""Canonical SQLite store for per-session Codex scratchpads."""

from __future__ import annotations

import datetime as dt
import json
import re
import sqlite3
from pathlib import Path
from typing import Any


SCHEMA_VERSION = 2
SESSION_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$")
VALID_TRIGGERS = {"manual", "auto"}


class ScratchpadError(RuntimeError):
    """Raised when the per-session scratchpad cannot satisfy its contract."""


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def normalize_session_id(value: object) -> str:
    session_id = str(value or "").strip()
    if not SESSION_ID_PATTERN.fullmatch(session_id):
        raise ScratchpadError("missing or invalid Codex session_id")
    return session_id


def normalize_trigger(value: object) -> str:
    trigger = str(value or "").strip().lower()
    if trigger not in VALID_TRIGGERS:
        raise ScratchpadError("compaction trigger must be manual or auto")
    return trigger


def normalize_turn_id(value: object) -> str:
    turn_id = str(value or "").strip()
    if not SESSION_ID_PATTERN.fullmatch(turn_id):
        raise ScratchpadError("missing or invalid Codex turn_id")
    return turn_id


def resolve_db_path(cwd: object, session_id: str) -> Path:
    root = Path(str(cwd or ".")).expanduser().resolve()
    return root / ".agent" / "sqlite" / f"session-{session_id}.db"


def connect(db_path: Path, *, must_exist: bool = False) -> sqlite3.Connection:
    if must_exist and not db_path.is_file():
        raise ScratchpadError(f"session scratchpad does not exist: {db_path}")
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path, timeout=5)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 5000")
    conn.execute("PRAGMA synchronous = FULL")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


def ensure_schema(conn: sqlite3.Connection, session_id: str) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS session_meta (
          session_id TEXT PRIMARY KEY,
          schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version > 0),
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );
        CREATE TABLE IF NOT EXISTS scratch_entry (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          kind TEXT NOT NULL CHECK (kind IN ('constraint', 'fact', 'decision', 'checkpoint', 'todo', 'question', 'artifact', 'command_result')),
          subject TEXT,
          content TEXT NOT NULL CHECK (length(trim(content)) > 0),
          source TEXT,
          certainty TEXT NOT NULL DEFAULT 'reported' CHECK (certainty IN ('verified', 'reported', 'inferred', 'hypothesis')),
          confidence REAL CHECK (confidence IS NULL OR (confidence >= 0.0 AND confidence <= 1.0)),
          survive_compaction INTEGER NOT NULL DEFAULT 1 CHECK (survive_compaction IN (0, 1)),
          status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded', 'resolved')),
          supersedes_id INTEGER REFERENCES scratch_entry(id) ON DELETE SET NULL,
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );
        CREATE TABLE IF NOT EXISTS compaction_event (
          session_id TEXT NOT NULL REFERENCES session_meta(session_id) ON DELETE CASCADE,
          turn_id TEXT NOT NULL,
          trigger TEXT NOT NULL CHECK (trigger IN ('manual', 'auto')),
          status TEXT NOT NULL CHECK (status IN ('precompact_checkpointed', 'postcompact_observed')),
          pre_at TEXT NOT NULL,
          post_at TEXT,
          restored_at TEXT,
          scratch_entry_id INTEGER NOT NULL REFERENCES scratch_entry(id) ON DELETE RESTRICT,
          PRIMARY KEY (session_id, turn_id)
        );
        CREATE INDEX IF NOT EXISTS scratch_entry_active_compaction_idx
          ON scratch_entry (survive_compaction, status, kind, id);
        CREATE INDEX IF NOT EXISTS scratch_entry_subject_idx
          ON scratch_entry (subject, status, id);
        CREATE INDEX IF NOT EXISTS compaction_event_latest_idx
          ON compaction_event (session_id, pre_at DESC);
        CREATE VIEW IF NOT EXISTS compaction_context AS
          SELECT id, kind, subject, content, source, certainty, confidence, supersedes_id, created_at, updated_at
          FROM scratch_entry WHERE survive_compaction = 1 AND status = 'active';
        """
    )
    existing = [str(row[0]) for row in conn.execute("SELECT session_id FROM session_meta")]
    if existing and existing != [session_id]:
        raise ScratchpadError("scratchpad session_meta does not match the active Codex session")
    conn.execute(
        "INSERT OR IGNORE INTO session_meta(session_id, schema_version) VALUES (?, ?)",
        (session_id, SCHEMA_VERSION),
    )
    conn.execute(
        "UPDATE session_meta SET schema_version = ? WHERE session_id = ? AND schema_version < ?",
        (SCHEMA_VERSION, session_id, SCHEMA_VERSION),
    )
    conn.commit()
    assert_integrity(conn)


def initialize(db_path: Path, session_id: str, *, must_exist: bool = False) -> sqlite3.Connection:
    conn = connect(db_path, must_exist=must_exist)
    try:
        ensure_schema(conn, session_id)
    except Exception:
        conn.close()
        raise
    return conn


def assert_integrity(conn: sqlite3.Connection) -> None:
    result = conn.execute("PRAGMA quick_check").fetchone()
    if not result or str(result[0]).lower() != "ok":
        raise ScratchpadError("SQLite quick_check failed for the session scratchpad")


def parse_hook_event(expected_event: str, raw: str) -> dict[str, Any]:
    try:
        event = json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError as exc:
        raise ScratchpadError(f"invalid hook JSON: {exc.msg}") from exc
    if not isinstance(event, dict):
        raise ScratchpadError("hook input must be a JSON object")
    actual = str(event.get("hook_event_name") or expected_event)
    if actual != expected_event:
        raise ScratchpadError(f"expected {expected_event} hook input, received {actual}")
    return event


def failure_payload(message: object) -> str:
    detail = str(message).strip() or "unknown scratchpad failure"
    return json.dumps(
        {
            "continue": False,
            "stopReason": f"Canonical session scratchpad enforcement failed: {detail}",
            "systemMessage": "Compaction scratchpad enforcement failed; the task was stopped to prevent state loss.",
        },
        ensure_ascii=False,
    )


def _lifecycle_content(*, trigger: str, turn_id: str, pre_at: str, post_at: str | None) -> str:
    if post_at:
        return (
            f"Compaction lifecycle verified; trigger={trigger}; turn_id={turn_id}; "
            f"pre_at={pre_at}; post_at={post_at}; phase=postcompact_observed"
        )
    return (
        f"PreCompact checkpoint verified; trigger={trigger}; turn_id={turn_id}; "
        f"pre_at={pre_at}; phase=precompact_checkpointed"
    )


def record_precompact(
    conn: sqlite3.Connection, *, session_id: str, turn_id: str, trigger: str
) -> None:
    timestamp = utc_now()
    try:
        conn.execute("BEGIN IMMEDIATE")
        existing = conn.execute(
            "SELECT scratch_entry_id FROM compaction_event WHERE session_id = ? AND turn_id = ?",
            (session_id, turn_id),
        ).fetchone()
        content = _lifecycle_content(trigger=trigger, turn_id=turn_id, pre_at=timestamp, post_at=None)
        if existing:
            scratch_entry_id = int(existing["scratch_entry_id"])
            conn.execute(
                """UPDATE compaction_event
                   SET trigger = ?, status = 'precompact_checkpointed', pre_at = ?, post_at = NULL, restored_at = NULL
                   WHERE session_id = ? AND turn_id = ?""",
                (trigger, timestamp, session_id, turn_id),
            )
            conn.execute(
                """UPDATE scratch_entry
                   SET content = ?, source = 'PreCompact hook', certainty = 'verified', status = 'active',
                       survive_compaction = 1, updated_at = ?
                   WHERE id = ?""",
                (content, timestamp, scratch_entry_id),
            )
        else:
            previous = conn.execute(
                """SELECT id FROM scratch_entry
                   WHERE kind = 'checkpoint' AND subject = 'compaction-lifecycle' AND status = 'active'
                   ORDER BY id DESC LIMIT 1"""
            ).fetchone()
            conn.execute(
                """UPDATE scratch_entry SET status = 'superseded', updated_at = ?
                   WHERE kind = 'checkpoint' AND subject = 'compaction-lifecycle' AND status = 'active'""",
                (timestamp,),
            )
            cursor = conn.execute(
                """INSERT INTO scratch_entry(
                       kind, subject, content, source, certainty, confidence,
                       survive_compaction, status, supersedes_id, updated_at
                   ) VALUES ('checkpoint', 'compaction-lifecycle', ?, 'PreCompact hook',
                             'verified', 1.0, 1, 'active', ?, ?)""",
                (content, int(previous["id"]) if previous else None, timestamp),
            )
            scratch_entry_id = int(cursor.lastrowid)
            conn.execute(
                """INSERT INTO compaction_event(
                       session_id, turn_id, trigger, status, pre_at, scratch_entry_id
                   ) VALUES (?, ?, ?, 'precompact_checkpointed', ?, ?)""",
                (session_id, turn_id, trigger, timestamp, scratch_entry_id),
            )
        conn.commit()
        assert_integrity(conn)
        row = conn.execute(
            """SELECT status FROM compaction_event
               WHERE session_id = ? AND turn_id = ? AND trigger = ?""",
            (session_id, turn_id, trigger),
        ).fetchone()
        if not row or row["status"] != "precompact_checkpointed":
            raise ScratchpadError("PreCompact checkpoint could not be read back after commit")
        conn.execute("PRAGMA wal_checkpoint(PASSIVE)")
    except Exception:
        if conn.in_transaction:
            conn.rollback()
        raise


def record_postcompact(
    conn: sqlite3.Connection, *, session_id: str, turn_id: str, trigger: str
) -> None:
    timestamp = utc_now()
    try:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute(
            """SELECT trigger, pre_at, scratch_entry_id FROM compaction_event
               WHERE session_id = ? AND turn_id = ?""",
            (session_id, turn_id),
        ).fetchone()
        if not row:
            raise ScratchpadError("PostCompact did not find its matching PreCompact checkpoint")
        if str(row["trigger"]) != trigger:
            raise ScratchpadError("PostCompact trigger does not match its PreCompact checkpoint")
        pre_at = str(row["pre_at"])
        scratch_entry_id = int(row["scratch_entry_id"])
        content = _lifecycle_content(trigger=trigger, turn_id=turn_id, pre_at=pre_at, post_at=timestamp)
        conn.execute(
            """UPDATE compaction_event
               SET status = 'postcompact_observed', post_at = ?
               WHERE session_id = ? AND turn_id = ?""",
            (timestamp, session_id, turn_id),
        )
        conn.execute(
            """UPDATE scratch_entry
               SET content = ?, source = 'PostCompact hook', certainty = 'verified',
                   status = 'active', survive_compaction = 1, updated_at = ?
               WHERE id = ?""",
            (content, timestamp, scratch_entry_id),
        )
        conn.commit()
        assert_integrity(conn)
        verified = conn.execute(
            """SELECT status, post_at FROM compaction_event
               WHERE session_id = ? AND turn_id = ?""",
            (session_id, turn_id),
        ).fetchone()
        if not verified or verified["status"] != "postcompact_observed" or not verified["post_at"]:
            raise ScratchpadError("PostCompact verification could not be read back after commit")
        conn.execute("PRAGMA wal_checkpoint(PASSIVE)")
    except Exception:
        if conn.in_transaction:
            conn.rollback()
        raise


def mark_latest_restored(conn: sqlite3.Connection, session_id: str) -> sqlite3.Row:
    row = conn.execute(
        """SELECT session_id, turn_id, trigger, status, pre_at, post_at
           FROM compaction_event WHERE session_id = ?
           ORDER BY pre_at DESC LIMIT 1""",
        (session_id,),
    ).fetchone()
    if not row:
        raise ScratchpadError("SessionStart(compact) found no PreCompact checkpoint")
    if row["status"] != "postcompact_observed" or not row["post_at"]:
        raise ScratchpadError("SessionStart(compact) found an incomplete compaction lifecycle")
    timestamp = utc_now()
    conn.execute(
        "UPDATE compaction_event SET restored_at = ? WHERE session_id = ? AND turn_id = ?",
        (timestamp, session_id, row["turn_id"]),
    )
    conn.commit()
    assert_integrity(conn)
    return row


def active_context_rows(conn: sqlite3.Connection, *, limit: int = 40) -> list[sqlite3.Row]:
    return conn.execute(
        """SELECT kind, subject, content, certainty
           FROM scratch_entry
           WHERE survive_compaction = 1 AND status = 'active'
           ORDER BY updated_at DESC, id DESC LIMIT ?""",
        (limit,),
    ).fetchall()
