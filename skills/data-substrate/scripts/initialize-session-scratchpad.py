#!/usr/bin/env python3
"""Initialize the canonical SQLite scratchpad for one Codex session."""

from __future__ import annotations

import argparse
import os
import uuid

from scratchpad_store import initialize, normalize_session_id, resolve_db_path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cwd", default=os.getcwd())
    parser.add_argument(
        "--session-id",
        default=os.environ.get("CODEX_SESSION_ID") or os.environ.get("CODEX_THREAD_ID") or str(uuid.uuid4()),
    )
    args = parser.parse_args()
    session_id = normalize_session_id(args.session_id)
    db_path = resolve_db_path(args.cwd, session_id)
    conn = initialize(db_path, session_id)
    conn.close()
    print(db_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
