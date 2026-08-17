# React Native optimization router

Profile before changing performance-sensitive code.

1. Define the symptom, scenario, primary metric, and meaningful threshold.
2. Record a reproducible interaction flow when the scenario has multiple actions.
3. Use React Native profiling for renders, commits, cascades, and JavaScript CPU.
4. Use native profiling for native CPU, hangs, stacks, memory, and leaks.
5. Run both concurrently when the boundary is unclear, then use the combined correlation report when available.
6. Investigate to a concrete component/function/path before implementing.
7. Apply the smallest justified fix and re-profile the identical scenario.
8. Report improvement, noise, no change, regression, and cross-metric tradeoffs honestly.

Do not prescribe `memo`, `useMemo`, or `useCallback` mechanically, especially when React Compiler is active. Repository lint and semantic correctness remain gates; optimization cannot weaken behavior.

Provenance: curated from Casona `argent-react-native-optimization` and its fix, lint, and semantic references.
