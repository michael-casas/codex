# Android emulator setup

Use this reference to establish an Android target.

1. Confirm `adb` is available. Require the emulator CLI only when a new AVD must be booted.
2. List devices through Argent and prefer a ready Android target unless the user names one.
3. If necessary, boot a listed AVD and wait for a ready adb state.
4. For React Native Metro, run `adb -s <serial> reverse tcp:<metro-port> tcp:<metro-port>` after boot and again after a device restart.
5. Retain the exact serial for later calls.

Inspect `runtimeKind`. Route leanback/Android TV targets to the TV reference rather than touch gestures.

For shutdown, prefer `adb -s <serial> emu kill`. Never hard-kill emulator/qemu processes as routine cleanup; it can corrupt emulator userdata. Destructive recovery such as wiping AVD data requires explicit user authority and an exact target.

Provenance: curated from Casona `argent-android-emulator-setup`.
