# CAS Synology bootstrap — 2026-09-07

Founder authorized dedicated setup on aes-j5-synology, preserving existing
containers/services. Existing native authenticated WSS8443 is reachable and
account/read reports an account. A Terra-low setup turn could not execute its
first command: Synology rejects bwrap namespace creation. No native sandbox
downgrade was introduced.

## Prepared resources

- Dedicated root: /volume1/homes/Michael/admin/cas-remote-lab
- Clean GitHub baseline clone: repository/, revision
  b9dc01512975a8b11bc673b5ec906c818dd708f6. HTTPS clone succeeded; default GitHub
  SSH identity did not authenticate. Existing keys/config were not changed.
- Current seven-file Docker harness transferred through App Server filesystem
  operations and verified byte-for-byte. This is separate from the Git clone;
  the accumulated CAS candidate remains uncommitted locally.
- New container cas-nextjs-dogfood-app-server-1, healthy, restart unless-stopped.
- Ubuntu24.04 x86-64, Node22.18.0, Codex0.151.0, UID1033/GID100 matching
  Michael:users. Auth copied only inside private tmpfs, mode0600.
- Host ~/.codex stays read-only mounted; no existing runtime configuration
  replaced. Persistent app workspace belongs to Michael:users, mode0750.
- New TLS listener published only on127.0.0.1:14501. A scoped test certificate
  covers the NAS Tailscale DNS/IP; it expires after7days and needs replacement
  or managed TLS before durable production use.
- All11 existing containers remained up; existing Tailscale8443 route unchanged.
- One failed build intermediate was removed by its exact recorded ID. Build
  portability fixed for legacy Docker's absent TARGETARCH using dpkg fallback.

## Exact root handoff

Run on aes-j5-synology as root (or prepend sudo in a privileged interactive
session). This adds only the dedicated raw TCP route, preserving TLS from the
container and bearer authentication. Do not reset Serve, enable Funnel, alter
8443, or grant Michael broad operator access.

```sh
/usr/local/bin/tailscale serve --bg --yes --tcp=14501 tcp://127.0.0.1:14501
/usr/local/bin/tailscale serve status
```

The coordinator attempted that operation as Michael; Tailscale returned
`serve config denied`. sudo -n is unavailable. No forwarding route was added.

After this root step, resume the existing local coordinator and run its bounded
`.agent/cas-synology-container-check.mjs`: it retrieves only the public test CA
and resolves the bearer in memory through authorized SSH bootstrap, then launches
a Terra-low read-only readiness turn over actual WSS14501. No token is printed,
stored locally, placed in argv, or written to evidence. SSH is credential/setup
bootstrap, not the agent execution transport. Full production daemon credential
binding and current-candidate deployment remain separate gates.

## Exact rollback, if requested

Remove only the new route as root:
`/usr/local/bin/tailscale serve --tcp=14501 off`.
From the dedicated harness directory, run
`/usr/local/bin/docker compose -p cas-nextjs-dogfood --profile preview down`.
Keep the clone, workspace, protected secret files and image cache unless their
specific removal is authorized. Never touch existing container projects.

Status: REMOTE_CONTAINER_PREPARED / PRIVILEGED_ROUTE_REQUIRED.
Not BASE_READY or remote agent-execution acceptance.

## Re-entry result — route applied by Founder

The Founder applied the exact TCP14501 Serve route. It was independently
observed alongside the unchanged8443 route. The repository WSS registry/client
then connected with verified test CA and bearer authentication to
`wss://aes-j5-synology.taildf223c.ts.net:14501`. An unauthenticated WebSocket
upgrade returned401.

One gpt-5.6-terra low turn completed inside the NAS Ubuntu container, reporting
UID1033/GID100, x86_64, Node22.18.0, Codex0.151.0, writable /workspace, and
REMOTE_CONTAINER_READY. Thread01a07c06-25e8-75e3-8b3b-9c172bd34a3b,
turn01a07c06-265d-7402-8c02-184891742e5b.

Evidence: `.agent/diagnostics/cas-synology-container-ready.json`, SHA256
c42dbe8b411d6d2866a9a5a41eea4903f0868a6f1a681b6929dc682fc04b908f.
Postcheck: container healthy, auth0600, workspace0750, all11 original containers
still up. Client connection closed; prepared remote service intentionally stays
running. SSH was used only for credential bootstrap and operational checks;
the agent turn and its commands were issued over WSS App Server.

Current status: REMOTE_CONTAINER_READY. The prior route privilege blocker is
resolved. This verifies a real off-machine coding agent, not the final daemon
registration/workflow/delegation/UI campaign join or merge acceptance. Test TLS
renewal, production credential binding and current candidate deployment remain
explicit follow-on work.
