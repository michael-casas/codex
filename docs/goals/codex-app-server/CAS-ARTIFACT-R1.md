# CAS-ARTIFACT-R1 — workflow artifact access and static-site preview decision

Status: **planning_complete — Founder decision required before implementation.**

## Outcome

Recommend **Design A, authenticated workflow-scoped download/read**, as the smallest CAS-ARTIFACT-R1 MVP. Defer **Design B, executable static-site preview**, until a separate untrusted origin, viewer authentication, normalized site-file storage, and preview-specific acceptance are approved.

This plan does not weaken absolute-path redaction or Markdown URL safety. A filesystem path, relative path, `file:` URL, `[path]`, model-authored URL, or guessed mapping never becomes an artifact link. Only trusted typed metadata for a registered artifact may produce an href.

The failed demo run `workflow_da734b10cc2f3785232ccce18c3b967871627a3dcd8d48a93563ee1a18dca9a3` cannot be repaired retroactively: no artifact or persistent site was registered. Its agent node completed, then trusted export found zero candidate directories and the workflow failed before copy and `artifact()`. Historical text remains literal.

## Existing ownership and gaps

Current registration is already transactional and durable:

1. `apps/daemon/src/workflow-execution/workflow-execution-daemon.ts` derives an opaque UUID from run, artifact name, and content digest; emits `workflow.artifact.registered`; and gives the workflow a `control://<run>/artifacts/<artifactId>` handle.
2. `packages/db/src/durable-control/postgres-control-store.ts` registers the artifact inside the same transaction as its command/event.
3. `process.control_artifact` owns `artifact_id`, producing command, `stream_id`, kind/name, media type, bytes, SHA-256, and creation time. Content is nonempty and at most 20 MiB; the database verifies its digest.
4. Tables are denied to public roles. Only coordinator/daemon may register. No function reads artifact bytes.

Missing capabilities:

- no repository `readArtifact`/`listArtifacts` interface;
- no workflow/run ownership check on a read;
- no gateway or HTTP artifact route;
- no browser authentication seam for artifact bytes;
- no typed artifact metadata in the workflow view;
- no UI validator distinct from the deliberately strict Markdown URL policy;
- no multi-file static-site storage or isolated preview origin.

Raw artifact bytes must never enter workflow visibility summaries, wait responses, MCP text wrappers, logs, or durable visibility events. Safe metadata may include `{runId, artifactId, name, mediaType, bytes, sha256, createdAt, disposition, href}`.

## Design comparison

| Concern | A — scoped download/read | B — executable static-site preview |
| --- | --- | --- |
| User result | Explicit download/read of one registered artifact | Render a registered multi-file site in an isolated frame |
| Existing storage reuse | Reuse `control_artifact` unchanged | Requires normalized per-file storage or a rigorously unpacked bundle |
| Schema | Add read/list functions only | Add site manifest/file rows, limits, paths, entrypoint, MIME |
| Execution risk | Bytes do not execute; HTML/SVG forced to download | Untrusted HTML/CSS/JS intentionally executes |
| Origin | Existing authenticated viewer origin is acceptable for attachment responses | Must use a separate origin with no control API, cookies, storage authority, or inherited credentials |
| UI integration | Typed Artifacts panel; no Markdown rewrite | Trusted preview wrapper containing a sandboxed cross-origin iframe |
| Portability | Same relative URL works through local viewer and authenticated Tailscale ingress | Remote ingress, TLS, ACL, frame/CORS policy, and mobile behavior need separate design |
| MVP size | One migration, reader port, gateway route, typed metadata/UI | New storage model, collector, isolated server/origin, auth plumbing, frame policy and broader L2/L3 |
| Recommendation | **Implement first** | **Defer pending explicit Founder approval** |

## Design A — authenticated workflow-scoped download/read

### Public and internal interface

Browser metadata:

```ts
interface WorkflowArtifactSummary {
  runId: string;
  artifactId: string;
  name: string;
  mediaType: string;
  bytes: number;
  sha256: `sha256:${string}`;
  createdAt: string;
  disposition: 'attachment';
  href: `/api/control/v1/workflows/${string}/artifacts/${string}`;
}
```

