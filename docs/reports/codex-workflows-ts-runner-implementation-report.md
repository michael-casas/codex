# Codex Workflows direct TypeScript runner implementation report

**Implementation identity:** fresh implementation Worker  
**Date:** 2026-08-08  
**Additive contract:** `CDX-WF-GC-2`  
**Amended contract digest:**
`sha256:093013c0fea515676e9096692ed59f7b190456c7f9adb38c413e64c31d56eba5`  
**Current-disk candidate:** 92 included paths,
`sha256:1d4c09fd9657bb4aa9c020b785deb6a9bfb4c097bcdffea4559000daa1c436ef`  
**Machine evidence SHA-256:**
`40398729a62e3c4ce195d935e1b3e55a5a2819087804c425b123d90a885dfd20`  
**Authority boundary:** implementer evidence only; no independent Preflight,
verification, judgment, acceptance, or score

## Outcome

The current candidate implements `codex-workflows` as the interpreter and
local runner for trusted executable TypeScript. A source whose first line is
exactly `#!/usr/bin/env -S codex-workflows` runs through all three settled
forms:

```sh
./workflow.ts
codex-workflows workflow.ts
codex-workflows run workflow.ts
```

No author-authored JavaScript or JSON compilation step and no user-visible
TypeScript loader is required. JSON validate, inspect, plan, dry-run, and
read-only `.pi` import compatibility remain intact. JSON run and run-ID
resume/status/events/logs/cancel continue to fail closed with exit 69 because
the distinct cross-process durable control plane is not implemented.

The Founder model override is applied throughout every launch-capable
`codex-workflows` test and dogfood surface: every researcher, consolidator,
schema, failure, and cancellation agent requests exact `gpt-5.6-luna` with
`medium` reasoning. No substitution path exists.

## Required hydration and procedure

Before product writes, this identity read the root instructions and nearest
README, BATDD Worker contract/profile, repository TESTING profile,
SPEC/ARCHITECTURE/PLAN, every existing implementation/audit/repair report, and
the current dirty candidate. The Agent Wiki index and doctor were healthy; the
canonical orchestration SPEC and relevant TESTING, BATDD, AUDIT,
ORCHESTRATION, GHERKIN, and ROLES standards were read without Wiki mutation.

The required `workflows`, `batdd`, `nx-monorepo`, `nx-workspace`,
`nx-run-tasks`, `link-workspace-packages`, `skill-creator`, `agent-wiki`, and
`openai-docs` procedures were invoked. No new Nx project was required, so no
generator was used. The global `data-substrate` skill referenced by workspace
instructions was not available in the configured skill catalog; no database,
credential path, or substitute state authority was invented.

## BATDD contract and RED

The additive contract is
`packages/testing/evidence/codex-workflows-ts-runner-green-contract.json`.
Original `/contract` digest
`sha256:7958f4d8eb62db53cf986dedd909fe1ca3484d4f513f626f98307e3f7a2a7d7e`
is retained as historical. The Founder Luna-only amendment has the current
canonical `/contract` digest shown above. The contract artifact preserves
pre-amendment file hashes, the override ruling, test corrections, GREEN,
dogfood, and historical-run treatment.

Meaningful original RED was captured before product implementation:

| Target                                |               Selected | Prior GREEN | New RED | Decisive missing behavior                                           |
| ------------------------------------- | ---------------------: | ----------: | ------: | ------------------------------------------------------------------- |
| `workflows:test-l1-unit`              |                     15 |          13 |       2 | Public authoring/runtime exports absent                             |
| `workflows:test-l1-integration`       |                     11 |           8 |       3 | Scheduler, schema, cancellation, dataflow, phases, artifacts absent |
| `codex-workflows:test-l1-unit`        |                      8 |           6 |       2 | Bare TS parse and runtime exit mapping absent                       |
| `codex-workflows:test-l1-integration` |                      1 |           0 |       1 | Journal absent                                                      |
| `codex-workflows:test-l2-integration` |                      6 |           2 |       4 | Direct loader/runner and controlled SDK behavior absent             |
| `codex-workflows:test-l2-e2e`         |                      3 |           2 |       1 | Literal shebang dispatch returned usage 64                          |
| `codex-workflows:test-l3`             | 5 scenarios / 28 steps |      3 / 22 |   2 / 2 | Direct execution and inspection unavailable                         |

