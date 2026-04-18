## ADDED Requirements

### Requirement: `meow-team` SHALL expose repository-local platform configuration

The system SHALL provide a Clipanion-based `meow-team` command surface with a
`config platform <platform-id>` subcommand that targets the git repository
containing the current working directory.

#### Scenario: Setting the platform inside a repository

- **WHEN** a user runs `meow-team config platform github` or
  `meow-team config platform ugit` from a directory inside a git repository
- **THEN** the CLI SHALL resolve that repository root before writing
  configuration
- **AND** SHALL persist the selected platform for that repository
- **AND** SHALL report which platform is now configured

#### Scenario: Running outside a repository fails fast

- **WHEN** a user runs `meow-team config platform github` outside any git
  repository
- **THEN** the CLI SHALL fail with an explicit repository-not-found error
- **AND** SHALL NOT write any platform configuration

### Requirement: Platform configuration SHALL use repository-local git config

The system SHALL store platform selection under the local git config key
`meow-team.platform` and SHALL scope reads and writes to the current
repository.

#### Scenario: Different repositories keep independent platform selections

- **WHEN** repository A sets `meow-team.platform=ugit` and repository B leaves
  the key unset or sets `github`
- **THEN** reading platform configuration for repository A SHALL return `ugit`
- **AND** reading platform configuration for repository B SHALL return only its
  own value

#### Scenario: Supported platform IDs are stored exactly

- **WHEN** a user selects `github` or `ugit` through the CLI
- **THEN** the stored local git-config value SHALL match the selected platform
  ID exactly

### Requirement: Runtime platform resolution SHALL be repository-scoped

The system SHALL resolve the active git-platform adapter from the repository
path at call time instead of exporting one global adapter, and SHALL default to
the GitHub adapter when no local platform config is set.

#### Scenario: Unset config preserves the GitHub default

- **WHEN** a platform-backed operation runs for a repository without
  `meow-team.platform`
- **THEN** the system SHALL resolve the GitHub adapter
- **AND** SHALL preserve the current GitHub publish and pull-request behavior

#### Scenario: Explicit GitHub config still uses the GitHub adapter

- **WHEN** `meow-team.platform` is set to `github` for a repository
- **THEN** platform-backed operations for that repository SHALL resolve the
  GitHub adapter explicitly

### Requirement: Unsupported configured platforms SHALL fail explicitly

The system SHALL treat configured platforms without an available adapter as
explicit runtime errors instead of silently falling back to GitHub.

#### Scenario: `ugit` can be configured before adapter support lands

- **WHEN** a user stores `ugit` through `meow-team config platform ugit`
- **THEN** the CLI SHALL accept the repository-local configuration change
- **AND** later platform-backed operations SHALL treat that repository as
  configured for `ugit`

#### Scenario: Runtime operations reject configured `ugit`

- **WHEN** `meow-team.platform` is `ugit` and code attempts to resolve a push
  remote, publish a branch, or synchronize a pull request
- **THEN** the system SHALL fail with an explicit unsupported-platform error
  that names `ugit`
- **AND** SHALL NOT invoke GitHub-specific platform behavior for that operation

### Requirement: Materialized artifacts SHALL preserve request title metadata

The materialized OpenSpec artifacts SHALL preserve the canonical request/PR
title `feat(cli/platform): wire cli platform config` and conventional-title
metadata `feat(cli/platform)` without changing the approved change name.

#### Scenario: Proposal set mirrors approved metadata

- **WHEN** planner materializes this change
- **THEN** `proposal.md`, `design.md`, `tasks.md`, and this spec SHALL
  reference the canonical request/PR title
  `feat(cli/platform): wire cli platform config`
- **AND** SHALL keep `feat(cli/platform)` as metadata rather than altering the
  change path `platform-config-a1-p1-add-cli-platform-config`
