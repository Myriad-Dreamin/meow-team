# team-module-refactor-a1-p1-refactor-lib-team-into-shared-agent-git-confi Specification

## Purpose

Define the shared team module architecture for the harness, including
injected agent classes for request-title, planner, coder, and reviewer
runners, extraction of reusable agent, git, config, status, and
repository-context code from `lib/team`, and preserved behavior with updated
validation and tests.

## Requirements

### Requirement: Refactor lib/team into shared agent, git, config, and status modules

The system SHALL implement the approved proposal recorded in OpenSpec change `team-module-refactor-a1-p1-refactor-lib-team-into-shared-agent-git-confi`
and keep the work aligned with this proposal's objective: Convert request-title/planner/coder/reviewer runners into injected agent classes, move reusable agent/git/config/status and repository-context code out of `lib/team`, keep runtime validation only at untyped boundaries, and preserve current harness behavior with updated tests and validation.

#### Scenario: Approved proposal enters execution

- **WHEN** a human approves the "Refactor lib/team into shared agent, git, config, and status modules" proposal
- **THEN** the system SHALL queue the proposal into the pooled coding and machine-review workflow

### Requirement: Proposal execution stays isolated

The system SHALL keep proposal execution isolated to the claimed implementation
branch and reusable worktree until human feedback explicitly requests
request-group replanning.

#### Scenario: Dedicated execution workspace

- **WHEN** the coder starts work on this proposal
- **THEN** the system SHALL provide a dedicated implementation branch and a reusable worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`
