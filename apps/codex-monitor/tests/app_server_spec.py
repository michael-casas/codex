import tempfile
import textwrap
import unittest
from pathlib import Path

from codex_monitor.protocol import AmbiguousDisconnect, AppServerClient

FAKE_SERVER = r"""#!/usr/bin/env python3
import json, pathlib, sys
store = pathlib.Path(sys.argv[1])
marker = store.read_text() if store.exists() else None
for line in sys.stdin:
    msg = json.loads(line)
    method = msg.get("method")
    if method == "initialize":
        print(json.dumps({"id": msg["id"], "result": {"userAgent": "fake"}}), flush=True)
    elif method == "initialized":
        pass
    elif method == "thread/resume":
        if "excludeTurns" in msg["params"]:
            print(json.dumps({"id": msg["id"], "error": {"code": -32600, "message": "thread/resume.excludeTurns requires experimentalApi capability"}}), flush=True)
        else:
            print(json.dumps({"id": msg["id"], "result": {"thread": {"id": msg["params"]["threadId"], "turns": []}}}), flush=True)
    elif method == "turn/start":
        marker = msg["params"]["input"][0]["text"]
        store.write_text(marker)
        print(json.dumps({"id": msg["id"], "result": {"turn": {"id": "turn-fake", "status": "inProgress", "items": []}}}), flush=True)
        print(json.dumps({"method": "turn/started", "params": {"turn": {"id": "turn-fake", "status": "inProgress", "items": []}}}), flush=True)
        print(json.dumps({"method": "turn/completed", "params": {"turn": {"id": "turn-fake", "status": "completed", "items": [{"type": "userMessage", "content": [{"type": "text", "text": marker}]}]}}}), flush=True)
    elif method == "thread/read":
        print(json.dumps({"id": msg["id"], "result": {"thread": {"id": msg["params"]["threadId"], "turns": [{"id": "turn-fake", "items": [{"text": marker, "padding": "x" * 70000}]}]}}}), flush=True)
"""


class AppServerBoundaryTests(unittest.IsolatedAsyncioTestCase):
    async def test_real_child_stream_and_reconnect_read(self):
        with tempfile.TemporaryDirectory() as directory:
            server = Path(directory) / "fake-server.py"
            store = Path(directory) / "store.txt"
            server.write_text(textwrap.dedent(FAKE_SERVER))
            client = AppServerClient(["python3", str(server), str(store)])
            outcome = await client.submit(
                "thread-1", "marker-unique"
            )
            self.assertEqual("turn-fake", outcome.turn_id)
            self.assertTrue(outcome.terminal)
            readback = await AppServerClient(["python3", str(server), str(store)]).read_thread(
                "thread-1"
            )
            self.assertTrue(AppServerClient.contains_marker(readback, "marker-unique"))

    async def test_eof_after_submission_is_ambiguous_not_retried(self):
        with tempfile.TemporaryDirectory() as directory:
            server = Path(directory) / "eof.py"
            server.write_text(
                "import json, sys\nfor line in sys.stdin:\n    msg=json.loads(line)\n    if msg.get('method') == 'initialized': continue\n    if msg.get('method') == 'turn/start': raise SystemExit(0)\n    result={'thread': {'id': 'thread-1', 'turns': []}} if msg.get('method') == 'thread/resume' else {}\n    print(json.dumps({'id': msg['id'], 'result': result}), flush=True)\n"
            )
            client = AppServerClient(["python3", str(server)])
            with self.assertRaises(AmbiguousDisconnect):
                await client.submit("thread-1", "marker")


if __name__ == "__main__":
    unittest.main()
