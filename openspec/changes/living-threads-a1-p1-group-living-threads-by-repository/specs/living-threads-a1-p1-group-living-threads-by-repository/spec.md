## ADDED Requirements

### Requirement: Group Living Threads by Repository
The system SHALL implement the approved proposal recorded in OpenSpec change `living-threads-a1-p1-group-living-threads-by-repository`
and keep the work aligned with this proposal's objective: Restructure the left-side Living Threads tabs into repository sections, remove the long summary line from each tab card, preserve selection and refresh behavior, and keep threads without a repository visible in a fallback group.

#### Scenario: Approved proposal enters execution
- **WHEN** a human approves the "Group Living Threads by Repository" proposal
- **THEN** the system SHALL queue the proposal into the pooled coding and machine-review workflow

### Requirement: Proposal execution stays isolated
The system SHALL keep proposal execution isolated to the claimed implementation
branch and reusable worktree until human feedback explicitly requests
request-group replanning.

#### Scenario: Dedicated execution workspace
- **WHEN** the coder starts work on this proposal
- **THEN** the system SHALL provide a dedicated implementation branch and a reusable worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`
