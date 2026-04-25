# team-config-driven-dispatch Specification

## Purpose
Define how Meow Flow loads, validates, and normalizes team configuration before deriving deterministic repository and worktree allocation plans.

## Requirements
### Requirement: `mfl plan` loads a team config module

The `mfl plan` command SHALL load team configuration from an explicit `--config` path when provided, or else discover `team.config.ts` by searching from the current working directory toward the filesystem root.

#### Scenario: Explicit config path wins

- **WHEN** a user runs `mfl plan --config /repo/team.config.ts`
- **THEN** the CLI loads `/repo/team.config.ts` as the team config source
- **AND** the CLI does not continue searching for another config file

#### Scenario: Default discovery finds the nearest team config

- **WHEN** a user runs `mfl plan` inside a repository tree that contains `team.config.ts` in the current directory or an ancestor directory
- **THEN** the CLI loads the nearest discovered `team.config.ts`
- **AND** the CLI reports the resolved config path in plan output or diagnostics

#### Scenario: Missing config fails clearly

- **WHEN** a user runs `mfl plan` without `--config` and no `team.config.ts` can be discovered
- **THEN** the command fails without mutating repository state
- **AND** the error tells the user to create `team.config.ts` or pass `--config`

### Requirement: Loaded team config is validated and normalized before planning

The CLI SHALL validate the loaded config into a normalized Meow Flow team config before repository selection or worktree allocation logic runs.

#### Scenario: Repository roots are normalized to planning inputs

- **WHEN** the loaded team config declares one or more repository roots
- **THEN** each root is converted into a normalized planning entry with stable `id`, `label`, and absolute `directory` values
- **AND** the normalized entries preserve the config-defined ordering

#### Scenario: Invalid config fails with field-specific diagnostics

- **WHEN** the loaded config omits required planning fields or provides values with invalid types
- **THEN** the command exits with a validation error
- **AND** the error identifies the relevant config field path so the user can correct the file

### Requirement: Planning derives repository candidates from config

`mfl plan` SHALL derive the repository candidate set from the normalized team config instead of scanning arbitrary directories.

#### Scenario: Multiple configured roots become ordered candidates

- **WHEN** the team config declares multiple repository roots
- **THEN** the plan output includes those roots as the repository candidate set
- **AND** the candidates appear in the same priority order as the config

#### Scenario: Non-configured repositories are excluded

- **WHEN** the current machine contains other repositories outside the configured root list
- **THEN** `mfl plan` excludes them from the candidate set
- **AND** downstream worktree allocation is limited to configured repositories

### Requirement: Planning emits deterministic worktree allocation descriptors

`mfl plan` SHALL emit deterministic worktree allocation data for each selected repository so future execution commands can reuse the same planning result.

#### Scenario: Allocation output is stable for the same config

- **WHEN** the same team config and planning inputs are evaluated multiple times
- **THEN** the emitted worktree allocation descriptors are identical across runs
- **AND** they include enough metadata for later commands to identify the target repository and worktree naming/base-path strategy

#### Scenario: JSON output exposes planning details

- **WHEN** a user runs `mfl plan --json`
- **THEN** the command prints machine-readable output containing the resolved config path, normalized repository candidates, and worktree allocation descriptors
- **AND** the output can be consumed by tests or future dispatch commands without parsing human-oriented text
