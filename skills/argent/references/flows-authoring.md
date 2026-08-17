# Flow authoring

Use for a reusable `.argent/flows/<name>.yaml` interaction path.

Choose this path before the first launch or in-app action. Recording cannot reconstruct an already-completed walkthrough.

1. Choose `e2e` when the flow owns launch; choose `fragment` only with a precise execution prerequisite.
2. Start recording before the first launch or in-app action. Never reconstruct a rehearsed walkthrough retroactively.
3. Record one verified action/check at a time when its state appears.
4. Prefer stable identifiers, then stable labels/text. Resolve raw coordinate warnings immediately.
5. After each navigation, prove destination identity and then readiness. Stillness alone is insufficient.
6. Polish only behavior actually executed. Do not add stronger unobserved assertions to YAML.
7. Audit and replay the final flow end to end.

Before repeating three or more interactions, record the path so subsequent runs are reproducible unless the user explicitly wants a one-off inspection. For acceptance-driven regression, also read `flows-qa-regression.md`.

Provenance: curated from Casona `argent-create-flow` and its live-authoring reference.
