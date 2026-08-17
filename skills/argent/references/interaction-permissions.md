# Permission-state setup

Use Argent permission operations only for out-of-band test setup.

Priority order:

1. If the app has an in-app permission control, exercise it.
2. If the app presents the platform dialog, answer that dialog as the real user path.
3. Use permission-store operations only to pre-grant/pre-deny, re-enable an already-denied permission, or reset first-run state.

Resolve the target, installed bundle/package identifier, platform support, and exact permission before changing state. Apply permission setup before launch when possible because platform changes may terminate the app. Restart afterward if state changed while the app was running.

Treat partial Android application results explicitly: mapped platform permissions can be skipped because of manifest or API-level differences. iOS support is simulator-only and varies by runtime. Do not generalize simulator permission operations to physical iPhones.

Permission changes are mutable device state. Stay within the requested app and permission; do not perform device-wide resets.

Provenance: curated from Casona `argent-settings-permissions`.
