## Why

Meow Team currently exposes its operator experience through the Next.js app,
which keeps the product browser-first even when a native Android surface would
make the UI easier to deliver on mobile devices. A bootstrap Android shell lets
the team validate a new client surface in `crates/meow-team-android` without
moving orchestration, persistence, or workflow logic out of Next.js.

## What Changes

- Introduce the `android-app-ui-a1-p1-bootstrap-nextjs-backed-android-shell`
  OpenSpec change for proposal "Bootstrap Next.js-backed Android shell".
- Plan an Android application package under `crates/meow-team-android` that
  starts as a `cargo-ndk` hello-world app and grows into the first meow-team
  mobile UI shell.
- Keep runtime orchestration and data APIs in the existing Next.js backend,
  and have the Android app call them through explicit GET/POST flows instead
  of reimplementing backend behavior locally.
- Define the Android bootstrap, backend connection, and local development
  workflow needed to run the mobile shell against a live Next.js server.
- Align the roadmap and proposal around an `android/workspace-ui` scope so
  follow-up implementation and archive work land in one predictable topic.
- Treat the Rust Android crate as an intentional platform exception that stays
  isolated from the current TypeScript-first backend and web app.

## Capabilities

### New Capabilities

- `android-app-workspace-ui`: Provide an Android application package in
  `crates/meow-team-android` with an initial meow-team UI shell, connection
  state, and a crate boundary that stays separate from the Next.js backend.
- `android-app-http-bridge`: Provide the Android-to-Next.js transport contract
  for explicit HTTP GET/POST requests, configurable backend base URLs, and
  degraded UX when the backend is unavailable.

### Modified Capabilities

- None.

## Conventional Title

- Canonical request/PR title:
  `feat(android/workspace-ui): Bootstrap Next.js-backed Android shell`
- Conventional title metadata: `feat(android/workspace-ui)`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and
  does not alter `branchPrefix` or OpenSpec change paths.

## Impact

- Affected repository: `meow-team`
- Affected code and docs: `docs/roadmap/android-app/*`,
  `crates/meow-team-android`, repository workspace wiring for a new Android
  crate, and the Next.js HTTP endpoints consumed by the app
- Affected systems: Android toolchain and emulator/device workflow,
  `cargo-ndk`-driven packaging, the existing Next.js backend, and the local
  operator flow that runs both surfaces together
