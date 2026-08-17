# Metro and CDP debugging

Use for React Native runtime connection, component/source inspection, console logs, JavaScript evaluation, and supported network inspection.

1. Confirm Metro is reachable at the repository-declared port.
2. Confirm the target app is attached. On Android, verify adb reverse for that port.
3. Connect with the exact device identity. If the debugger returns a logical device identifier, use it consistently for subsequent calls and teardown.
4. Use status before recovery: distinguish Metro absent, no app attached, device mismatch, stale connection, and unresponsive runtime.
5. Use the component tree for layout/target discovery and element inspection for source tracing.
6. Use the log registry to locate bounded log artifacts; do not assume a log file exists after a failed connection.

Capability-gate every runtime. React-specific component, reload, and profiler operations may be unavailable on Chromium or Vega even when evaluation/logging works. Do not claim a fallback proves the same boundary.

Provenance: curated from Casona `argent-metro-debugger`, including its source-map and failure-scenario guidance.
