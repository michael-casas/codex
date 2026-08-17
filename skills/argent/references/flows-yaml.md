# Flow YAML

Read this reference when composing or reviewing Argent flow YAML.

Keep each step explicit and ordered. Prefer semantic selectors that remain stable across account data, time, counts, ordering, locale, and supported environments. Use relational scopes only to disambiguate repeated elements inside a stable container.

An echo records context, not behavior or a verdict. A screenshot is human evidence, not an executable assertion. Use executable await/assert operations for structural requirements and planned snapshots only for deterministic pixel requirements.

Every screen transition requires both:

- destination identity, using a screen-specific stable element;
- readiness, using the flow's idle/readiness mechanism after identity.

Treat warnings as unresolved evidence until their exact cause is understood. Do not weaken selectors, assertions, or timeouts merely to obtain green output.

Provenance: curated from Casona `argent-create-flow/references/flow-yaml.md`.
