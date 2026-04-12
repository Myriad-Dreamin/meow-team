## ADDED Requirements

### Requirement: Extract harness role prompt templates
The system SHALL implement the approved proposal recorded in OpenSpec change `role-prompts-a1-p1-extract-harness-role-prompt-templates`
and keep the work aligned with this proposal's objective: Move the inline prompt construction in `lib/team/roles` into colocated `meow-prompt` markdown files, preserve the separate `prompts/roles` role definitions, and extend typed prompt-import support plus regression coverage so the new templates pass format, lint, test, typecheck, and build validation.

#### Scenario: Approved proposal enters execution
- **WHEN** a human approves the "Extract harness role prompt templates" proposal
- **THEN** the system SHALL queue the proposal into the pooled coding and machine-review workflow

### Requirement: Proposal execution stays isolated
The system SHALL keep proposal execution isolated to the claimed implementation
branch and reusable worktree until human feedback explicitly requests
request-group replanning.

#### Scenario: Dedicated execution workspace
- **WHEN** the coder starts work on this proposal
- **THEN** the system SHALL provide a dedicated implementation branch and a reusable worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`

### Requirement: Conventional title metadata stays explicit
The system SHALL carry the canonical request/PR title `refactor(team/roles): Extract harness role prompt templates` and conventional-title metadata `refactor(team/roles)`
through the materialized OpenSpec artifacts without encoding slash-delimited roadmap/topic scope into `branchPrefix` or OpenSpec change paths.

#### Scenario: Materialized artifacts mirror the approved scope
- **WHEN** planner materializes this proposal
- **THEN** the generated proposal, design, spec, and tasks SHALL reference the canonical request/PR title `refactor(team/roles): Extract harness role prompt templates`
- **AND** the slash-delimited roadmap/topic scope SHALL remain metadata instead of changing the proposal change path `role-prompts-a1-p1-extract-harness-role-prompt-templates`
