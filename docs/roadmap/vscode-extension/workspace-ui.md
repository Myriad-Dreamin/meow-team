---
title: Workspace UI
aliases:
  - ui
  - workspace
outline: deep
---

# Workspace UI

## Extension Package

Track the VS Code extension package that lives in `editors/vscode`, including
activation events, command contributions, configuration, and the packaging
boundary between the editor shell and the rest of the monorepo.

## Webview Workspace

Track the primary editor surface that hosts the meow-team experience inside VS
Code, including the main workspace panel, thread or request navigation, and
the cues that make backend connection state visible to the owner.

## Next.js HTTP Bridge

Track how the extension talks to the existing Next.js backend through explicit
GET/POST requests, including base URL configuration, request shaping, and the
rule that workflow orchestration stays on the server.

## Local Runtime

Track the development and operator flow for running the extension beside the
Next.js app, including startup scripts, backend discovery, and degraded UX
when the backend is offline or misconfigured.

## Related Specs
