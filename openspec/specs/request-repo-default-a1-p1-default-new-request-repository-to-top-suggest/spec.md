# request-repo-default-a1-p1-default-new-request-repository-to-top-suggest Specification

## Purpose

Define the New Request repository defaulting capability for the harness,
including seeding the picker from the top suggested repository, recovering
automatic blank or invalid state on picker refresh, preserving explicit user
overrides, and keeping manual blank selection and rerun-provided repository
ids intact.

## Requirements

### Requirement: Default New Request Repository to Top Suggestion

The system SHALL implement the approved proposal recorded in OpenSpec change
`request-repo-default-a1-p1-default-new-request-repository-to-top-suggest`
and keep the work aligned with this proposal's objective: Implement New
Request repository defaulting so the form selects the first suggested
repository when available, preserves explicit user overrides and rerun-provided
repository ids, keeps manual blank selection available, and adds regression
coverage for refresh and fallback behavior.

#### Scenario: Approved proposal enters execution

- **WHEN** a human approves the "Default New Request Repository to Top
  Suggestion" proposal
- **THEN** the system SHALL queue the proposal into the pooled coding and
  machine-review workflow

### Requirement: Proposal execution stays isolated
The system SHALL keep proposal execution isolated to the claimed implementation
branch and reusable worktree until human feedback explicitly requests
request-group replanning.

#### Scenario: Dedicated execution workspace
- **WHEN** the coder starts work on this proposal
- **THEN** the system SHALL provide a dedicated implementation branch and a reusable worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`

### Requirement: Conventional title metadata stays explicit

The system SHALL carry the canonical request/PR title `fix: Default New
Request Repository to Top Suggestion` and conventional-title metadata `fix`
through the materialized OpenSpec artifacts without encoding slash-delimited
roadmap/topic scope into `branchPrefix` or OpenSpec change paths.

#### Scenario: Materialized artifacts mirror the approved scope

- **WHEN** planner materializes this proposal
- **THEN** the generated proposal, design, spec, and tasks SHALL reference the
  canonical request/PR title `fix: Default New Request Repository to Top
  Suggestion`
- **AND** the slash-delimited roadmap/topic scope SHALL remain metadata instead
  of changing the proposal change path
  `request-repo-default-a1-p1-default-new-request-repository-to-top-suggest`
