# Screenshot diff

Use screenshot diffing for stable pixel-visible questions: layout, spacing, size, color, typography, clipping, overflow, and image/icon rendering.

1. Reach a deterministic known-good state.
2. Capture a full-resolution baseline without loading the full image into context.
3. Apply the interaction or code change and reach the settled comparison state.
4. Capture/compare the current screen using exactly one input per side.
5. Inspect the summary and artifacts alongside normal visual and structural evidence.

Do not use diffs for coordinate discovery or as proof of semantic state, navigation, accessibility, logs, network behavior, or interaction success. Avoid claiming useful comparison when timestamps, animations, random content, ads, or other uncontrolled pixels dominate.

Provenance: curated from Casona `argent-screenshot-diff`.
