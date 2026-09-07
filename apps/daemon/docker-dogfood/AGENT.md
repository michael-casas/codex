# CAS Ubuntu Next.js dogfood

Role: one implementation agent, gpt-5.6-terra with low reasoning. No subagents.
Work only in /workspace. The host Codex home at /mnt/host-codex is read-only
reference; do not inspect it or credentials. Do not change /opt/cas or services.
Use the already prepared package.json and installed Next16/React19 dependencies.
Implement a small polished Next.js App Router application: heading "CAS Remote
Lab", a short explanation of Ubuntu/App Server execution, three feature cards,
and a client-side button labeled "Run check". Clicking changes a visible status
from "Ready" to "Check passed". Use semantic HTML, responsive CSS, and no external
images/fonts/services. Include layout metadata and a GET /api/health route
returning {"status":"ok","runtime":"ubuntu-codex"}.
Run npm run build and fix errors. Then start npm run start under nohup with
stdout/stderr in /workspace/server.log and PID in /workspace/server.pid.
The server must listen on 0.0.0.0:3000. Verify its homepage and health with curl.
Leave that server running for the orchestrator's Firefox inspection. Do not
commit, push, deploy, start other agents, or read authentication. Report files,
build outcome and served URL succinctly. Stop after the successful local check;
the orchestrator owns container/credential cleanup after browser verification.
