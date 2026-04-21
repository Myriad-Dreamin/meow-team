## ADDED Requirements

### Requirement: Planner materialization respects repository ignore rules
The planner SHALL filter materialization path deltas through repository
`.gitignore` rules before it treats paths outside the proposal directory as
unexpected changes.

#### Scenario: Ignored `.codex` residue does not fail materialization
- **WHEN** OpenSpec materialization writes the expected proposal artifacts and
  also leaves a planner-side path under `.codex/` that matches repository
  ignore rules
- **THEN** the planner SHALL treat the ignored path as allowed residue
- **AND** the proposal materialization SHALL continue as long as no
  non-ignored unexpected paths remain

### Requirement: Non-ignored planner worktree edits still fail
The planner SHALL preserve the existing outside-path failure for unexpected
paths that are outside the proposal directory and do not match repository
ignore rules.

#### Scenario: README change still fails isolation
- **WHEN** OpenSpec materialization changes `README.md` outside the proposal
  directory and that path does not match repository ignore rules
- **THEN** the planner SHALL fail the run with the outside-path validation
  error
- **AND** the reported path list SHALL include `README.md`

### Requirement: Proposal execution stays isolated
The system SHALL keep proposal execution isolated to the claimed implementation
branch and reusable worktree until human feedback explicitly requests
request-group replanning.

#### Scenario: Dedicated execution workspace
- **WHEN** the coder starts work on this proposal
- **THEN** the system SHALL provide a dedicated implementation branch and a
  reusable worktree from
  `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`

### Requirement: Conventional title metadata stays explicit
The system SHALL carry the canonical request/PR title
`fix(openspec/planner): honor ignored planner paths` and conventional-title
metadata `fix(openspec/planner)` through the materialized OpenSpec artifacts
without encoding slash-delimited roadmap/topic scope into `branchPrefix` or
OpenSpec change paths.

#### Scenario: Materialized artifacts mirror approved metadata
- **WHEN** planner materializes this proposal
- **THEN** the generated proposal, design, spec, and tasks SHALL reference the
  canonical request/PR title
  `fix(openspec/planner): honor ignored planner paths`
- **AND** the slash-delimited roadmap/topic scope SHALL remain metadata instead
  of changing the proposal change path
  `planner-ignore-paths-a1-p1-respect-ignored-planner-paths-during-openspec`
