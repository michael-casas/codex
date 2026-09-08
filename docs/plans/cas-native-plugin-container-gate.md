# CAS native-plugin clean-install release gate

Founder-required on 2026-09-07. Status: RUNTIME PROOF PASSED. Blocks promotion
from CAS/CAS-BASE to CAS/integration even if existing release gates pass.

Completed evidence: fresh-container native install/skill and nine-tool discovery,
authenticated snapshot invocation, restart/reinstall, and one Terra-low agent
invocation passed. Reproducible Nx native-plugin-smoke and native-plugin-live
targets passed again on the release candidate. This gate does not by itself
certify the remaining release gates or branch promotions.

## Outcome

A fresh non-root Ubuntu container with a clean Codex home installs the exact
release plugin through Codex's native marketplace/plugin commands. A fresh
Codex session discovers its skill and MCP tools and successfully invokes an
installed Codex Control tool against an explicitly configured test backend.
Starting dist/server.mjs directly or copying host plugin caches is not proof.

## Minimal executable proof

1. Reuse the existing apps/daemon/docker-dogfood Ubuntu/Bun infrastructure,
   with an isolated Compose project and non-conflicting loopback ports. Pin the
   candidate revision, package digest, Codex version and Bun version. Inspect
   plugin command support in the container's pinned CLI before installation.
2. Start with no installed plugins, host config, host skills or host cache.
   Supply only the built distribution/marketplace and required runtime assets;
   no monorepo node_modules or source-path fallback. Build outside the clean
   consumer boundary through the plugin's canonical Nx build target.
3. Run native marketplace registration and plugin installation, then inspect
   the installed identity, cache contents, skill and MCP entry point. Resolve
   actual CLI syntax through --help; do not fabricate installation flags.
4. Supply documented backend connection settings through protected runtime
   inputs. The current MCP manifest requires CODEX_CONTROL_ORIGIN,
   CODEX_CONTROL_TOKEN_FILE and CODEX_CONTROL_ACTOR_AGENT_ID. Container loopback
   is not host loopback. Missing prerequisites must fail clearly, not silently
   use an existing developer session or spawn another managed host registry.
5. Start one fresh Codex session after installation. Use one gpt-5.6-terra low
   read-only test turn to discover/use the installed skill and invoke an actual
   read-only Codex Control operation. Capture tool invocation and result,
   not merely model claims. No nested model agents or paid retries. Any further
   live launch test needs a separately stated bounded budget.
6. Restart the test Codex process and prove plugin discovery persists within
   the test installation; remove/reinstall the plugin through native commands
   without host-cache dependence. These checks need no further model turn.
7. If a viewer link is returned, verify the host-accessible view separately.
   Container CLI installation cannot prove Desktop in-app browser integration;
   existing desktop/mobile evidence remains a separate required boundary.
8. Record actual command exits, candidate/install digests, versions, discovered
   tools, observed invocation, credential redaction and owned-resource cleanup.
   Remove only this test's containers/network/runtime secrets; retain evidence.

## Security and stop

Copy only authorized auth.json into an owner-only temporary runtime home, as
in the earlier harness: non-root owner, directory0700/file0600, no image layer,
argv, report or log secrets. Never mount the Docker socket or use privileged
mode. Do not publish a public marketplace or change host plugins/config.

Stop with an exact blocker for unsupported pinned CLI plugin commands,
nonportable package paths, missing packaged dependencies, backend auth/origin
configuration, or unsuccessful native tool discovery/invocation. Do not weaken
the gate to manifest validation or an independently launched MCP process.

References: plugins/codex-control/.codex-plugin/plugin.json,
plugins/codex-control/.mcp.json, apps/daemon/docker-dogfood/README.md,
https://developers.openai.com/plugins/build/plugins.
