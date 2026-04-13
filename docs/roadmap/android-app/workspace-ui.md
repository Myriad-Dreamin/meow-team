---
title: Workspace UI
aliases:
  - ui
  - workspace
outline: deep
---

# Workspace UI

## Android Crate Boundary

Track the Android application package that lives in `projects/meow-team-apk`,
including the Android project glue, manifest or build configuration, and the
rule that platform code stays isolated from the Next.js backend.

## Android Bootstrap

Track the initial hello-world milestone built as a pure Android shell,
including the developer workflow for producing an APK and the minimum shell
required to prove the repository can ship the app.

## Next.js HTTP Bridge

Track how the Android app talks to the existing Next.js backend through
explicit HTTP GET/POST requests, including base URL configuration, request or
response shaping, and the rule that workflow orchestration stays on the server.

## Attention Notifications

Track how the Android app polls `GET /api/team/notifications`, turns the
backend snapshot into native Android system notifications, and stays silent
unless `team.config.ts` routes alerts to `android`.

## UI Shell

Track the first meow-team mobile UI surfaces that the Android app should host,
including connection state, request or thread navigation, and the thin-client
rule that backend-owned state remains authoritative.

## Local Runtime

Track the development workflow for running the Android client beside the
Next.js app, including emulator or device setup, backend discovery, and
degraded UX when the backend is offline or misconfigured.

## Related Specs
