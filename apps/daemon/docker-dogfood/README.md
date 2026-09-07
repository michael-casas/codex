# Ubuntu App Server / Next.js dogfood

Explicit paid test: one gpt-5.6-terra low agent. Ubuntu24.04, Node22.18.0,
Codex0.151.0, Bun1.4.2, Next16.3.4 and React19.2.8. Docker Desktop or Linux Docker/Compose,
Bun workspace dependencies and existing owner-only ~/.codex/auth.json required.

Run from the repository through Nx:

```sh
bun nx run @codex/daemon:docker-dogfood --args=prepare
bun nx run @codex/daemon:docker-dogfood --args=up
bun nx run @codex/daemon:docker-dogfood --args=agent
bun nx run @codex/daemon:docker-dogfood --args=serve
bun nx run @codex/daemon:docker-dogfood --args=status
# Inspect http://127.0.0.1:13000 in Firefox MCP; click Run check -> Check passed.
bun nx run @codex/daemon:docker-dogfood --args=close
```

The host ~/.codex is mounted read-only at /mnt/host-codex. Only auth.json is
copied to a private tmpfs Codex home inside the container, owned by nonroot codex
and mode0600. It never enters an image layer. A separate bind mount preserves
the generated project at .agent/artifacts/cas-docker-nextjs/app. Dependencies
are installed with Bun before the paid agent; bun.lock preserves resolution.
Existing package-lock.json inputs can be migrated by Bun on the first install;
subsequent runs use bun install --frozen-lockfile. Historical evidence is retained.
Host configuration/plugins are not blindly applied on Linux.

Nginx terminates verified test TLS on4501, proxying to authenticated App Server
on container loopback4500. Host ports14501 and13000 bind only127.0.0.1. The
repository's WSS bridge/client executes thread/start and turn/start; Docker
exec is used only for dependency setup. No Codex SDK or SSH executes the agent.
The nonroot agent has container-level workspace execution permission; Docker
is the isolation boundary, and no host Docker socket or privileged mode exists.

BATDD sequence: absent app is initial RED; implement via actual agent; require
completed turn, successful Next production build, exact health response, live
Firefox heading and client interaction GREEN. HTTP alone is not browser proof.
Do not rerun agent automatically on ambiguous delivery; inspect agent-result
and retained source first. Agent timeout is15min with interrupt/close attempts.
The preview Compose service owns bun run start after the agent finishes. A nohup
process started by an App Server tool may be reaped when the turn ends; it is
not a durable preview supervisor. The preview has no credentials or home mount.
Close destroys the owned containers/network and temporary capability/TLS files;
tmpfs auth disappears. Image cache and source/evidence remain for reuse.
For real remote machines use a trusted DNS certificate, a secure credential
resolver, explicitly authorized repository mounts and appropriately restricted
ingress; do not publicly expose this test container configuration.

For a NAS using the legacy Docker builder, architecture falls back to Ubuntu's
dpkg architecture when TARGETARCH is absent. Set CAS_RUNTIME_UID and
CAS_RUNTIME_GID to the host workspace owner's numeric IDs before building;
defaults remain1100:1100. CAS_BIND_IP defaults to loopback. For an explicitly
authorized remote tailnet test, bind only the device's Tailscale IP and issue
a test certificate containing that DNS/IP identity. A7-day test certificate
is not a managed production TLS deployment.
