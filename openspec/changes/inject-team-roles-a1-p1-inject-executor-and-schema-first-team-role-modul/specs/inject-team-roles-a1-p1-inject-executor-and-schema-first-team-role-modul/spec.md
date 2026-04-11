## ADDED Requirements

### Requirement: Inject executor and schema-first team role modules
The system SHALL implement the approved proposal recorded in OpenSpec change `inject-team-roles-a1-p1-inject-executor-and-schema-first-team-role-modul`
and keep the work aligned with this proposal's objective: Extract the CLI executor plus request-title, planner, coder, and reviewer modules; wire them into `runTeam` and dispatch with production defaults; and add deterministic `runTeam` tests using mock executor and mock role functions.

#### Scenario: Approved proposal enters execution
- **WHEN** a human approves the "Inject executor and schema-first team role modules" proposal
- **THEN** the system SHALL queue the proposal into the pooled coding and machine-review workflow

### Requirement: Proposal execution stays isolated
The system SHALL keep proposal execution isolated to the claimed implementation
branch and reusable worktree until human feedback explicitly requests
request-group replanning.

#### Scenario: Dedicated execution workspace
- **WHEN** the coder starts work on this proposal
- **THEN** the system SHALL provide a dedicated implementation branch and a reusable worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`
