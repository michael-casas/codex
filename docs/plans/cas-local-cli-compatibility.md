# Local Codex CLI compatibility

Founder approved local App Server upgrade on 2026-09-08 to execute the requested
gpt-6-astra low repair. Codex 0.151.0 rejected that model before any worker output.

The host registry now admits exact local-proxy CLI 0.153.2 as well as 0.151.0.
The client still verifies the actual running version equals the requested one.
Remote WSS remains pinned to 0.151.0. Unknown versions fail closed. Generated
schema protocolVersion remains 0.151.0: this is a tested compatibility allowance
for the existing operations, not wholesale support for every new 0.153 API.

Run with Codex 0.153.2 on PATH:

```sh
bun nx run @codex/transport:test-local-cli-compat --skipNxCache
```

This dedicated local L2 target creates a private temporary Codex home and owns
its App Server. It checks handshake/version, metadata, credential-free account
read, command execution, ephemeral thread creation and reconnect. It makes no
model turns and removes its resources. The default 0.151 suites remain unchanged.
Local evidence: /tmp/cas-0153-red.log (new admission rejected),
/tmp/cas-0153-live-r3.log (real boundary passed).

Deployment changes only local runtime PATH and expectedVersion. The old binary
is retained for rollback and pinned tests; no remote service or credential moves.
