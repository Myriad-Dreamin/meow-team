## 1. Bootstrap Scope

- [ ] 1.1 Confirm the `android/workspace-ui` scope, the `projects/meow-team-apk` package boundary, and the Android wrapper shape needed for the first `cargo-ndk` hello-world app
- [ ] 1.2 Confirm the initial backend contract by selecting the existing Next.js endpoints, base URL handling, and any local authentication assumptions the Android shell will use

## 2. Android Shell

- [ ] 2.1 Scaffold `projects/meow-team-apk` with the Rust crate, Android project glue, and repository scripts or docs needed to build through `cargo-ndk`
- [ ] 2.2 Build and launch the hello-world Android shell on an emulator or device, including visible backend endpoint or connection-state UI

## 3. HTTP Bridge

- [ ] 3.1 Implement the configurable backend base URL and typed GET/POST client used by the Android app
- [ ] 3.2 Route the first read and mutation workflows through the selected Next.js endpoints, including connection-state and recovery UI when the backend is unavailable

## 4. Validation

- [ ] 4.1 Add smoke coverage or runbook docs for the `cargo-ndk` toolchain, local emulator or device flow, and Android HTTP bridge failure handling
- [ ] 4.2 Run `pnpm fmt`, `pnpm lint`, `pnpm build` when workspace or backend wiring changes, and the relevant Android validation before review