After the Founder override, `TS-GC2-016` selected one static real-filesystem
policy test and failed on the intended forbidden Sol declaration with exit 1
and zero agent launches. The contract records every non-semantic JSON traversal,
regex, lint, testing-marker, and formatting correction with before/after test
hashes; broken/intermediate fixture failures are explicitly excluded from RED.

## Implemented public API and runtime

`packages/workflows/src/authoring/` adds:

- `defineWorkflow<Input, Output>` with validated, frozen stable metadata;
- `phase(name, callback)` for observable progress grouping only;
- `parallel(recordOrArray)` with eager ready-sibling start and preserved
  record/array result shape;
- `agent<Output, Input>` with explicit label/model/reasoning/prompt, typed
  input, and optional JSON output schema;
- `artifact(name, valueOrOptions)` with typed metadata; and
- `executeWorkflow` as the injected deterministic process-local runtime seam.

The scheduler enforces `maxConcurrency`, freezes stable digest-only node state
before launch, derives dependency lineage from actual upstream output values,
passes those values to downstream private turns, enforces structured output,
propagates first failure, aborts active and queued siblings, and uninstalls its
runtime bridge in `finally`.

## Interpreter, SDK, and journal composition

`apps/codex-workflows/src/source/typescript.ts` admits only a bounded,
root-contained, regular `.ts` file with the exact shebang. It bundles the
trusted module internally to an OS temporary directory, imports a default
`defineWorkflow(...)` export, and removes the temporary directory.

`apps/codex-workflows/src/runtime/local-runner.ts` creates a stable local run
ID/journal, initializes only the public `@orchestration/codex` facade, forwards
model/reasoning/schema/signal, and shuts the SDK host down in `finally`.
Failure, schema rejection, and cancellation map to exits 67, 68, and 130.

`apps/codex-workflows/src/runtime/journal.ts` writes atomically under
`~/.codex/workflows/runs/<run-id>` by default, or the bounded
`CODEX_WORKFLOWS_HOME` override used by tests. It bounds nodes, events,
artifact bytes, names, source bytes, and input bytes. Nodes record freeze,
start, and terminal timing/outcome. Prompts, inputs, environment values,
secrets, stacks, and raw errors are redacted. Artifacts are intentional private
run content and are written atomically beneath `artifacts/`.

Only `packages/codex/src/runtime/adapter.ts` imports
`@openai/codex-sdk`. The Codex package now emits an external runtime build so
the SDK preserves its own `import.meta.url` and resolves its pinned Codex
binary. The app build depends on that emission and externalizes the package.

The package-owned Bun link resolves in normal PATH as:

```text
/Users/mcasa_atlantis/.bun/bin/codex-workflows
  -> ../install/global/node_modules/@orchestration/codex-workflows/dist/main.js
```

No shell configuration changed.

## Founder Luna-only reconciliation

The following launch-capable surfaces contain only exact Luna/medium agent
declarations:

- `apps/codex-workflows/examples/nestjs-resolver-factory-research.workflow.ts`
- `apps/codex-workflows/src/workflows/support/controlled.workflow.fixture.txt`
- `packages/workflows/src/authoring/authoring.test.ts`
- real SDK trace assertions and Cucumber behavior under
  `apps/codex-workflows/src/workflows/`
- the retained NestJS JSON compatibility example's allowed model and all Codex
  handlers

Repository and global-skill searches found no forbidden Sol declaration on an
app, workflow, or skill launch surface. The two remaining repository mentions
of `gpt-5.6-sol` are deliberately historical RED descriptions inside the
contract artifact.

## Mandatory live dogfood

Literal public command:

```sh
./apps/codex-workflows/examples/nestjs-resolver-factory-research.workflow.ts \
  --input apps/codex-workflows/examples/nestjs-resolver-factory-research.input.json \
  --json
```

Result:

- exit 0;
- run ID `local-20260808t125616824z-ddeb26e89a89`;
- journal:
  `/Users/mcasa_atlantis/.codex/workflows/runs/local-20260808t125616824z-ddeb26e89a89/journal.json`;
- final proposal:
  `/Users/mcasa_atlantis/.codex/workflows/runs/local-20260808t125616824z-ddeb26e89a89/artifacts/resolver-factory-proposal.md`;
- proposal SHA-256
  `4ad3fb16096eaef505de1806987864d027d598a1b09df2fa53128249dede055f`;
- 39,373 bytes and 594 lines.

