## ADDED Requirements

### Requirement: Build typed `meow-prompt` loader library
The system SHALL implement the approved proposal recorded in OpenSpec change `prompt-loader-a1-p1-build-typed-meow-prompt-loader-library`
and keep the work aligned with this proposal's objective: Create `packages/meow-prompt` with markdown-template parsing, typed direct-import support, builtin raw pipes, requested initial tests, and AGENTS syntax documentation.

#### Scenario: Approved proposal enters execution
- **WHEN** a human approves the "Build typed `meow-prompt` loader library" proposal
- **THEN** the system SHALL queue the proposal into the pooled coding and machine-review workflow

### Requirement: Proposal execution stays isolated
The system SHALL keep proposal execution isolated to the claimed implementation
branch and reusable worktree until human feedback explicitly requests
request-group replanning.

#### Scenario: Dedicated execution workspace
- **WHEN** the coder starts work on this proposal
- **THEN** the system SHALL provide a dedicated implementation branch and a reusable worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`
