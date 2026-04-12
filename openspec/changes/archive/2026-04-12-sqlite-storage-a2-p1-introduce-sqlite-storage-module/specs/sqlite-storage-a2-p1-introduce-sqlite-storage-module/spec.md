## ADDED Requirements

### Requirement: Introduce SQLite Storage Module
The system SHALL implement the approved proposal recorded in OpenSpec change `sqlite-storage-a2-p1-introduce-sqlite-storage-module`
and keep the work aligned with this proposal's objective: Replace the JSON-backed team thread store with a server-only official `node:sqlite` storage module using handwritten parameterized SQL, preserve existing history behavior and stored data through a pragmatic migration path, document metadata/migrations/security/performance in `docs/storage.md`, and verify schema migration behavior with SQLite tests that use `:memory:`.

#### Scenario: Approved proposal enters execution
- **WHEN** a human approves the "Introduce SQLite Storage Module" proposal
- **THEN** the system SHALL queue the proposal into the pooled coding and machine-review workflow

### Requirement: Proposal execution stays isolated
The system SHALL keep proposal execution isolated to the claimed implementation
branch and reusable worktree until human feedback explicitly requests
request-group replanning.

#### Scenario: Dedicated execution workspace
- **WHEN** the coder starts work on this proposal
- **THEN** the system SHALL provide a dedicated implementation branch and a reusable worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`

### Requirement: Conventional title metadata stays explicit
The system SHALL carry the canonical request/PR title `feat(storage): Introduce SQLite Storage Module` and conventional-title metadata `feat(storage)`
through the materialized OpenSpec artifacts without encoding slash-delimited roadmap/topic scope into `branchPrefix` or OpenSpec change paths.

#### Scenario: Materialized artifacts mirror the approved scope
- **WHEN** planner materializes this proposal
- **THEN** the generated proposal, design, spec, and tasks SHALL reference the canonical request/PR title `feat(storage): Introduce SQLite Storage Module`
- **AND** the slash-delimited roadmap/topic scope SHALL remain metadata instead of changing the proposal change path `sqlite-storage-a2-p1-introduce-sqlite-storage-module`
