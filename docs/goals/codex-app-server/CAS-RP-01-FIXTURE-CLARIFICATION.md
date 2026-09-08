# CAS-RP-01 amendment 03 — synthetic native profile probe

The prohibition on home/config writes protects real user, desktop, repository
configuration, installed plugin caches, and remote hosts. It does not prohibit
isolated synthetic configuration fixtures required by this assignment's tests.

Authorized: create a uniquely named disposable directory under OS temporary
storage or .agent/testing/cas-rp-01; populate only synthetic non-secret base,
named-profile, and trusted-project fixtures. Set CODEX_HOME only in the spawned
child process environment to that directory; never change the parent environment
or actual user home. Do not copy real configuration, credentials, hooks, plugins,
or auth state into the fixture. Do not request login or run an agent/model turn.

Use pinned Codex 0.151.0 and verify supported command syntax from native help
before the probe. Initialize the isolated local App Server, read effective
configuration through the supported protocol, and record whether native profile
selection actually applies. A fixture project's trust must be declared only
inside the synthetic configuration; ignored untrusted project layers are not
proof of precedence.

Set bounded timeouts. Close protocol connections and every owned child/listener,
and remove only the exact validated temporary paths in finally, including on
spawn, handshake, or assertion failure. Record command/version, non-secret
effective values, result, and zero unexpected resource delta.

This proves only native local process-start semantics. It does not authorize
changing/restarting shared remote servers, per-thread profile claims, or new
adapter implementation outside the current lease. Return the result and exact
additional surfaces if integration requires an amendment.
