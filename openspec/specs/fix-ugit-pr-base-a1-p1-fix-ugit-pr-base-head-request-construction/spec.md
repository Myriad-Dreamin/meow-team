# fix-ugit-pr-base-a1-p1-fix-ugit-pr-base-head-request-construction Specification

## Purpose

Ensure ugit pull-request synchronization constructs valid base/head requests
from explicit lane branch inputs so dedicated branch PR creation and refresh
target the configured base branch without same-branch validation failures.

## Requirements
### Requirement: Construct ugit pull-request requests with explicit branch targets

The system SHALL construct ugit pull-request create and sync requests from the
explicit `branchName` and `baseBranch` values passed into
`synchronizeUgitPullRequest`, using `branchName` as the PR head/source branch
and `baseBranch` as the PR target branch.

#### Scenario: Create a new ugit pull request from a dedicated lane branch

- **WHEN** ugit pull-request synchronization creates a new PR for a repository
  branch whose `branchName` differs from `baseBranch`
- **THEN** the ugit request SHALL send `branchName` as the PR head/source
  branch
- **AND** the ugit request SHALL send `baseBranch` as the PR target branch
- **AND** the adapter SHALL not rely on inferred checkout state to determine
  either branch target

#### Scenario: Refresh an existing ugit pull request

- **WHEN** ugit pull-request synchronization updates an existing PR for a
  dedicated lane branch
- **THEN** the ugit request SHALL preserve `branchName` as the PR head/source
  branch
- **AND** the ugit request SHALL preserve `baseBranch` as the PR target branch
- **AND** the adapter SHALL avoid constructing a same-branch base/head pair
  when `branchName` and `baseBranch` differ

### Requirement: Preserve existing ugit synchronization behavior outside branch targeting

The system SHALL keep existing ugit pull-request synchronization behavior
unchanged outside the explicit base/head branch-target fix.

#### Scenario: Existing PR metadata flow remains intact

- **WHEN** the ugit adapter synchronizes a PR after the branch-target fix
- **THEN** merged-PR rejection, PR discovery, title/body handling, draft state,
  and returned PR URL behavior SHALL remain compatible with the current shared
  platform contract

### Requirement: Preserve canonical title metadata in the materialized artifacts

The system SHALL carry the canonical request/PR title
`fix(platform/ugit): align ugit PR branch targets` and conventional-title
metadata `fix(platform/ugit)` through the materialized OpenSpec artifacts
without changing the approved change path
`fix-ugit-pr-base-a1-p1-fix-ugit-pr-base-head-request-construction`.

#### Scenario: Materialized artifacts mirror approved title metadata

- **WHEN** planner materializes this proposal
- **THEN** the generated proposal, design, spec, and tasks SHALL reference the
  canonical request/PR title
  `fix(platform/ugit): align ugit PR branch targets`
- **AND** conventional-title metadata SHALL stay explicit instead of being
  encoded into the OpenSpec change path
