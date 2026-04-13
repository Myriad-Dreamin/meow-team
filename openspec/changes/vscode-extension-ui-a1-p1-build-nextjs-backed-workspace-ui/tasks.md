## 1. Proposal Alignment

- [x] 1.1 Confirm the `vsc/workspace-ui` scope, the `packages/vscode-extension` package boundary, and the first meow-team workflows that must appear in the extension
- [x] 1.2 Confirm the backend endpoints, base URL configuration flow, and any authentication assumptions the extension depends on

## 2. Extension Shell

- [x] 2.1 Scaffold the VS Code extension package, manifest, build pipeline, and `pnpm` workspace wiring under `packages/vscode-extension`
- [x] 2.2 Add commands, settings, and a primary workspace webview entry point for the meow-team UI

## 3. Backend Bridge

- [x] 3.1 Implement the configurable backend base URL and typed GET/POST client used by the extension
- [x] 3.2 Route the first read and mutation workflows through the Next.js backend, including connection-state and recovery UI when the backend is unavailable

## 4. Validation

- [x] 4.1 Add tests or smoke coverage for extension activation, backend configuration, and bridge error handling
- [x] 4.2 Run `pnpm fmt`, `pnpm lint`, and the relevant extension or backend validation before review
