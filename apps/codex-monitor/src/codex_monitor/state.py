from __future__ import annotations

import json
import os
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

PHASES = (
    "armed",
    "waiting",
    "condition_met",
    "request_accepted",
    "turn_terminal_observed",
    "persisted_reconciled",
)


class MonitorState:
    def __init__(self, path: Path, wake_id: str, marker: str):
        self.path = path
        if path.is_file():
            self.snapshot = json.loads(path.read_text())
        else:
            self.snapshot = {
                "wake_id": wake_id,
                "marker": marker,
                "phase": "armed",
                "events": [],
            }
            self._write()

    def transition(self, phase: str, **details: Any) -> None:
        if phase not in PHASES:
            raise ValueError(f"unknown phase: {phase}")
        current = self.snapshot["phase"]
        if PHASES.index(phase) != PHASES.index(current) + 1:
            raise ValueError(f"invalid transition: {current} -> {phase}")
        self.snapshot["phase"] = phase
        self.snapshot.update(details)
        self.snapshot["events"].append(
            {"phase": phase, "at": datetime.now(UTC).isoformat(), **details}
        )
        self._write()

    def mark_persisted_without_submit(self, turn_id: str) -> None:
        if self.snapshot["phase"] != "condition_met":
            raise ValueError("read-before-retry reconciliation requires condition_met")
        self.snapshot["phase"] = "persisted_reconciled"
        self.snapshot["turn_id"] = turn_id
        self.snapshot["submission_suppressed"] = True
        self.snapshot["events"].append(
            {
                "phase": "persisted_reconciled",
                "at": datetime.now(UTC).isoformat(),
                "turn_id": turn_id,
                "submission_suppressed": True,
            }
        )
        self._write()

    def should_submit(self) -> bool:
        return self.snapshot["phase"] == "condition_met"

    def annotate(self, **details: Any) -> None:
        self.snapshot.update(details)
        self._write()

    def _write(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temp = self.path.with_name(f".{self.path.name}.{os.getpid()}.tmp")
        temp.write_text(json.dumps(self.snapshot, indent=2, sort_keys=True) + "\n")
        os.replace(temp, self.path)
