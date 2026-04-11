## ADDED Requirements

### Requirement: Remove Turbopack and Direct Vite Loading

The system SHALL implement the approved proposal recorded in OpenSpec change `meow-prompt-vite-a1-p1-remove-turbopack-and-direct-vite-loading`
and keep the work aligned with this proposal's objective: Delete the Turbopack-specific `meow-prompt` integration, replace `walkDirectory`-based declaration syncing with Vite-managed loading for `app` and optional `docs`, and update tests/config so supported prompt imports remain typed under the new flow.

#### Scenario: Approved proposal enters execution

- **WHEN** a human approves the "Remove Turbopack and Direct Vite Loading" proposal
- **THEN** the system SHALL queue the proposal into the pooled coding and machine-review workflow

### Requirement: Proposal execution stays isolated

The system SHALL keep proposal execution isolated to the claimed implementation
branch and reusable worktree until human feedback explicitly requests
request-group replanning.

#### Scenario: Dedicated execution workspace

- **WHEN** the coder starts work on this proposal
- **THEN** the system SHALL provide a dedicated implementation branch and a reusable worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`
