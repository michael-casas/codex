from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass
from typing import Any


class AmbiguousDisconnect(RuntimeError):
    pass


@dataclass(frozen=True)
class TurnOutcome:
    turn_id: str
    terminal: bool
    notifications: tuple[dict[str, Any], ...]


class AppServerClient:
    def __init__(self, command: list[str], timeout: float = 300.0):
        self.command = command
        self.timeout = timeout

    async def submit(
        self, thread_id: str, marker: str, *, model: str | None = None, effort: str | None = None, cwd: str | None = None
    ) -> TurnOutcome:
        process = await self._spawn()
        submitted = False
        notifications: list[dict[str, Any]] = []
        try:
            await self._initialize(process)
            await self._request(
                process,
                2,
                "thread/resume",
                {
                    "threadId": thread_id,
                    "approvalPolicy": "never",
                    "sandbox": "danger-full-access",
                    **({"model": model} if model else {}),
                    **({"cwd": cwd} if cwd else {}),
                },
                notifications,
            )
            submitted = True
            response = await self._request(
                process,
                3,
                "turn/start",
                {
                    "threadId": thread_id,
                    "clientUserMessageId": marker,
                    "input": [{"type": "text", "text": marker}],
                    **({"model": model} if model else {}),
                    **({"effort": effort} if effort else {}),
                    **({"cwd": cwd} if cwd else {}),
                },
                notifications,
            )
            turn_id = response.get("turn", {}).get("id")
            if not turn_id:
                raise RuntimeError("turn/start response did not contain a turn id")
            while True:
                message = await self._read(process, ambiguous=submitted)
                notifications.append(message)
                if message.get("method") in {"turn/completed", "turn/failed"}:
                    notified_id = message.get("params", {}).get("turn", {}).get("id")
                    if notified_id == turn_id:
                        return TurnOutcome(turn_id, True, tuple(notifications))
        finally:
            await self._stop(process)

    async def read_thread(self, thread_id: str) -> dict[str, Any]:
        process = await self._spawn()
        notifications: list[dict[str, Any]] = []
        try:
            await self._initialize(process)
            return await self._request(
                process,
                2,
                "thread/read",
                {"threadId": thread_id, "includeTurns": True},
                notifications,
            )
        finally:
            await self._stop(process)

    @staticmethod
    def contains_marker(value: Any, marker: str) -> bool:
        if isinstance(value, str):
            return marker in value
        if isinstance(value, list):
            return any(AppServerClient.contains_marker(item, marker) for item in value)
        if isinstance(value, dict):
            return any(AppServerClient.contains_marker(item, marker) for item in value.values())
        return False

    async def _spawn(self) -> asyncio.subprocess.Process:
        return await asyncio.create_subprocess_exec(
            *self.command,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            limit=16 * 1024 * 1024,
        )

    async def _initialize(self, process: asyncio.subprocess.Process) -> None:
        await self._request(
            process,
            1,
            "initialize",
            {
                "clientInfo": {
                    "name": "codex_monitor_python_spike",
                    "title": "Codex Monitor Python Spike",
                    "version": "0.1.0",
                }
            },
            [],
        )
        self._send(process, {"method": "initialized", "params": {}})

    async def _request(
        self,
        process: asyncio.subprocess.Process,
        request_id: int,
        method: str,
        params: dict[str, Any],
        notifications: list[dict[str, Any]],
    ) -> dict[str, Any]:
        self._send(process, {"id": request_id, "method": method, "params": params})
        ambiguous = method == "turn/start"
        while True:
            message = await self._read(process, ambiguous=ambiguous)
            if message.get("id") == request_id:
                if "error" in message:
                    raise RuntimeError(f"{method} failed: {message['error']}")
                return message.get("result", {})
            notifications.append(message)

    @staticmethod
    def _send(process: asyncio.subprocess.Process, message: dict[str, Any]) -> None:
        if process.stdin is None:
            raise RuntimeError("App Server stdin unavailable")
        process.stdin.write((json.dumps(message, separators=(",", ":")) + "\n").encode())

    async def _read(
        self, process: asyncio.subprocess.Process, *, ambiguous: bool
    ) -> dict[str, Any]:
        if process.stdout is None:
            raise RuntimeError("App Server stdout unavailable")
        line = await asyncio.wait_for(process.stdout.readline(), timeout=self.timeout)
        if not line:
            error = ""
            if process.stderr is not None:
                error = (await process.stderr.read()).decode(errors="replace")[-1000:]
            if ambiguous:
                raise AmbiguousDisconnect(
                    f"App Server disconnected after possible acceptance: {error}"
                )
            raise RuntimeError(f"App Server disconnected: {error}")
        return json.loads(line)

    async def _stop(self, process: asyncio.subprocess.Process) -> None:
        if process.stdin is not None:
            process.stdin.close()
        try:
            await asyncio.wait_for(process.wait(), timeout=2)
        except TimeoutError:
            process.terminate()
            try:
                await asyncio.wait_for(process.wait(), timeout=2)
            except TimeoutError:
                process.kill()
                await process.wait()
