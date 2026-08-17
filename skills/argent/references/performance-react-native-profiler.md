# React Native profiler

Use for React render behavior, commit duration, cascades, render counts, and JavaScript CPU work.

Establish a connected React runtime and consistent device identity. Start profiling before the scenario and retain server-provided timestamps. Annotate each interaction using its returned timestamp relative to the profiler start; do not substitute local wall-clock time.

Stop and analyze the session, checking build mode, Strict Mode, React Compiler state, captured render count, and profiler overhead. Use commit, CPU, component-source, and cascade queries to move from a slow interval to a concrete function or source path.

After a fix, replay the same scenario and compare the same metrics. Treat small variations as possible noise and disclose changing API data or other confounders. If both React and native profilers ran, produce the combined correlation report.

Provenance: curated from Casona `argent-react-native-profiler` and its diagnostic-tools reference.
