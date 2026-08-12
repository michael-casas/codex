#!/usr/bin/env python3
"""Fail-closed PreCompact checkpoint for the canonical session scratchpad."""

from __future__ import annotations

import os
import sys

from scratchpad_store import (
    failure_payload,
    initialize,
    normalize_session_id,
    normalize_trigger,
    normalize_turn_id,
    parse_hook_event,
    record_precompact,
    resolve_db_path,
)


def main() -> int:
    try:
        event = parse_hook_event("PreCompact", sys.stdin.read())
        session_id = normalize_session_id(
            event.get("session_id") or os.environ.get("CODEX_SESSION_ID") or os.environ.get("CODEX_THREAD_ID")
        )
        turn_id = normalize_turn_id(event.get("turn_id"))
        trigger = normalize_trigger(event.get("trigger"))
        db_path = resolve_db_path(event.get("cwd") or os.getcwd(), session_id)
        conn = initialize(db_path, session_id)
        try:
            record_precompact(conn, session_id=session_id, turn_id=turn_id, trigger=trigger)
        finally:
            conn.close()
        return 0
    except Exception as exc:
        print(failure_payload(exc))
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
