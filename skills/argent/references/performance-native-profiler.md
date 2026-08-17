# Native profiler

Use for native CPU hotspots, UI hangs, thread stacks, memory growth, and leaks. The implementation may use Instruments/xctrace on iOS and Perfetto on Android; verify current tool support first.

Define the exact device, scenario, duration, and metric. Start collection before the interaction, reproduce the scoped path once, stop promptly, and analyze the trace. Query hot functions, callers/callees, hang stacks, thread breakdown, or leak stacks until the result points to an actionable native path.

When the symptom crosses the JS/native boundary, run React and native profiling over the same device and scenario and correlate their timelines. Re-profile after every performance fix. Do not interpret profiler instrumentation overhead as product work.

Provenance: curated from Casona `argent-native-profiler`.
