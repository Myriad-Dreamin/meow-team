## ADDED Requirements

### Requirement: Provide a `meow-team config platform` command

The system SHALL expose a Clipanion-based `meow-team` CLI and SHALL support
`config platform` for repository-local platform selection.

#### Scenario: Owner sets the platform to GitHub

- **WHEN** the owner runs `meow-team config platform github` inside a Git
  repository or worktree
- **THEN** the CLI SHALL write `github` to the repository-local
  `meow-team.platform` git config key
- **AND** the command SHALL report that the repository platform is now
  `github`

#### Scenario: Owner sets the platform to ugit

- **WHEN** the owner runs `meow-team config platform ugit` inside a Git
  repository or worktree
- **THEN** the CLI SHALL write `ugit` to the repository-local
  `meow-team.platform` git config key
- **AND** the command SHALL complete without requiring a working `ugit`
  adapter implementation

#### Scenario: Command runs outside a Git repository

- **WHEN** the owner runs `meow-team config platform <value>` outside a Git
  repository or worktree
- **THEN** the CLI SHALL fail with an actionable error that says the command
  requires a Git repository or worktree

### Requirement: Resolve platform operations from repository-local config

The system SHALL resolve Git platform operations per repository using the
repository-local `meow-team.platform` config key and SHALL keep GitHub as the
default when the key is unset.

#### Scenario: Platform config is unset

- **WHEN** publish, remote-resolution, or pull-request synchronization runs
  for a repository with no `meow-team.platform` value
- **THEN** the system SHALL use the existing GitHub adapter behavior
- **AND** GitHub SHALL remain the default without requiring any CLI
  configuration

#### Scenario: Platform config selects ugit

- **WHEN** platform operations run for a repository whose
  `meow-team.platform` value is `ugit`
- **THEN** the system SHALL fail before invoking GitHub-specific or `gh`
  commands
- **AND** the error SHALL state that `ugit` is not supported yet

#### Scenario: Platform config contains an unknown value

- **WHEN** platform operations run for a repository whose
  `meow-team.platform` value is not a known platform identifier
- **THEN** the system SHALL fail with an actionable unsupported-platform error
- **AND** the system SHALL not silently fall back to GitHub

### Requirement: Conventional title metadata stays explicit

The system SHALL carry the canonical request/PR title
`feat(cli/platform): wire cli platform config` and conventional-title
metadata `feat(cli/platform)` through the materialized OpenSpec artifacts
without encoding slash-delimited roadmap/topic scope into `branchPrefix` or
OpenSpec change paths.

#### Scenario: Materialized artifacts mirror the approved title metadata

- **WHEN** planner materializes this proposal
- **THEN** the generated proposal, design, spec, and tasks SHALL reference the
  canonical request/PR title `feat(cli/platform): wire cli platform config`
- **AND** the slash-delimited roadmap/topic scope SHALL remain metadata instead
  of changing the proposal change path
  `platform-config-a2-p1-add-cli-platform-config`
