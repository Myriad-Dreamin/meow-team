## ADDED Requirements

### Requirement: `meow-flow config install` writes a shared config artifact

The CLI SHALL provide a `meow-flow config install <path>` command that installs the requested config module to `~/.local/shared/meow-flow/config.js`.

#### Scenario: Installing a JavaScript config

- **WHEN** a user runs `meow-flow config install /repo/team.config.js`
- **THEN** the CLI writes `~/.local/shared/meow-flow/config.js`
- **AND** the installed file is a JavaScript module that `meow-flow` can load later without reading `/repo/team.config.js` directly

#### Scenario: Installing a TypeScript config

- **WHEN** a user runs `meow-flow config install /repo/team.config.ts`
- **THEN** the CLI evaluates the source config using the source project's TypeScript context
- **AND** the installed output at `~/.local/shared/meow-flow/config.js` is JavaScript

### Requirement: Shared config install accepts only supported source types

The install command SHALL accept only `.js` and `.ts` source config paths.

#### Scenario: Unsupported extension is rejected

- **WHEN** a user runs `meow-flow config install /repo/team.config.mjs`
- **THEN** the command exits with an error
- **AND** the error identifies `.js` and `.ts` as the supported config file types
- **AND** the command does not mutate `~/.local/shared/meow-flow/config.js`

### Requirement: Installed shared config preserves planning behavior after relocation

The installed shared config SHALL preserve the same planning inputs that the source config produced before installation.

#### Scenario: Relative repository directories remain valid after install

- **WHEN** a source config contains repository directories relative to the source config file
- **THEN** the installed shared config produces the same resolved repository candidate directories as the source config
- **AND** later `meow-flow` commands do not need the shared file to live next to the original source config

### Requirement: `meow-flow plan` prefers explicit config, then shared install

`meow-flow plan` SHALL resolve config from an explicit `--config` path when provided, otherwise from `~/.local/shared/meow-flow/config.js` when present, and otherwise from the nearest local `team.config.ts` or `team.config.js`.

#### Scenario: Explicit config path wins over the shared install

- **WHEN** a user runs `meow-flow plan --config /repo/team.config.ts`
- **THEN** the CLI loads `/repo/team.config.ts`
- **AND** the CLI does not read `~/.local/shared/meow-flow/config.js` for that invocation

#### Scenario: Shared config is used by default

- **WHEN** a user runs `meow-flow plan` without `--config`
- **AND** `~/.local/shared/meow-flow/config.js` exists
- **THEN** the CLI loads the shared installed config
- **AND** the plan output reports `~/.local/shared/meow-flow/config.js` as the resolved config path

#### Scenario: Local discovery remains available when no shared install exists

- **WHEN** a user runs `meow-flow plan` without `--config`
- **AND** `~/.local/shared/meow-flow/config.js` does not exist
- **AND** the current directory tree contains `team.config.ts` or `team.config.js`
- **THEN** the CLI loads the nearest discovered local config
