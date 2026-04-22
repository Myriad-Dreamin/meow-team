## ADDED Requirements

### Requirement: Workspace includes Meow Flow Core package
The repository SHALL define `@myriaddreamin/meow-flow-core` as a pnpm workspace package located at `packages/meow-flow-core` with package metadata and TypeScript scripts required for local build and typecheck workflows.

#### Scenario: Developer targets the core package by workspace name
- **WHEN** a developer runs a filtered workspace command for `@myriaddreamin/meow-flow-core`
- **THEN** pnpm SHALL resolve the package as a workspace member with runnable package scripts

### Requirement: Meow Flow Core package exposes a typed module entrypoint
The `@myriaddreamin/meow-flow-core` package SHALL expose a public module entrypoint with generated JavaScript output and TypeScript declaration output for its public API.

#### Scenario: Core package is built
- **WHEN** the core package build script completes successfully
- **THEN** the package SHALL produce distributable module output and declaration files for its exported entrypoint
