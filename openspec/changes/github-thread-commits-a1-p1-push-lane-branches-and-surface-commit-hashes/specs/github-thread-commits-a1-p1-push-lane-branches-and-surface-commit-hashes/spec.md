## ADDED Requirements

### Requirement: Push Lane Branches and Surface Commit Hashes
The system SHALL implement the approved proposal recorded in OpenSpec change `github-thread-commits-a1-p1-push-lane-branches-and-surface-commit-hashes`
and keep the work aligned with this proposal's objective: Push final machine-reviewed lane branches to the configured GitHub remote, persist pushed commit metadata and URLs, and expose per-lane commit hashes clearly in the thread UI with regression coverage.

#### Scenario: Approved proposal enters execution
- **WHEN** a human approves the "Push Lane Branches and Surface Commit Hashes" proposal
- **THEN** the system SHALL queue the proposal into the pooled coding and machine-review workflow

### Requirement: Proposal execution stays isolated
The system SHALL keep proposal execution isolated to the claimed implementation
branch and reusable worktree until human feedback explicitly requests
request-group replanning.

#### Scenario: Dedicated execution workspace
- **WHEN** the coder starts work on this proposal
- **THEN** the system SHALL provide a dedicated implementation branch and a reusable worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`
