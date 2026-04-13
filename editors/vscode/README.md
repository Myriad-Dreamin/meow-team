# Meow Team Workspace Extension

This package under `editors/vscode` hosts the VS Code workspace surface for meow-team.

## Local Development

- Build the extension: `pnpm vscode:build`
- Package a VSIX: `pnpm vscode:package`
- Package and install into local VS Code: `pnpm vscode:install`
- The extension host bundle is written to `out/extension.js`.

## Configuration

- `meowTeam.backendBaseUrl`: base URL for the Next.js app that serves `/api/team/*`
- `team.config.ts -> notifications.target`: route approval and failure alerts to the browser or the VS Code extension

`pnpm vscode:install` expects the `code` CLI on `PATH`. Set
`MEOW_TEAM_VSCODE_CLI` to override the command name when needed.
