# conventional-pr-titles-a1-p1-standardize-conventional-request-and-pr-tit Specification

## Purpose

Define the conventional request and PR title capability for the harness,
including shared title metadata and formatting across planner materialization,
request-title storage, reviewer and finalization PR handling, and lint
enforcement that keeps slash-delimited scopes separate from branch and change
paths.

## Requirements

### Requirement: Standardize Conventional Request and PR Titles

The system SHALL implement the approved proposal recorded in OpenSpec change `conventional-pr-titles-a1-p1-standardize-conventional-request-and-pr-tit`
and keep the work aligned with this proposal's objective: Introduce shared conventional-title metadata and formatting across planner/OpenSpec materialization, request-title storage, reviewer/finalization PR handling, and the new PR-title lint workflow, while keeping slash-delimited roadmap/topic scopes separate from `branchPrefix` and OpenSpec change paths.

#### Scenario: Approved proposal enters execution

- **WHEN** a human approves the "Standardize Conventional Request and PR Titles" proposal
- **THEN** the system SHALL queue the proposal into the pooled coding and machine-review workflow

### Requirement: Proposal execution stays isolated

The system SHALL keep proposal execution isolated to the claimed implementation
branch and reusable worktree until human feedback explicitly requests
request-group replanning.

#### Scenario: Dedicated execution workspace

- **WHEN** the coder starts work on this proposal
- **THEN** the system SHALL provide a dedicated implementation branch and a reusable worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`
