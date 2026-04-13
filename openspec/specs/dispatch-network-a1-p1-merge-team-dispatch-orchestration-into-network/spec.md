# dispatch-network-a1-p1-merge-team-dispatch-orchestration-into-network Specification

## Purpose

Define the team network orchestration capability so staged run control, lane
dispatch, approval handling, feedback replanning, and regression coverage live
under `lib/team/coding/*` as the primary server-only module boundary, with
`lib/team/network.ts` retained only as a compatibility shim.

## Requirements

### Requirement: Merge team dispatch orchestration into network

The system SHALL preserve the unified orchestration capability approved in
OpenSpec change `dispatch-network-a1-p1-merge-team-dispatch-orchestration-into-network`,
now implemented under `lib/team/coding/*`, while keeping the planning,
approval, dispatch, and replanning behavior introduced by that proposal.

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
