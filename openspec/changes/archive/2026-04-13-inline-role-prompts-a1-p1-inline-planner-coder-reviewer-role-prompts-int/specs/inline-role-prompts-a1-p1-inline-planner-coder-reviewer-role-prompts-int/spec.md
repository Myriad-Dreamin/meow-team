## ADDED Requirements

### Requirement: Inline planner/coder/reviewer role prompts into `lib/team/roles`
The system SHALL implement the approved proposal recorded in OpenSpec change `inline-role-prompts-a1-p1-inline-planner-coder-reviewer-role-prompts-int`
and keep the work aligned with this proposal's objective: Consolidate the role system instructions into the existing `lib/team/roles/*.prompt.md` templates, remove the duplicate `prompts/roles` registry/loading path, and update metadata, docs, and validation so the harness keeps the same workflow behavior with a single prompt source.

#### Scenario: Approved proposal enters execution
- **WHEN** a human approves the "Inline planner/coder/reviewer role prompts into `lib/team/roles`" proposal
- **THEN** the system SHALL queue the proposal into the pooled coding and machine-review workflow

### Requirement: Proposal execution stays isolated
The system SHALL keep proposal execution isolated to the claimed implementation
branch and reusable worktree until human feedback explicitly requests
request-group replanning.

#### Scenario: Dedicated execution workspace
- **WHEN** the coder starts work on this proposal
- **THEN** the system SHALL provide a dedicated implementation branch and a reusable worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`

### Requirement: Conventional title metadata stays explicit
The system SHALL carry the canonical request/PR title `refactor(team/roles): Inline planner/coder/reviewer role prompts into` and conventional-title metadata `refactor(team/roles)`
through the materialized OpenSpec artifacts without encoding slash-delimited roadmap/topic scope into `branchPrefix` or OpenSpec change paths.

#### Scenario: Materialized artifacts mirror the approved scope
- **WHEN** planner materializes this proposal
- **THEN** the generated proposal, design, spec, and tasks SHALL reference the canonical request/PR title `refactor(team/roles): Inline planner/coder/reviewer role prompts into`
- **AND** the slash-delimited roadmap/topic scope SHALL remain metadata instead of changing the proposal change path `inline-role-prompts-a1-p1-inline-planner-coder-reviewer-role-prompts-int`
