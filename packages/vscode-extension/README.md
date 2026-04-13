# Meow Team Workspace Extension

This package hosts the first VS Code workspace surface for meow-team.

## Local Development

- Build the extension: `pnpm vscode:build`
- Package a VSIX: `pnpm vscode:package`
- Package and install into local VS Code: `pnpm vscode:install`

## Configuration

- `meowTeam.backendBaseUrl`: base URL for the Next.js app that serves `/api/team/*`

`pnpm vscode:install` expects the `code` CLI on `PATH`. Set
`MEOW_TEAM_VSCODE_CLI` to override the command name when needed.
