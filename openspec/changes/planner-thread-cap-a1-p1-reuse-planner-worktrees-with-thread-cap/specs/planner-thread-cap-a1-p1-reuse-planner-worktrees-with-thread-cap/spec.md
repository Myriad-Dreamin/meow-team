## ADDED Requirements

### Requirement: Reuse Planner Worktrees With Thread Cap

The system SHALL implement the approved proposal recorded in OpenSpec change `planner-thread-cap-a1-p1-reuse-planner-worktrees-with-thread-cap`
and keep the work aligned with this proposal's objective: Replace hashed planner staging worktree paths with a shared `meow-N` slot allocation model, enforce a matching cap on concurrently active non-terminal threads, and cover slot assignment, reuse, release, legacy-state compatibility, and planner/lane collision behavior with tests.

#### Scenario: Approved proposal enters execution

- **WHEN** a human approves the "Reuse Planner Worktrees With Thread Cap" proposal
- **THEN** the system SHALL queue the proposal into the pooled coding and machine-review workflow

### Requirement: Proposal execution stays isolated

The system SHALL keep proposal execution isolated to the claimed implementation
branch and reusable worktree until human feedback explicitly requests
request-group replanning.

#### Scenario: Dedicated execution workspace

- **WHEN** the coder starts work on this proposal
- **THEN** the system SHALL provide a dedicated implementation branch and a reusable worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`
