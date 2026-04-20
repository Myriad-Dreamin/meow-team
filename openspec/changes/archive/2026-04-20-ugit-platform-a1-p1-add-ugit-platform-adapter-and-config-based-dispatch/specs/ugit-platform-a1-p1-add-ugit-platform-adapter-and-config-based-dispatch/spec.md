## ADDED Requirements

### Requirement: Resolve ugit platform operations from repository-local config

The system SHALL resolve Git platform operations per repository using the
repository-local `meow-team.platform` config key and SHALL dispatch to a real
ugit adapter whenever the configured value is `ugit`.

#### Scenario: Platform config selects ugit

- **WHEN** publish, remote-resolution, pull-request synchronization, or
  repository URL normalization runs for a repository whose
  `meow-team.platform` value is `ugit`
- **THEN** the system SHALL resolve the ugit adapter instead of the GitHub
  adapter
- **AND** the system SHALL avoid invoking GitHub-specific `gh` commands for
  that repository

#### Scenario: Platform config is unset

- **WHEN** the same platform operations run for a repository with no
  `meow-team.platform` value
- **THEN** the system SHALL preserve the existing GitHub adapter behavior
- **AND** GitHub SHALL remain the default without requiring configuration

#### Scenario: Platform config contains an unknown value

- **WHEN** platform operations run for a repository whose
  `meow-team.platform` value is not a known platform identifier
- **THEN** the system SHALL fail with an actionable unsupported-platform error
- **AND** the system SHALL not silently fall back to another adapter

### Requirement: Support ugit branch publishing and pull-request synchronization

The system SHALL provide a first-class ugit adapter under `lib/platform/ugit`
that satisfies the shared platform contract for branch publication and
pull-request lifecycle operations.

#### Scenario: Publish a branch with ugit

- **WHEN** a repository configured with `meow-team.platform=ugit` publishes a
  branch through the shared platform entrypoints
- **THEN** the system SHALL use ugit-specific publish behavior to push or
  expose the branch for review
- **AND** the returned publication metadata SHALL remain compatible with the
  existing shared platform contract

#### Scenario: Create or update a ugit pull request

- **WHEN** pull-request synchronization runs for a repository configured with
  `meow-team.platform=ugit`
- **THEN** the ugit adapter SHALL use supported ugit pull-request commands to
  create or edit the repository's review request as needed
- **AND** the adapter SHALL return the synchronized pull-request metadata in
  the shared contract shape expected by team workflow code

#### Scenario: Sync an existing ugit pull request

- **WHEN** the ugit adapter determines that a matching pull request already
  exists for the branch being synchronized
- **THEN** the system SHALL update or sync that pull request instead of
  creating a duplicate
- **AND** the adapter SHALL use ugit pull-request discovery data to identify
  the existing review request

### Requirement: Conventional title metadata stays explicit

The system SHALL carry the canonical request/PR title
`feat(platform/ugit): add ugit platform support` and conventional-title
metadata `feat(platform/ugit)` through the materialized OpenSpec artifacts
without encoding slash-delimited roadmap/topic scope into `branchPrefix` or
OpenSpec change paths.

#### Scenario: Materialized artifacts mirror the approved title metadata

- **WHEN** planner materializes this proposal
- **THEN** the generated proposal, design, spec, and tasks SHALL reference the
  canonical request/PR title `feat(platform/ugit): add ugit platform support`
- **AND** the slash-delimited roadmap/topic scope SHALL remain metadata instead
  of changing the proposal change path
  `ugit-platform-a1-p1-add-ugit-platform-adapter-and-config-based-dispatch`
