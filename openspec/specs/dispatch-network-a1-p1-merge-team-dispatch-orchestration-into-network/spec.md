# dispatch-network-a1-p1-merge-team-dispatch-orchestration-into-network Specification

## Purpose

Define the team network orchestration capability so staged run control, lane
dispatch, approval handling, feedback replanning, and regression coverage live
under `lib/team/network.ts` as one server-only module.

## Requirements

### Requirement: Merge team dispatch orchestration into network

The system SHALL implement the approved proposal recorded in OpenSpec change `dispatch-network-a1-p1-merge-team-dispatch-orchestration-into-network`
and keep the work aligned with this proposal's objective: Consolidate `lib/team/dispatch.ts` into `lib/team/network.ts`, move route and internal callers to the unified module, preserve current planning/approval/replan behavior, and merge all dispatch regression suites into `lib/team/network.test.ts` before deleting the standalone dispatch module and tests.

#### Scenario: Approved proposal enters execution

- **WHEN** a human approves the "Merge team dispatch orchestration into network" proposal
- **THEN** the system SHALL queue the proposal into the pooled coding and machine-review workflow

### Requirement: Proposal execution stays isolated

The system SHALL keep proposal execution isolated to the claimed implementation
branch and reusable worktree until human feedback explicitly requests
request-group replanning.

#### Scenario: Dedicated execution workspace

- **WHEN** the coder starts work on this proposal
- **THEN** the system SHALL provide a dedicated implementation branch and a reusable worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`

### Requirement: Conventional title metadata stays explicit

The system SHALL carry the canonical request/PR title `refactor(team/network): Merge team dispatch orchestration into network` and conventional-title metadata `refactor(team/network)`
through the materialized OpenSpec artifacts without encoding slash-delimited roadmap/topic scope into `branchPrefix` or OpenSpec change paths.

#### Scenario: Materialized artifacts mirror the approved scope

- **WHEN** planner materializes this proposal
- **THEN** the generated proposal, design, spec, and tasks SHALL reference the canonical request/PR title `refactor(team/network): Merge team dispatch orchestration into network`
- **AND** the slash-delimited roadmap/topic scope SHALL remain metadata instead of changing the proposal change path `dispatch-network-a1-p1-merge-team-dispatch-orchestration-into-network`
