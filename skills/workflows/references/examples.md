# Tested examples

## Direct TypeScript

Canonical source and input:

- `/Users/mcasa_atlantis/.codex/orchestration/apps/codex-workflows/examples/nestjs-resolver-factory-research.workflow.ts`
- `/Users/mcasa_atlantis/.codex/orchestration/apps/codex-workflows/examples/nestjs-resolver-factory-research.input.json`

From the workspace root:

```sh
chmod +x apps/codex-workflows/examples/nestjs-resolver-factory-research.workflow.ts
./apps/codex-workflows/examples/nestjs-resolver-factory-research.workflow.ts \
  --input apps/codex-workflows/examples/nestjs-resolver-factory-research.input.json \
  --json
```

The workflow starts two `gpt-5.6-luna` medium official-source researchers in
parallel, passes both actual string outputs to a `gpt-5.6-luna` medium
consolidator, and persists `resolver-factory-proposal.md` as a local workflow
artifact. Luna is this example's explicit choice, not a runtime allowlist; any
bounded, non-whitespace `gpt-*` model token is forwarded unchanged and no
substitution occurs.

Inspect without agents:

```sh
codex-workflows apps/codex-workflows/examples/nestjs-resolver-factory-research.workflow.ts \
  --plan \
  --input apps/codex-workflows/examples/nestjs-resolver-factory-research.input.json \
  --json
```

This imports trusted local module code but does not call the workflow callback
or SDK.

## JSON compatibility

Canonical pair:

- `/Users/mcasa_atlantis/.codex/orchestration/apps/codex-workflows/examples/canonical-review.workflow.json`
- `/Users/mcasa_atlantis/.codex/orchestration/apps/codex-workflows/examples/canonical-review.input.json`

```sh
codex-workflows validate apps/codex-workflows/examples/canonical-review.workflow.json --input apps/codex-workflows/examples/canonical-review.input.json --json
codex-workflows inspect apps/codex-workflows/examples/canonical-review.workflow.json --json
codex-workflows plan apps/codex-workflows/examples/canonical-review.workflow.json --input apps/codex-workflows/examples/canonical-review.input.json --json
codex-workflows dry-run apps/codex-workflows/examples/canonical-review.workflow.json --input apps/codex-workflows/examples/canonical-review.input.json --json
```

Do not present JSON `run` or run-ID control as successful local execution;
those commands intentionally return exit 69.
