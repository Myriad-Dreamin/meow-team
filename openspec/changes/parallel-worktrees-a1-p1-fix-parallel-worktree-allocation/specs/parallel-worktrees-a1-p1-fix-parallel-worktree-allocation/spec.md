## ADDED Requirements

### Requirement: Fix Parallel Worktree Allocation
The system SHALL implement the approved proposal recorded in OpenSpec change `parallel-worktrees-a1-p1-fix-parallel-worktree-allocation`
and keep the work aligned with this proposal's objective: Implement one OpenSpec-aligned change that gives each planner assignment its own staging worktree, assigns coder/reviewer worktree slots from the shared cross-thread pool, preserves slot reuse for active lanes, and adds regression coverage for concurrent runs.

#### Scenario: Approved proposal enters execution
- **WHEN** a human approves the "Fix Parallel Worktree Allocation" proposal
- **THEN** the system SHALL queue the proposal into the pooled coding and machine-review workflow

### Requirement: Proposal execution stays isolated
The system SHALL keep proposal execution isolated to the claimed implementation
branch and reusable worktree until human feedback explicitly requests
request-group replanning.

#### Scenario: Dedicated execution workspace
- **WHEN** the coder starts work on this proposal
- **THEN** the system SHALL provide a dedicated implementation branch and a reusable worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`
