---
title: Android App
aliases:
  - android
outline: deep
---

# Android App

This roadmap tracks an Android delivery surface for meow-team that lives in
`projects/meow-team-apk` while continuing to treat the existing Next.js app
as the only backend. The current topic focuses on the first bootstrap
milestone: a Kotlin/WebView shell, the Android-side UI boundary, and explicit
HTTP GET/POST calls into the server.

## Design Notes

- Keep Next.js as the only backend that owns orchestration, persistence, and
  team execution.
- Treat the Android app as a client shell that renders UI and forwards reads
  or mutations over explicit HTTP GET/POST contracts.
- Isolate the Android runtime under `projects/meow-team-apk` so platform
  tooling can evolve without reshaping the current web app.
- Start with a minimal Android shell before layering richer meow-team UI flows
  or offline behavior.

## Topics

- [Workspace UI](/roadmap/android-app/workspace-ui)