Both researchers froze and started at `2026-08-08T12:56:16.835Z` under the
bound of two. They completed in 158,720 ms and 181,811 ms. The consolidator
froze only after both results existed, recorded both exact researcher node IDs
as dependencies, carried a distinct combined actual-value input digest, and
completed in 148,592 ms. All three journal nodes and all observed SDK argv
requested exact `gpt-5.6-luna` and `medium`; the consolidator also forwarded
the output schema. The journal contains 16 public events, one artifact, and no
raw prompt/input/environment/error probe string.

Historical live evidence is preserved rather than rewritten:

- `local-20260808t123921188z-4ef1f17c7cb2` failed before any node because the
  first bundled SDK host could not resolve its executable;
- `local-20260808t124143824z-cc74a742bd23` ended outside journal finalization
  before the Founder override, remains honestly `running`, contains only two
  started Luna researchers, and contains no consolidator/Sol node; and
- the completed amended run above is the Luna-only dogfood proof.

## Validation evidence

All listed final commands ran through `bun nx` and exited 0 unless they are the
explicit historical RED above.

| Gate                         | Final evidence                                                                                                                            |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Product lint/typecheck/build | `run-many` over workflows, codex, and app passed all targets uncached                                                                     |
| Workflow aggregate           | status passed; L1 selected 15 unit + 11 integration                                                                                       |
| Codex aggregate              | status passed; selected 16 unit + 7 integration + 6 real SDK integration                                                                  |
| App aggregate                | status passed; selected 8 unit + 1 journal + 7 L2 integration + 3 E2E + 5 L3 scenarios                                                    |
| Canonical L3                 | 5 scenarios and 28 steps passed                                                                                                           |
| Ground-0 aggregate           | 21 unit + 3 integration + 24 L2 integration + 2 E2E + 1 scenario/6 steps passed                                                           |
| Testing policy               | 21 files and 7 standing targets passed                                                                                                    |
| SDK imports                  | exactly one allowed production import; zero offenders                                                                                     |
| Affected closure             | four projects selected; all lint/typecheck/build/test tasks passed uncached                                                               |
| Nx graph                     | app has only static edges to workflows and codex; both packages have no project dependencies                                              |
| Sync/format                  | sync clean; exact candidate format check clean                                                                                            |
| Skill                        | `quick_validate.py` returned `Skill is valid!`                                                                                            |
| PATH/interpreter             | normal PATH resolves the linked bin; literal shebang E2E and live dogfood pass                                                            |
| Resources                    | zero controlled children, app CLI children, direct-runner temp roots, internal TS temp roots, dogfood runner, and journal temporary files |
| Immutability                 | `.pi` and both prior external-audit SHA-256 values match hydration baselines                                                              |

Machine-readable aggregate outputs are:

- `test-output/codex-workflows/workflows.json`
- `test-output/codex-workflows/codex.json`
- `test-output/codex-workflows/codex-workflows.json`
- `test-output/ground-zero/testing.json`
- `test-output/cucumber/codex-workflows.json`
- `test-output/cucumber/ground-zero.json`

The final bounded machine evidence is
`packages/testing/evidence/codex-workflows-ts-runner-reproof.json`, SHA-256
`40398729a62e3c4ce195d935e1b3e55a5a2819087804c425b123d90a885dfd20`.

## Documentation and skill

`README.md`, `SPEC.md`, `ARCHITECTURE.md`, `PLAN.md`, the app CLI contract,
workflow API/schema contract, TypeScript/JSON examples, and every file under
`/Users/mcasa_atlantis/.codex/skills/workflows/` now route trusted direct
TypeScript accurately. TypeScript dry-run reports a trusted module-load effect
instead of falsely claiming zero local effects.

## Honest limitations

- Trusted TypeScript import is local code execution even for inspection. It is
  not a sandbox.
- The current local SDK host policy uses approval `never`, workspace-write,
  live network/web search, and the invocation working directory. The source and
  agent prompts must therefore be trusted.
- A journal is bounded per run but no retention/pruning authority is invented.
  Abrupt process death outside the signal/finalizer path can leave `running`.
- Local run IDs cannot be resumed, queried, streamed, or cancelled from a
  second process. Those verbs remain exit 69.
- A dynamic TypeScript graph is known only as the callback executes; plan and
  dry-run expose definition metadata and launch zero agents, not a fabricated
  complete graph.
- Final workflow output is intentionally returned to the invoking user and
  artifact content is intentionally persisted; the public-event/journal
  redaction guarantee does not make declared output content non-sensitive.
- The live research proposal is time-specific model output and implementation
  evidence, not an accepted NestJS product design or independent source audit.
- This report is self-authored and confers no independent acceptance.
