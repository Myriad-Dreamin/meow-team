## ADDED Requirements

### Requirement: Flatten, fold, and sort Living Threads sidebar
The system SHALL implement the approved proposal recorded in OpenSpec change `sidebar-threads-a1-p1-flatten-fold-and-sort-living-threads-sidebar`
and keep the work aligned with this proposal's objective: Suggested OpenSpec change seed: `living-threads-a1-p1-flatten-fold-and-sort-sidebar-groups`. Update the left Living Threads sidebar so repository groups render as flat sections instead of bordered containers, each group can be collapsed or expanded without breaking active-thread selection, repository groups and threads are ordered alphabetically with stable tie-breakers, and each thread item uses a three-line layout: title, `Thread <short-id> - <status>`, and `Updated <timestamp>`. Keep scope to the sidebar rendering/data-shaping surfaces plus CSS and targeted regression tests, while preserving existing polling, fallback `No Repository` handling, run/settings tabs, and thread detail behavior.

#### Scenario: Approved proposal enters execution
- **WHEN** a human approves the "Flatten, fold, and sort Living Threads sidebar" proposal
- **THEN** the system SHALL queue the proposal into the pooled coding and machine-review workflow

### Requirement: Proposal execution stays isolated
The system SHALL keep proposal execution isolated to the claimed implementation
branch and reusable worktree until human feedback explicitly requests
request-group replanning.

#### Scenario: Dedicated execution workspace
- **WHEN** the coder starts work on this proposal
- **THEN** the system SHALL provide a dedicated implementation branch and a reusable worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`

### Requirement: Conventional title metadata stays explicit
The system SHALL carry the canonical request/PR title `feat: Flatten, fold, and sort Living Threads sidebar` and conventional-title metadata `feat`
through the materialized OpenSpec artifacts without encoding slash-delimited roadmap/topic scope into `branchPrefix` or OpenSpec change paths.

#### Scenario: Materialized artifacts mirror the approved scope
- **WHEN** planner materializes this proposal
- **THEN** the generated proposal, design, spec, and tasks SHALL reference the canonical request/PR title `feat: Flatten, fold, and sort Living Threads sidebar`
- **AND** the slash-delimited roadmap/topic scope SHALL remain metadata instead of changing the proposal change path `sidebar-threads-a1-p1-flatten-fold-and-sort-living-threads-sidebar`
