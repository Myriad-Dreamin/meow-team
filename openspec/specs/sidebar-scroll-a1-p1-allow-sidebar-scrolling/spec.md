# sidebar-scroll-a1-p1-allow-sidebar-scrolling Specification

## Purpose
Define the workspace-sidebar overflow capability so the left navigation rail
stays height-constrained and scrolls independently beneath its header without
changing thread interactions or responsive stacking behavior.

## Requirements
### Requirement: Allow sidebar scrolling
The system SHALL implement the approved proposal recorded in OpenSpec change
`sidebar-scroll-a1-p1-allow-sidebar-scrolling` and keep the work aligned with
this proposal's objective: fix the left workspace sidebar overflow behavior by
constraining the shell and sidebar height chain, making the navigation list
scroll independently below the sidebar header when content exceeds the
available height, and preserving current thread interactions plus responsive
stacking behavior.

#### Scenario: Approved proposal enters execution
- **WHEN** a human approves the "Allow sidebar scrolling" proposal
- **THEN** the system SHALL queue the proposal into the pooled coding and
  machine-review workflow

### Requirement: Proposal execution stays isolated
The system SHALL keep proposal execution isolated to the claimed
implementation branch and reusable worktree until human feedback explicitly
requests request-group replanning.

#### Scenario: Dedicated execution workspace
- **WHEN** the coder starts work on this proposal
- **THEN** the system SHALL provide a dedicated implementation branch and a
  reusable worktree from
  `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`

### Requirement: Conventional title metadata stays explicit
The system SHALL carry the canonical request/PR title
`fix(ui/sidebar): enable sidebar scrolling` and conventional-title metadata
`fix(ui/sidebar)` through the materialized OpenSpec artifacts without encoding
slash-delimited roadmap/topic scope into `branchPrefix` or OpenSpec change
paths.

#### Scenario: Materialized artifacts mirror the approved scope
- **WHEN** planner materializes this proposal
- **THEN** the generated proposal, design, spec, and tasks SHALL reference the
  canonical request/PR title `fix(ui/sidebar): enable sidebar scrolling`
- **AND** the slash-delimited roadmap/topic scope SHALL remain metadata instead
  of changing the proposal change path
  `sidebar-scroll-a1-p1-allow-sidebar-scrolling`
