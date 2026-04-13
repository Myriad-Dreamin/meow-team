---
title: Workspace UI
aliases:
  - ui
  - workspace
outline: deep
---

# Workspace UI

## Android Crate Boundary

Track the Android application package that lives in `crates/meow-team-android`,
including the Rust crate layout, Android project glue, manifest or build
configuration, and the rule that platform code stays isolated from the Next.js
backend.

## cargo-ndk Bootstrap

Track the initial hello-world milestone built with `cargo-ndk`, including the
developer workflow for producing an Android build, target setup, and the
minimum shell required to prove the repository can ship the app.

## Next.js HTTP Bridge

Track how the Android app talks to the existing Next.js backend through
explicit HTTP GET/POST requests, including base URL configuration, request or
response shaping, and the rule that workflow orchestration stays on the server.

## UI Shell

Track the first meow-team mobile UI surfaces that the Android app should host,
including connection state, request or thread navigation, and the thin-client
rule that backend-owned state remains authoritative.

## Local Runtime

Track the development workflow for running the Android client beside the
Next.js app, including emulator or device setup, backend discovery, and
degraded UX when the backend is offline or misconfigured.

## Related Specs
