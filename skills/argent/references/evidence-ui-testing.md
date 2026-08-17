# Interactive UI testing

Use for a one-off manual QA path or visible-state inspection. Use flow authoring for a reusable path and QA regression flows for acceptance criteria.

Treat any code change affecting visible mobile layout, styling, copy, navigation, or screen composition as requiring a UI-capable validation path in addition to repository-defined automated gates.

For each action:

1. Establish the starting screen and target device.
2. Discover the target structurally.
3. Perform one interaction.
4. Await a trustworthy resulting element or state.
5. Inspect structural evidence and, when the claim is visual, capture visual evidence.

Choose evidence that discriminates the claim. Navigation needs destination identity; state changes need new state and, where material, old-state absence; pixel claims need screenshot inspection/diff; runtime claims need logs or debugger evidence.

Interactive evidence does not replace repository-defined L1/L2/L3, BATDD, or independent acceptance. Do not describe screenshot inspection alone as feature completion.

Provenance: curated from Casona `argent-test-ui-flow`.
