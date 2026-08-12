import tempfile
import unittest
from pathlib import Path

from codex_monitor.state import MonitorState


class MonitorStateTests(unittest.TestCase):
    def test_monotonic_dispatch_and_duplicate_rejection(self):
        with tempfile.TemporaryDirectory() as directory:
            state = MonitorState(Path(directory) / "state.json", "wake-1", "marker-1")
            state.transition("waiting")
            state.transition("condition_met")
            state.transition("request_accepted", request_id=3, turn_id="turn-1")
            state.transition("turn_terminal_observed")
            state.transition("persisted_reconciled")
            with self.assertRaises(ValueError):
                state.transition("request_accepted", request_id=4)

    def test_reconciled_marker_suppresses_duplicate_submission(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "state.json"
            state = MonitorState(path, "wake-2", "marker-2")
            state.transition("waiting")
            state.transition("condition_met")
            state.mark_persisted_without_submit("turn-existing")
            self.assertFalse(state.should_submit())
            self.assertEqual("persisted_reconciled", state.snapshot["phase"])


if __name__ == "__main__":
    unittest.main()
