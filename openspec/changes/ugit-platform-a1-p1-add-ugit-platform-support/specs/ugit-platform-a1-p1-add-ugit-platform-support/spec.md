## ADDED Requirements

### Requirement: Resolve configured ugit repositories through a real platform adapter

The system SHALL resolve Git platform operations per repository using the
existing repository-local `meow-team.platform` path, and SHALL route
repositories configured with `ugit` to a real adapter implemented under
`lib/platform/ugit`.

#### Scenario: Platform config selects ugit

- **WHEN** publish, remote-resolution, or pull-request synchronization runs
  for a repository whose `meow-team.platform` value is `ugit`
- **THEN** `lib/platform/index.ts` SHALL resolve the ugit adapter instead of
  raising the unsupported-platform error
- **AND** the system SHALL not invoke GitHub-specific or `gh` commands for
  that repository

#### Scenario: Platform config is unset

- **WHEN** platform operations run for a repository with no
  `meow-team.platform` value
- **THEN** the system SHALL keep GitHub as the default adapter
- **AND** ugit support SHALL not require a new configuration mechanism

### Requirement: Publish ugit-backed branches with machine-aware tracking metadata

The system SHALL publish ugit-backed branches through the selected Git remote
and SHALL capture tracking metadata that can tolerate missing browser URLs.

#### Scenario: Branch publication resolves ugit machine context

- **WHEN** the harness publishes a branch for a repository configured with
  `ugit`
- **THEN** the adapter SHALL derive repository context from the selected
  remote and the resolved ugit machine, using the repo-local `ugit.machine`
  config when no explicit machine override exists
- **AND** the published commit record SHALL persist the remote name,
  repository identifier, commit hash, and any available browser URLs

#### Scenario: ugit does not expose stable web URLs

- **WHEN** the ugit adapter cannot derive repository, branch, or commit
  browser URLs from the current repository state or CLI output
- **THEN** platform and team persistence SHALL store `null` for those URLs
  instead of failing
- **AND** commit activity rendering SHALL continue using non-link text when
  URL data is absent

### Requirement: Synchronize ugit pull requests through ugit CLI workflows

The system SHALL create and refresh ugit pull requests using the ugit command
surface documented by `ugit --help`.

#### Scenario: Branch has no existing ugit pull request

- **WHEN** pull-request synchronization runs for a ugit-backed branch without
  an existing tracked pull request
- **THEN** the adapter SHALL create a ugit pull request with the requested
  base branch, title, body, and draft state
- **AND** the returned tracking metadata SHALL record provider `ugit`

#### Scenario: Branch already has an open ugit pull request

- **WHEN** pull-request synchronization runs for a ugit-backed branch that
  already has an open pull request
- **THEN** the adapter SHALL refresh that pull request through ugit-compatible
  sync or edit operations instead of creating a duplicate
- **AND** the returned tracking metadata SHALL preserve the pull-request
  identifier and latest state

### Requirement: Harness history and approval flows are provider-aware

The system SHALL persist and render tracked pull-request state without
GitHub-only provider or copy assumptions.

#### Scenario: Activity copy references a ugit-backed lane

- **WHEN** coding or execution history records publish or pull-request
  activity for a lane tracked through ugit
- **THEN** persisted lane and pull-request records SHALL allow provider
  `ugit` alongside existing providers
- **AND** operator-facing activity strings SHALL describe the tracking pull
  request or ugit provider without always naming GitHub

#### Scenario: Final approval refreshes a ugit-backed pull request

- **WHEN** a reviewed ugit-backed lane reaches final approval and the workflow
  archives or deletes its OpenSpec change
- **THEN** the harness SHALL continue the same approval and finalization
  checkpoints using ugit-backed pull-request synchronization
- **AND** the lane SHALL remain actionable even when the tracking pull-request
  URL is `null`

### Requirement: Conventional title metadata stays explicit

The system SHALL carry the canonical request/PR title
`feat(platform/ugit): support ugit platform` and conventional-title metadata
`feat(platform/ugit)` through the materialized OpenSpec artifacts without
encoding slash-delimited roadmap/topic scope into `branchPrefix` or OpenSpec
change paths.

#### Scenario: Materialized artifacts mirror the approved scope

- **WHEN** planner materializes this proposal
- **THEN** the generated proposal, design, spec, and tasks SHALL reference
  the canonical request/PR title
  `feat(platform/ugit): support ugit platform`
- **AND** the slash-delimited roadmap/topic scope SHALL remain metadata
  instead of changing the proposal change path
  `ugit-platform-a1-p1-add-ugit-platform-support`
