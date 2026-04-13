## ADDED Requirements

### Requirement: Use static worktrees per thread
The system SHALL implement the approved proposal recorded in OpenSpec change `thread-worktree-a2-p1-use-static-worktrees-per-thread`
and keep the work aligned with this proposal's objective: Refactor `lib/team/coding` so each living repository-backed thread claims one managed `meow-N` worktree before planning, persists that resolved `Worktree` across planning, proposal materialization, coding, review, final archive, and replanning, removes dynamic `createWorktree` usage from the run env and stage transitions, releases the slot only when the thread is archived, and updates legacy compatibility plus regression coverage for the new thread-scoped lifecycle.

#### Scenario: Approved proposal enters execution
- **WHEN** a human approves the "Use static worktrees per thread" proposal
- **THEN** the system SHALL queue the proposal into the pooled coding and machine-review workflow

### Requirement: Proposal execution stays isolated
The system SHALL keep proposal execution isolated to the claimed implementation
branch and reusable worktree until human feedback explicitly requests
request-group replanning.

#### Scenario: Dedicated execution workspace
- **WHEN** the coder starts work on this proposal
- **THEN** the system SHALL provide a dedicated implementation branch and a reusable worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`

### Requirement: Conventional title metadata stays explicit
The system SHALL carry the canonical request/PR title `refactor: Use static worktrees per thread` and conventional-title metadata `refactor`
through the materialized OpenSpec artifacts without encoding slash-delimited roadmap/topic scope into `branchPrefix` or OpenSpec change paths.

#### Scenario: Materialized artifacts mirror the approved scope
- **WHEN** planner materializes this proposal
- **THEN** the generated proposal, design, spec, and tasks SHALL reference the canonical request/PR title `refactor: Use static worktrees per thread`
- **AND** the slash-delimited roadmap/topic scope SHALL remain metadata instead of changing the proposal change path `thread-worktree-a2-p1-use-static-worktrees-per-thread`
