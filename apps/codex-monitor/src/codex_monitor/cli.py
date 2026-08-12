from __future__ import annotations

import argparse
import asyncio
import json
import os
import shlex
import subprocess
import sys
import time
import uuid
from pathlib import Path

from .protocol import AppServerClient
from .state import MonitorState


def state_root() -> Path:
    return (
        Path(os.environ.get("CODEX_HOME", Path.home() / ".codex")) / "monitors" / "app-server-spike"
    )


def wake_text(handle: str, marker_id: str, seconds: int, memo: str) -> str:
    return "\n".join(
        [
            "MONITOR EVENT",
            "boomerang: app-server-python-spike",
            f"handle: {handle}",
            "outcome: met",
            "status: completed",
            f"condition: timed {seconds}s",
            f"marker: MONITOR_APP_SERVER_SPIKE_{marker_id}",
            f"memo: {memo}",
            "This is an App Server visibility test. Confirm this MONITOR EVENT visibly surfaced in this exact Codex Desktop task, report the handle and marker only, and stop. Do not modify files or continue unrelated work.",
        ]
    )


async def run_worker(args: argparse.Namespace) -> int:
    path = Path(args.state)
    state = MonitorState(path, args.handle, args.marker)
    if state.snapshot["phase"] == "armed":
        state.transition("waiting")
    remaining = max(0.0, args.fire_at - time.time())
    if remaining:
        await asyncio.sleep(remaining)
    state.transition("condition_met")
    if state.snapshot.get("modelAffinity") != "inherit":
        raise RuntimeError("monitor model affinity must be inherit; explicit model overrides are forbidden")
    command = [args.codex_bin, "app-server", "--listen", "stdio://"]
    client = AppServerClient(command, timeout=args.turn_timeout)
    try:
        before = await client.read_thread(args.thread_id)
        if client.contains_marker(before, args.marker):
            state.mark_persisted_without_submit("existing")
            return 0
        outcome = await client.submit(
            args.thread_id,
            args.marker,
            cwd=args.cwd,
        )
        state.transition("request_accepted", request_id=3, turn_id=outcome.turn_id)
        state.transition("turn_terminal_observed", turn_id=outcome.turn_id)
        after = await client.read_thread(args.thread_id)
        if not client.contains_marker(after, args.marker):
            raise RuntimeError("terminal turn was not found after reconnect")
        state.transition("persisted_reconciled", turn_id=outcome.turn_id)
        return 0
    except Exception as error:  # noqa: BLE001 - worker boundary must persist every failure class
        state.annotate(error_type=type(error).__name__, error=str(error), failed_at=time.time())
        return 1


def arm(args: argparse.Namespace) -> int:
    handle = str(uuid.uuid4())
    marker_id = str(uuid.uuid4())
    marker = wake_text(handle, marker_id, args.seconds, args.memo)
    root = state_root()
    state_path = root / "handles" / f"{handle}.json"
    log_path = root / "logs" / f"{handle}.log"
    state = MonitorState(state_path, handle, marker)
    fire_at = time.time() + args.seconds
    state.annotate(
        thread_id=args.thread_id,
        seconds=args.seconds,
        fire_at=fire_at,
        cwd=args.cwd,
        log_path=str(log_path),
        modelAffinity="inherit",
    )
    log_path.parent.mkdir(parents=True, exist_ok=True)
    command = [
        sys.executable,
        "-m",
        "codex_monitor.cli",
        "worker",
        "--state",
        str(state_path),
        "--handle",
        handle,
        "--marker",
        marker,
        "--thread-id",
        args.thread_id,
        "--cwd",
        args.cwd,
        "--fire-at",
        str(fire_at),
        "--codex-bin",
        args.codex_bin,
        "--turn-timeout",
        str(args.turn_timeout),
    ]
    environment = dict(os.environ)
    environment.pop("CODEX_INTERNAL_ORIGINATOR_OVERRIDE", None)
    if args.launcher == "tmux":
        session = f"codex-monitor-app-server-{handle[:8]}"
        python_path = environment.get("PYTHONPATH", "")
        shell_command = (
            "exec env -u CODEX_INTERNAL_ORIGINATOR_OVERRIDE "
            f"PYTHONPATH={shlex.quote(python_path)} {shlex.join(command)} "
            f">>{shlex.quote(str(log_path))} 2>&1"
        )
        subprocess.run(
            ["tmux", "new-session", "-d", "-s", session, "-c", args.cwd, shell_command],
            check=True,
            env=environment,
        )
        pid = int(
            subprocess.check_output(
                ["tmux", "display-message", "-p", "-t", session, "#{pane_pid}"], text=True
            ).strip()
        )
        state.annotate(launcher="tmux", tmux_session=session, worker_pid=pid)
    else:
        with log_path.open("ab", buffering=0) as log:
            process = subprocess.Popen(
                command,
                stdin=subprocess.DEVNULL,
                stdout=log,
                stderr=log,
                start_new_session=True,
                env=environment,
            )
        pid = process.pid
        state.annotate(launcher="process", worker_pid=pid)
    print(
        json.dumps(
            {
                "handle": handle,
                "pid": pid,
                "state": str(state_path),
                "log": str(log_path),
                "fire_at": fire_at,
                "launcher": args.launcher,
                **({"tmux_session": session} if args.launcher == "tmux" else {}),
            }
        )
    )
    return 0


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(prog="codex-monitor-app-server-spike")
    commands = root.add_subparsers(dest="command", required=True)
    arm_parser = commands.add_parser("arm")
    arm_parser.add_argument("--seconds", type=int, required=True)
    arm_parser.add_argument("--thread-id", required=True)
    arm_parser.add_argument("--memo", required=True)
    arm_parser.add_argument("--cwd", required=True)
    arm_parser.add_argument("--codex-bin", default="codex")
    arm_parser.add_argument("--turn-timeout", type=float, default=300.0)
    arm_parser.add_argument("--launcher", choices=("process", "tmux"), default="process")
    worker = commands.add_parser("worker")
    worker.add_argument("--state", required=True)
    worker.add_argument("--handle", required=True)
    worker.add_argument("--marker", required=True)
    worker.add_argument("--thread-id", required=True)
    worker.add_argument("--cwd", required=True)
    worker.add_argument("--fire-at", type=float, required=True)
    worker.add_argument("--codex-bin", required=True)
    worker.add_argument("--turn-timeout", type=float, required=True)
    return root


def main() -> int:
    args = parser().parse_args()
    if args.command == "arm":
        if args.seconds <= 0:
            raise SystemExit("--seconds must be positive")
        return arm(args)
    return asyncio.run(run_worker(args))


if __name__ == "__main__":
    raise SystemExit(main())
