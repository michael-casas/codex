#!/usr/bin/env python3
"""Initialize a session scratchpad and restore bounded context after compaction."""

from __future__ import annotations

import json
import os
import re
import sys

from scratchpad_store import (
    active_context_rows,
    failure_payload,
    initialize,
    mark_latest_restored,
    normalize_session_id,
    parse_hook_event,
    resolve_db_path,
)


MAX_CHARS = 6000
VALID_SOURCES = {"startup", "resume", "clear", "compact"}
SECRET_PATTERNS = (
    (re.compile(r"(?i)(api[_ -]?key|token|password|secret)\s*[:=]\s*[^\s,;]+"), r"\1=[REDACTED]"),
    (re.compile(r"\bsk-[A-Za-z0-9_-]{12,}\b"), "[REDACTED_KEY]"),
)


def redact(value: str) -> str:
    for pattern, replacement in SECRET_PATTERNS:
        value = pattern.sub(replacement, value)
    return value


def main() -> int:
    try:
        event = parse_hook_event("SessionStart", sys.stdin.read())
        source = str(event.get("source") or "").strip().lower()
        if source not in VALID_SOURCES:
            raise ValueError("SessionStart source must be startup, resume, clear, or compact")
        session_id = normalize_session_id(
            event.get("session_id") or os.environ.get("CODEX_SESSION_ID") or os.environ.get("CODEX_THREAD_ID")
        )
        db_path = resolve_db_path(event.get("cwd") or os.getcwd(), session_id)
        conn = initialize(db_path, session_id, must_exist=source == "compact")
        try:
            if source != "compact":
                return 0
            mark_latest_restored(conn, session_id)
            rows = active_context_rows(conn)
        finally:
            conn.close()

        lines = ["Active session scratchpad context (bounded; verify against current files):"]
        for row in rows:
            label = f"{row['kind']}/{row['subject']}" if row["subject"] else str(row["kind"])
            lines.append(f"- [{row['certainty']}] {label}: {redact(str(row['content'])).strip()}")
        context = "\n".join(lines)[:MAX_CHARS].rstrip()
        print(
            json.dumps(
                {
                    "continue": True,
                    "hookSpecificOutput": {
                        "hookEventName": "SessionStart",
                        "additionalContext": context,
                    },
                },
                ensure_ascii=False,
            )
        )
        return 0
    except Exception as exc:
        print(failure_payload(exc))
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
