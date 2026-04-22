## Why

The repository does not yet contain the Meow Flow package pair requested by the user: a reusable core library and a dedicated CLI package. Creating them now establishes the workspace structure, package metadata, and command entrypoints needed for later feature work without coupling that work to the existing Paseo CLI.

## What Changes

- Add a new workspace library package at `packages/meow-flow-core` named `@myriaddreamin/meow-flow-core`.
- Add a new workspace CLI package at `packages/meow-flow` named `meow-flow`, following the existing structural conventions used by `packages/cli`.
- Add a root development alias `cli:meow-flow` that runs the Meow Flow CLI from source.
- Add foundation tests that verify the Meow Flow CLI prints its version with `--version` and prints help output with `--help`.
- Keep the initial scope limited to package scaffolding, CLI bootstrap behavior, and validation hooks; no feature subcommands are introduced in this change.

## Capabilities

### New Capabilities
- `meow-flow-core-package`: The workspace provides a buildable and publishable `@myriaddreamin/meow-flow-core` package with standard TypeScript library package metadata and exports.
- `meow-flow-cli-bootstrap`: The workspace provides a buildable `meow-flow` CLI package with a root development alias and baseline `--help` and `--version` behavior.

### Modified Capabilities
- None.

## Impact

- Affected workspace configuration: `pnpm-workspace.yaml`, root `package.json`.
- New code and package metadata under `packages/meow-flow-core/` and `packages/meow-flow/`.
- New CLI validation coverage for the Meow Flow bootstrap package.
- No changes to existing Paseo runtime behavior, daemon protocols, or mobile/web application code.
