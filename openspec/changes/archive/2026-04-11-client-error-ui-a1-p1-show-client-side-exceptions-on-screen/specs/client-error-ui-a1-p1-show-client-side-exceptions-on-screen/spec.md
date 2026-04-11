## ADDED Requirements

### Requirement: Show Client-Side Exceptions On Screen

The system SHALL implement the approved proposal recorded in OpenSpec change `client-error-ui-a1-p1-show-client-side-exceptions-on-screen`
and keep the work aligned with this proposal's objective: Materialize one OpenSpec change that adds App Router error fallbacks plus a root-level client exception reporter, renders readable on-screen exception details for mobile debugging, keeps verbose stacks development-oriented, and validates the result with `pnpm lint` and `pnpm build`.

#### Scenario: Approved proposal enters execution

- **WHEN** a human approves the "Show Client-Side Exceptions On Screen" proposal
- **THEN** the system SHALL queue the proposal into the pooled coding and machine-review workflow

### Requirement: Proposal execution stays isolated

The system SHALL keep proposal execution isolated to the claimed implementation
branch and reusable worktree until human feedback explicitly requests
request-group replanning.

#### Scenario: Dedicated execution workspace

- **WHEN** the coder starts work on this proposal
- **THEN** the system SHALL provide a dedicated implementation branch and a reusable worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`
