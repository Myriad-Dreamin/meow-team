## ADDED Requirements

### Requirement: Split `network.ts` into stage-oriented `lib/team/coding` modules
The system SHALL implement the approved proposal recorded in OpenSpec change `coding-stages-a1-p1-split-network-ts-into-stage-oriented-lib-team-coding`
and keep the work aligned with this proposal's objective: Create `lib/team/coding/index.ts` as the primary orchestration entrypoint, move the current `lib/team/network.ts` implementation into stage-oriented files such as `plan.ts` plus a `shared.ts` for shared run-state types/helpers, update internal callers/tests/docs/spec references to the new boundary, and preserve existing planner, scheduling, approval, and archive behavior. Keep `lib/team/network.ts` only as a thin compatibility shim if the migration genuinely requires it.

#### Scenario: Approved proposal enters execution
- **WHEN** a human approves the "Split `network.ts` into stage-oriented `lib/team/coding` modules" proposal
- **THEN** the system SHALL queue the proposal into the pooled coding and machine-review workflow

### Requirement: Proposal execution stays isolated
The system SHALL keep proposal execution isolated to the claimed implementation
branch and reusable worktree until human feedback explicitly requests
request-group replanning.

#### Scenario: Dedicated execution workspace
- **WHEN** the coder starts work on this proposal
- **THEN** the system SHALL provide a dedicated implementation branch and a reusable worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`

### Requirement: Conventional title metadata stays explicit
The system SHALL carry the canonical request/PR title `refactor(team/coding): Split `network.ts` into stage-oriented` and conventional-title metadata `refactor(team/coding)`
through the materialized OpenSpec artifacts without encoding slash-delimited roadmap/topic scope into `branchPrefix` or OpenSpec change paths.

#### Scenario: Materialized artifacts mirror the approved scope
- **WHEN** planner materializes this proposal
- **THEN** the generated proposal, design, spec, and tasks SHALL reference the canonical request/PR title `refactor(team/coding): Split `network.ts` into stage-oriented`
- **AND** the slash-delimited roadmap/topic scope SHALL remain metadata instead of changing the proposal change path `coding-stages-a1-p1-split-network-ts-into-stage-oriented-lib-team-coding`