The high-level owner defines a narrow reader:

```ts
interface WorkflowArtifactReader {
  list(runId: string, authorization: ControlAuthorization): Promise<readonly WorkflowArtifactSummary[]>;
  read(runId: string, artifactId: string, authorization: ControlAuthorization, signal: AbortSignal): Promise<WorkflowArtifact>;
}
```

`read` returns owned metadata plus bytes only to the HTTP adapter. The UI receives summaries, never bytes. The route accepts one canonical run ID and UUID artifact ID, no query parameters or path suffix.

### Authorization

- Require a distinct `control:artifact:read` scope; do not infer it from knowledge of a run ID.
- Verify `control_artifact.stream_id = 'workflow:' || runId` in the security-definer query. A valid artifact belonging to another run and a nonexistent artifact return the same not-found response.
- Continue host-header and Origin checks. Do not expose the daemon bearer token to JavaScript or put it in an href.
- The current anonymous loopback GET boundary is not strict application authentication. Before implementation, the Founder must declare either:
  1. existing host-local loopback plus authenticated Tailscale/viewer ingress is the admitted viewer identity boundary; or
  2. a real viewer session is required. Prefer an HttpOnly, Secure, SameSite cookie scoped to the viewer origin, minted by the authenticated ingress/composition root. Do not invent a durable token table merely for this task.
- If neither boundary is approved, the artifact route fails closed as unavailable; an opaque UUID alone is not authentication.

### Database and versioning

Do not edit live-applied migration 002 or 007. Add `migrations/process/008_control_artifact_reads.sql`:

- `process.list_control_artifacts(p_stream_id text)` returns metadata only;
- `process.read_control_artifact(p_stream_id text, p_artifact_id uuid)` returns one metadata/content row only when both identities match;
- grant execution only to coordinator and daemon; do not grant raw bytes to browser/reader/preflight/judge roles;
- retain the existing table, FK, 20 MiB bound, digest constraint and immutability.

Add `PostgresControlStore.listArtifacts/readArtifact` behind the domain-owned reader port. Preserve exact bytes and verify the returned digest before delivery even though the database constraint already verifies stored content.

### HTTP response

Support GET and HEAD. Reject Range in the MVP with 416 rather than implementing partial semantics incorrectly. The 20 MiB table limit is the maximum body; no unbounded buffering or filesystem staging.

Required headers:

```text
Content-Type: <stored allowlisted type, otherwise application/octet-stream>
Content-Disposition: attachment; filename*=UTF-8''<safe encoded name>
Content-Length: <exact bytes>
Cache-Control: private, no-store
ETag: "<sha256>"
X-Content-Type-Options: nosniff
Content-Security-Policy: sandbox; default-src 'none'
Cross-Origin-Resource-Policy: same-origin
Referrer-Policy: no-referrer
X-Frame-Options: DENY
```

HTML, SVG, JavaScript and unknown media remain attachments. Sanitize the filename independently of its display label: no separators, controls, reserved names, or extension derived from a filesystem path. Abort response work on client disconnect; do not create temporary files.

Stable errors:

| Condition | Code | HTTP |
| --- | --- | ---: |
| malformed run/artifact/path/query | `CONTROL_ARTIFACT_REQUEST_INVALID` | 400 |
| missing viewer identity/scope | `CONTROL_ARTIFACT_UNAUTHORIZED` | 403 |
| missing artifact or wrong run | `CONTROL_ARTIFACT_NOT_FOUND` | 404 |
| unsupported Range | `CONTROL_ARTIFACT_RANGE_UNSUPPORTED` | 416 |
| digest/storage corruption | `CONTROL_ARTIFACT_INTEGRITY` | 500 |
| reader unavailable | `CONTROL_ARTIFACT_UNAVAILABLE` | 503 |

Do not disclose whether another run owns an ID.

### Visibility and UI

