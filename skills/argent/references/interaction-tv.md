# TV interaction

Use for Apple TV/tvOS, Android TV/leanback, and Fire TV/Vega.

TV interfaces are focus-driven, not touch-driven. Never use coordinate gestures.

1. List devices and confirm `runtimeKind: tv` or the Vega platform.
2. Launch the app by identifier.
3. Describe the screen to locate the focused or selected element and available focus targets.
4. Send the smallest D-pad/remote path toward the target.
5. Describe again to prove focus or destination state.
6. Use keyboard input only after the intended field has focus.

When Vega reports no focused element, a selected element may represent the cursor. Android TV accessibility trees may be incomplete; use structured focus data first and screenshots as supplemental confirmation. Runtime debugging capabilities differ sharply across tvOS, leanback, and Vega; preflight the exact operation before promising component inspection or profiling.

Provenance: curated from Casona `argent-tv-interact`.
