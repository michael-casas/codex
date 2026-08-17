# Argent Lens — experimental

Use only when the user explicitly requests human selection among visual alternatives and the Lens feature and operations pass preflight. The feature may be disabled by default; enabling it is a configuration mutation and requires user authority.

Plan at least two genuinely distinct variants per element. For each variant: implement it, render it on the target device, navigate to it, capture a unique real screenshot, stage it with a stable element matcher, then revert before producing the next variant. Never propose an unbuilt mockup or reuse an identical capture.

After staging the complete round, invoke the blocking selection operation once. Apply selected variants and address element annotations and global comments. Treat pending selection as pending, not failure.

Do not enable the feature flag, mutate application code, or open a human-selection round unless those actions are within the user's request. Keep Lens outside default mobile development and QA routes.

Provenance: curated from Casona `argent-lens`.