Expose metadata through a workflow-scoped artifact-list query or trusted workflow summary adapter. Do not put content in source replay or visibility rows. Avoid N+1 reads on the active workflow list; fetch artifact metadata only for an explicit workflow/detail view, or batch by the visible run IDs with a hard page bound.

Render typed metadata in an Artifacts section. `safeMarkdownUrl` remains unchanged and continues rejecting every relative/control/filesystem URL. A separate `safeArtifactHref(runId, artifactId, href)` accepts only the exact generated same-origin route. If metadata is missing or invalid, show a non-link label—not `href="#"`.

The current final Markdown `[site]([path])` stays literal. Inline artifact linking may be added later only through an explicit typed artifact-reference token tied to backend metadata. Never correlate text labels, paths, order, or guessed filenames.

### Lifecycle and cleanup

- Registration remains atomic with the durable event and survives daemon/browser restart.
- Reads are read-only and do not emit process events or mutate acceptance state.
- Workflow/lease cleanup never deletes durable artifacts. No deletion or retention policy is added in R1.
- Client abort closes the response/query work; no file, socket or timer remains.
- Test fixtures drop only their owned database/roles and stop owned listeners/servers with zero resource delta.

## Design B — executable static-site preview

Design B is not “serve the filesystem path.” It is a new untrusted-content delivery subsystem.

### Registration and storage

Prefer normalized immutable rows over extracting a zip on each request:

- one site manifest linked to the existing artifact/run;
- at most 256 regular files;
- at most 2 MiB per file and 20 MiB total uncompressed bytes;
- one required `index.html` entrypoint;
- canonical POSIX relative paths, at most 512 UTF-8 bytes;
- reject absolute paths, empty/dot/dot-dot segments, backslashes, controls, percent-decoding ambiguity, duplicate paths and special files;
- collector uses `lstat`/`realpath`, rejects symlinks and traversal, and reads only a verified build-output directory beneath the owned lease;
- fixed extension-to-MIME mapping; supplied MIME never grants execution.

If A ships first, B requires a later additive `009_static_site_artifacts.sql`. If the Founder selects B before A implementation, one coherent 008 may own both metadata and normalized files. Never rewrite an applied migration.

### Origin and browser isolation

Never execute generated content on the control origin. A generated script on `127.0.0.1:4765` would be same-origin with control reads and future viewer state regardless of response CSP.

Use a dedicated preview origin/port with:

- no control API routes, cookies, local storage authority, service credentials or inherited auth tokens;
- authentication/capability validated before resolving artifact content;
- trusted control-origin wrapper containing a cross-origin iframe with `sandbox="allow-scripts"`, without `allow-same-origin`, forms, popups, downloads or top navigation;
- preview CSP: `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'none'; worker-src 'none'; object-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'`;
- strict CORP/CORS sufficient only for sandboxed module assets; never credentialed wildcard CORS;
- `Cache-Control: private, max-age=31536000, immutable` for digest-addressed files and `no-store` for wrapper/auth responses.

Tailscale/mobile exposure is a separate gate. Use a distinct authenticated ingress and ACL; do not silently proxy the preview through port 9443 or listen beyond loopback. Relative artifact hrefs remain portable, but the UI must receive an authorized preview origin. Mobile must show size before loading and offer download fallback.

### Preview-specific failures

Use stable errors including `CONTROL_SITE_INVALID`, `CONTROL_SITE_LIMIT`, `CONTROL_SITE_MEDIA_UNSUPPORTED`, `CONTROL_SITE_NOT_FOUND`, `CONTROL_SITE_ORIGIN_UNAVAILABLE` and `CONTROL_SITE_UNAUTHORIZED`. Invalid decoded paths return a generic 404 at the serving boundary and never reach filesystem resolution.

### Lifecycle and cleanup

Persist normalized bytes; do not keep extracted directories. Preview-server start/stop owns its listener and in-flight responses. Artifact retention remains durable and independent of ephemeral lease cleanup. A preview cannot outlive authorization merely because its immutable assets are cached.

## BATDD contract proposal

### Design A MVP

