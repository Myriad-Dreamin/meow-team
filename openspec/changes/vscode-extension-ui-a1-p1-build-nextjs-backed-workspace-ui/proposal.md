## Why

Meow Team currently exposes its operator experience through the Next.js app,
which keeps the product browser-first even when the owner spends most of the
day inside VS Code. A dedicated extension-backed workspace would move the UI
closer to the editor while keeping the existing Next.js backend and API
contracts as the source of truth.

## What Changes

- Introduce the
  `vscode-extension-ui-a1-p1-build-nextjs-backed-workspace-ui` OpenSpec change
  for proposal "Build Next.js-backed VS Code workspace UI".
- Plan a VS Code extension package under `editors/vscode` that contributes the
  meow-team workspace UI, commands, and configuration entry points.
- Keep runtime orchestration and data APIs in the existing Next.js backend, and
  have the extension call them through explicit GET/POST flows instead of
  reimplementing backend behavior locally.
- Define the extension bootstrap, backend connection, and local development
  workflow needed to run the editor UI against a live Next.js server.
- Align the roadmap and proposal around a `vsc/workspace-ui` scope so follow-up
  implementation and archive work can land in one predictable topic.

## Capabilities

### New Capabilities

- `vscode-extension-workspace-ui`: Provide a VS Code extension package at
  `editors/vscode` that hosts the meow-team workspace experience, commands, and
  editor-native navigation surfaces.
- `vscode-extension-http-bridge`: Provide the extension-to-Next.js transport
  contract for GET/POST requests, backend base URL configuration, and degraded
  UX when the backend is unavailable.

### Modified Capabilities

- None.

## Impact

- Affected repository: `meow-team`
- Affected code and docs: `editors/vscode`, root workspace/package wiring,
  shared UI utilities if needed, `app/api/**` surfaces consumed by the
  extension, and `docs/roadmap/vscode-extension/*`
- Affected systems: VS Code extension host, VS Code webviews, the Next.js
  backend, and the local development workflow that runs both together
