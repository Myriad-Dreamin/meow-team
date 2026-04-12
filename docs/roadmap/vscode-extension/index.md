---
title: VS Code Extension
aliases:
  - vsc
outline: deep
---

# VS Code Extension

This roadmap tracks the editor-native meow-team surface that will live in
`editors/vscode` while continuing to rely on the existing Next.js app as the
backend. The current topic focuses on the initial workspace UI: how the
extension hosts the experience inside VS Code and how it talks to the backend
through explicit HTTP requests.

## Design Notes

- Keep Next.js as the only backend that owns orchestration, persistence, and
  team execution.
- Treat the VS Code extension as an editor-native shell for commands, webviews,
  status, and configuration.
- Prefer explicit GET/POST contracts over hidden in-process coupling between
  the extension host and the web app runtime.
- Keep the extension package isolated under `editors/vscode` so editor delivery
  can evolve without reshaping the backend app.

## Topics

- [Workspace UI](/roadmap/vscode-extension/workspace-ui)
