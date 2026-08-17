# iOS simulator setup

Use this reference to establish an iOS simulator target before interaction.

1. Discover the Executor-exposed Argent device-list operation and list devices.
2. Prefer an already-booted iOS simulator unless the user specified another target.
3. If none is booted, select an available simulator and invoke the boot operation with its UDID.
4. Retain the exact UDID for every later interaction, debugger, flow, and teardown operation.
5. Verify readiness through a non-mutating device listing or screen description before continuing.

Do not confuse an iOS UUID-shaped identifier with an Android adb serial. A UUID may also identify an Apple TV simulator; inspect runtime kind before choosing touch interaction.

Provenance: curated from Casona `argent-ios-simulator-setup`.
