## ADDED Requirements

### Requirement: Extract GitHub platform adapter and interfaces
The system SHALL implement the approved proposal recorded in OpenSpec change `git-platform-a1-p1-extract-github-platform-adapter-and-interfaces`
and keep the work aligned with this proposal's objective: Introduce `lib/platform` contracts and a `lib/platform/gh` implementation for GitHub remote normalization, branch publishing, and pull-request synchronization, then rewire harness callers and tests to use that adapter without changing current GitHub behavior.

#### Scenario: Approved proposal enters execution
- **WHEN** a human approves the "Extract GitHub platform adapter and interfaces" proposal
- **THEN** the system SHALL queue the proposal into the pooled coding and machine-review workflow

### Requirement: Proposal execution stays isolated
The system SHALL keep proposal execution isolated to the claimed implementation
branch and reusable worktree until human feedback explicitly requests
request-group replanning.

#### Scenario: Dedicated execution workspace
- **WHEN** the coder starts work on this proposal
- **THEN** the system SHALL provide a dedicated implementation branch and a reusable worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`

### Requirement: Conventional title metadata stays explicit
The system SHALL carry the canonical request/PR title `refactor(platform/gh): Extract GitHub platform adapter and interfaces` and conventional-title metadata `refactor(platform/gh)`
through the materialized OpenSpec artifacts without encoding slash-delimited roadmap/topic scope into `branchPrefix` or OpenSpec change paths.

#### Scenario: Materialized artifacts mirror the approved scope
- **WHEN** planner materializes this proposal
- **THEN** the generated proposal, design, spec, and tasks SHALL reference the canonical request/PR title `refactor(platform/gh): Extract GitHub platform adapter and interfaces`
- **AND** the slash-delimited roadmap/topic scope SHALL remain metadata instead of changing the proposal change path `git-platform-a1-p1-extract-github-platform-adapter-and-interfaces`