| ID | Layer | Meaningful RED / GREEN |
| --- | --- | --- |
| `ART1-L1-READ-AUTH` | L1 | RED: no reader policy. GREEN: exact run/artifact/scope accepted; malformed, wrong-run and missing identities fail without existence disclosure. |
| `ART1-L1-HEADERS` | L1 | RED: no response policy. GREEN: media/filename/disposition/CSP/cache/range headers are total and bounded. |
| `ART1-L1-HREF` | L1 | RED: typed href policy absent. GREEN: only backend-generated exact route accepted; path, relative, file, JavaScript, data, credentials, query and traversal rejected; Markdown policy unchanged. |
| `ART1-L2-POSTGRES` | L2 | RED: no read functions. GREEN: atomic registered bytes survive restart; daemon reads matching run; wrong-run/missing return same result; reader role denied; exact digest and 20 MiB limits hold. |
| `ART1-L2-HTTP` | L2 | RED: route is 404. GREEN: authenticated GET/HEAD returns exact bytes/headers; missing scope/wrong Origin/wrong run/Range/abort fail safely; snapshot/wait never contains bytes. |
| `BATDD-ART1-DOWNLOAD` | L3 Web | RED: registered artifact has no actionable UI link. GREEN: desktop/mobile explicit workflow view shows one typed download, native browser receives expected name/hash/headers, raw filesystem Markdown stays literal, restart preserves link, fixture cleanup is zero. |

### Design B, only if approved

| ID | Layer | Meaningful RED / GREEN |
| --- | --- | --- |
| `ART1-L1-SITE-MANIFEST` | L1 | RED: no site contract. GREEN: canonical paths/MIME/entrypoint/count/per-file/aggregate limits reject traversal, encoded ambiguity, duplicates, symlinks and special files. |
| `ART1-L2-SITE-STORE` | L2 | RED: no normalized rows. GREEN: manifest/files persist atomically, digest replay is stable and conflicts overwrite nothing. |
| `ART1-L2-PREVIEW-ORIGIN` | L2 Web | RED: no isolated origin. GREEN: generated JS cannot call control API, read viewer credentials/storage, fetch network, navigate parent, open popups, create workers or escape its artifact. |
| `BATDD-ART1-PREVIEW` | L3 Web | RED: preview unavailable. GREEN: authenticated desktop/mobile wrapper renders HTML/CSS/JS and relative assets in sandbox, with download fallback, restart persistence and zero listener/temp/database delta. |

Representative L3 remains small; exhaustive path/media/auth/size matrices belong to L1/L2. All new native rows require meaningful RED, freeze, affected Nx execution and independent verification.

## Projects and write owners

- `migrations/process/008_control_artifact_reads.sql` — process-schema/database owner.
- `packages/process` — artifact reader/application authorization contract and stable errors.
- `packages/db` — PostgreSQL reader implementation and isolated L2.
- `packages/control-gateway` — metadata/content HTTP adapters and header/path policy.
- `apps/daemon` — composition with existing workflow store; no second artifact authority.
- `apps/codex-control-ui` — typed Artifact panel and exact generated-href validator.
- `apps/codex-control-e2e` — physical Gherkin plus Playwright desktop/mobile.
- `packages/testing` — affected manifest/evidence only when selected by repository profile.

Preview additionally requires an explicitly owned isolated preview delivery component and, if A has shipped, migration 009. Do not hide it in the existing viewer static-asset handler.

## Exact Founder decision

Before dispatch, the Founder must decide:

1. **Approve A as the CAS-ARTIFACT-R1 MVP?** Recommended: yes.
2. **What authenticates local/browser artifact GET?** Choose existing host-local + authenticated Tailscale ingress as the admitted boundary, or authorize viewer-session cookie work. Without one, route stays unavailable.
3. **Defer B to a separate executable-preview feature?** Recommended: yes. If no, approve separate-origin/port, session/ingress authentication, normalized-file schema, limits and sandbox acceptance above.
4. **What will the next demo register?** Recommended: one bounded self-contained HTML download or archive first. Multi-file executable preview requires B; do not promise it under A.

No implementation, test, migration, dependency, runtime or database mutation is authorized by this plan. Stop: `planning_complete`.
