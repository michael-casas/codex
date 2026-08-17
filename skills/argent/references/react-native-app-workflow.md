# React Native and Expo app workflow

Inspect before starting anything:

1. Read repository and app/package instructions.
2. Inspect package scripts, workspace configuration, Metro configuration, native folders, flavors, ports, and environment requirements.
3. Reuse running Metro/app targets when healthy; do not start duplicates.
4. Select the exact simulator/emulator and run the repository-declared target.
5. Verify the app attached to the expected Metro/runtime before debugging.

Repository authority supersedes generic commands. In a Bun-managed Nx workspace, inspect the resolved project and targets and run build, serve, test, and related tasks through `bun nx`. Do not substitute direct `npm`, `yarn`, `npx react-native`, Jest, Detox, or underlying framework commands when an authoritative Nx target exists.

Determine React Native/Expo status from repository evidence rather than a removed environment-inspector agent. Inspect declared dependencies, app configuration, native platform folders, and resolved workspace targets. When the project is React Native, use Metro component discovery when useful and fall back to the platform accessibility description when the component output is unavailable or unhelpful.

Reload JavaScript-only changes through Metro. Rebuild when native dependencies or native configuration changed. Diagnose failures from the narrowest boundary first. Do not perform recursive dependency, Pods, build, or emulator cleanup without explicit authority and exact validated targets.

Stop after repeated unexplained build failures and report the evidence; project-specific flavors, credentials, or native configuration may be missing.

Provenance: curated from Casona `argent-react-native-app-workflow`; the nonexistent `argent-environment-inspector` dependency and unsafe generic cleanup recipes were removed.
