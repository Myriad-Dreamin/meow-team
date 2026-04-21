# planner-ignore-paths-a1-p1-respect-ignored-planner-paths-during-openspec Specification

## Purpose

Define the planner materialization isolation capability for the harness so
OpenSpec proposal checks tolerate untracked residue outside the proposal path
while still rejecting tracked or committed unrelated edits.

## Requirements

### Requirement: Planner materialization tolerates untracked residue outside the proposal path

The planner SHALL ignore materialization residue outside the proposal
directory when that residue is not tracked in git and is not part of the
committed path delta produced during proposal materialization.

#### Scenario: Untracked `.codex` residue does not fail materialization

- **WHEN** OpenSpec materialization writes the expected proposal artifacts and
  also leaves `.codex/materializer/session.json` as an untracked planner-side
  path outside the proposal directory
- **THEN** the planner SHALL allow proposal materialization to continue
- **AND** the outside-path validation SHALL not report
  `.codex/materializer/session.json`

### Requirement: Tracked unexpected planner paths still fail isolation

The planner SHALL fail proposal materialization when a path outside the
proposal directory is part of the uncommitted materialization delta and is
tracked in git, even if that path lives under a directory that looks like
untracked residue.

#### Scenario: Tracked `.codex` path still fails isolation

- **WHEN** OpenSpec materialization changes
  `.codex/materializer/session.json` outside the proposal directory and that
  path is tracked in git
- **THEN** the planner SHALL fail the run with the outside-path validation
  error
- **AND** the reported path list SHALL include
  `.codex/materializer/session.json`

### Requirement: Committed unexpected planner paths still fail isolation

The planner SHALL preserve the outside-path validation failure for committed
materialization deltas outside the proposal directory, even when those paths do
not remain as uncommitted worktree residue after the planner commit.

#### Scenario: Committed `README.md` change still fails isolation

- **WHEN** OpenSpec materialization advances planner HEAD with a commit that
  includes `README.md` outside the proposal directory
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
`fix(planner/openspec): limit planner materialization to tracked paths` and
conventional-title metadata `fix(planner/openspec)` through the materialized
OpenSpec artifacts without encoding slash-delimited roadmap/topic scope into
`branchPrefix` or OpenSpec change paths.

#### Scenario: Materialized artifacts mirror approved metadata

- **WHEN** planner materializes this proposal
- **THEN** the generated proposal, design, spec, and tasks SHALL reference the
  canonical request/PR title
  `fix(planner/openspec): limit planner materialization to tracked paths`
- **AND** the slash-delimited roadmap/topic scope SHALL remain metadata instead
  of changing the proposal change path
  `planner-tracked-paths-a1-p1-validate-planner-materialization-with-tracke`
